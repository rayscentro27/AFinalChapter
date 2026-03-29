import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Route, UserRound, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { runInboxRouting } from '../lib/inboxRoutingClient';

type AssignmentMode = 'ai' | 'agent' | 'none';

type AssignmentConversation = {
  id: string;
  assignee_type?: 'contact' | 'agent' | 'ai' | null;
  assignee_user_id?: string | null;
  assignee_ai_key?: string | null;
};

type AgentProfile = {
  user_id: string;
  display_name: string | null;
};

type TenantMembershipAgentRow = {
  user_id: string;
  role: string | null;
};

type AssignmentDrawerProps = {
  open: boolean;
  onClose: () => void;
  tenantId?: string;
  conversation: AssignmentConversation | null;
  onUpdated?: (conversation: AssignmentConversation) => void;
};

const AI_KEYS = [
  'CONCIERGE',
  'LEX_LEDGER',
  'SENTINEL_SCOUT',
  'NEXUS_ANALYST',
  'NOVA_GRANT',
  'SUCCESS_NARRATOR',
];

const ASSIGNABLE_MEMBER_ROLES = new Set(['owner', 'admin', 'agent', 'sales', 'supervisor', 'member']);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">{label}</span>
      {children}
    </label>
  );
}

async function loadAgentProfilesByIds(userIds: string[]): Promise<AgentProfile[]> {
  if (userIds.length === 0) return [];

  let data: any[] | null = null;
  let error: any = null;

  ({ data, error } = await supabase
    .from('profiles')
    .select('user_id,display_name,full_name')
    .in('user_id', userIds));

  if (error && String(error.message || '').toLowerCase().includes('display_name')) {
    ({ data, error } = await supabase
      .from('profiles')
      .select('user_id,full_name')
      .in('user_id', userIds));
  }

  if (error || !data) return [];

  return (data || []).map((row: any) => ({
    user_id: String(row.user_id),
    display_name: row.display_name || row.full_name || null,
  }));
}

export default function AssignmentDrawer({
  open,
  onClose,
  tenantId,
  conversation,
  onUpdated,
}: AssignmentDrawerProps) {
  const [tab, setTab] = useState<'assign' | 'routing'>('assign');
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [routing, setRouting] = useState(false);
  const [error, setError] = useState('');

  const [mode, setMode] = useState<AssignmentMode>('ai');
  const [aiKey, setAiKey] = useState<string>(AI_KEYS[0]);
  const [agentUserId, setAgentUserId] = useState('');

  useEffect(() => {
    if (!open || !conversation) return;

    setError('');
    if (conversation.assignee_type === 'agent' && conversation.assignee_user_id) {
      setMode('agent');
      setAgentUserId(conversation.assignee_user_id);
      return;
    }

    if (conversation.assignee_type === 'ai') {
      setMode('ai');
      setAiKey(conversation.assignee_ai_key || AI_KEYS[0]);
      setAgentUserId('');
      return;
    }

    setMode('none');
    setAgentUserId('');
    setAiKey(AI_KEYS[0]);
  }, [open, conversation]);

  useEffect(() => {
    if (!open || !tenantId) return;
    let active = true;

    const loadAgents = async () => {
      setLoadingAgents(true);
      setError('');
      try {
        const { data: memberships, error: membershipsError } = await supabase
          .from('tenant_memberships')
          .select('user_id,role')
          .eq('tenant_id', tenantId);

        if (membershipsError) throw membershipsError;

        const scopedUserIds = Array.from(
          new Set(
            ((memberships || []) as TenantMembershipAgentRow[])
              .filter((row) => ASSIGNABLE_MEMBER_ROLES.has(String(row.role || '').toLowerCase()))
              .map((row) => row.user_id)
              .filter(Boolean)
          )
        );

        if (scopedUserIds.length === 0) {
          if (active) setAgents([]);
          return;
        }

        const profiles = await loadAgentProfilesByIds(scopedUserIds);
        const profileById = new Map(profiles.map((row) => [row.user_id, row]));

        const nextAgents = scopedUserIds
          .map((userId) => {
            const profile = profileById.get(userId);
            return {
              user_id: userId,
              display_name: profile?.display_name || null,
            };
          })
          .sort((a, b) => {
            const left = (a.display_name || a.user_id).toLowerCase();
            const right = (b.display_name || b.user_id).toLowerCase();
            return left.localeCompare(right);
          });

        if (active) setAgents(nextAgents);
      } catch (e: any) {
        if (active) {
          setAgents([]);
          setError(String(e?.message || e));
        }
      } finally {
        if (active) setLoadingAgents(false);
      }
    };

    void loadAgents();

    return () => {
      active = false;
    };
  }, [open, tenantId]);

  const canSave = useMemo(() => {
    if (!tenantId || !conversation?.id) return false;
    if (mode === 'agent') return agentUserId.trim().length > 0;
    if (mode === 'ai') return aiKey.trim().length > 0;
    return true;
  }, [tenantId, conversation?.id, mode, agentUserId, aiKey]);

  async function refreshConversation() {
    if (!tenantId || !conversation?.id) throw new Error('Missing tenant or conversation context.');

    const { data, error: convError } = await supabase
      .from('conversations')
      .select('id, assignee_type, assignee_user_id, assignee_ai_key')
      .eq('tenant_id', tenantId)
      .eq('id', conversation.id)
      .single();

    if (convError) throw convError;
    return data as AssignmentConversation;
  }

  async function saveAssignment() {
    if (!canSave || !tenantId || !conversation?.id) return;

    setSaving(true);
    setError('');

    try {
      const patch =
        mode === 'agent'
          ? {
              assignee_type: 'agent',
              assignee_user_id: agentUserId.trim(),
              assignee_ai_key: null,
            }
          : mode === 'ai'
            ? {
                assignee_type: 'ai',
                assignee_user_id: null,
                assignee_ai_key: aiKey.trim(),
              }
            : {
                assignee_type: 'agent',
                assignee_user_id: null,
                assignee_ai_key: null,
              };

      const { data, error: updateError } = await supabase
        .from('conversations')
        .update(patch)
        .eq('tenant_id', tenantId)
        .eq('id', conversation.id)
        .select('id, assignee_type, assignee_user_id, assignee_ai_key')
        .single();

      if (updateError) throw updateError;
      onUpdated?.(data as AssignmentConversation);
      onClose();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function forceRunRouting() {
    if (!tenantId || !conversation?.id) return;

    setRouting(true);
    setError('');

    try {
      const result = await runInboxRouting({
        tenant_id: tenantId,
        conversation_id: conversation.id,
        force: true,
      });

      if (!result.ok) throw new Error(String(result.error || 'Routing failed'));

      const refreshed = await refreshConversation();
      onUpdated?.(refreshed);
      onClose();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRouting(false);
    }
  }

  if (!open || !conversation) return null;

  return (
    <div className="fixed inset-0 z-50 grid grid-cols-[1fr_min(420px,92vw)]">
      <div onClick={onClose} className="bg-[#203266]/18 backdrop-blur-md" />
      <div
        className="grid h-full grid-rows-[auto_1fr_auto] border-l border-[#DCE7FA] bg-[linear-gradient(180deg,#ffffff_0%,#f5f9ff_100%)] shadow-[0_24px_64px_rgba(41,72,138,0.16)]"
      >
        <div
          className="flex items-center justify-between border-b border-[#E4ECF8] bg-white/80 px-5 py-5 backdrop-blur-md"
        >
          <div className="grid gap-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6C82AE]">Routing workspace</p>
            <div className="text-[1.65rem] font-black tracking-tight text-[#203266]">Assignment</div>
            <div className="text-xs text-[#6C82AE]">Conversation: {conversation.id.slice(0, 8)}</div>
          </div>
          <button onClick={onClose} className="inline-flex items-center gap-2 rounded-xl border border-[#DCE7FA] bg-[#F4F8FF] px-3 py-2 text-xs font-black uppercase tracking-widest text-[#315FD0]">
            <X size={14} /> Close
          </button>
        </div>

        <div className="grid gap-4 overflow-auto p-5">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <strong>Error:</strong> {error}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1 shadow-inner">
            <button
              onClick={() => setTab('assign')}
              className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-all ${tab === 'assign' ? 'bg-white text-[#315FD0] shadow-sm' : 'text-slate-500'}`}
            >
              Manual Assign
            </button>
            <button
              onClick={() => setTab('routing')}
              className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-all ${tab === 'routing' ? 'bg-white text-[#315FD0] shadow-sm' : 'text-slate-500'}`}
            >
              Run Routing
            </button>
          </div>

          {tab === 'assign' ? (
            <div className="grid gap-4">
              <div className="rounded-2xl border border-[#E4ECF8] bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#6C82AE]">
                  {mode === 'ai' ? <Bot size={13} /> : <UserRound size={13} />} Current assignment mode
                </div>
                <p className="mt-2 text-sm font-semibold text-[#203266]">
                  {mode === 'ai' ? 'AI employee routing is active.' : mode === 'agent' ? 'Human agent assignment is active.' : 'Conversation is currently unassigned.'}
                </p>
              </div>

              <Field label="Assignment Type">
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as AssignmentMode)}
                  className="rounded-xl border border-slate-200 bg-[#F8FBFF] px-3 py-3 text-sm text-[#203266]"
                >
                  <option value="ai">AI Employee</option>
                  <option value="agent">Human Agent</option>
                  <option value="none">Unassigned</option>
                </select>
              </Field>

              {mode === 'ai' ? (
                <Field label="AI Key">
                  <select value={aiKey} onChange={(e) => setAiKey(e.target.value)} className="rounded-xl border border-slate-200 bg-[#F8FBFF] px-3 py-3 text-sm text-[#203266]">
                    {AI_KEYS.map((key) => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                </Field>
              ) : null}

              {mode === 'agent' ? (
                <>
                  <Field label="Agent (Tenant Scoped)">
                    <select
                      value={agentUserId}
                      onChange={(e) => setAgentUserId(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-[#F8FBFF] px-3 py-3 text-sm text-[#203266]"
                      disabled={loadingAgents}
                    >
                      <option value="">{loadingAgents ? 'Loading...' : 'Select an agent'}</option>
                      {agents.map((agent) => (
                        <option key={agent.user_id} value={agent.user_id}>
                          {agent.display_name || agent.user_id}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Or paste Agent User ID (UUID)">
                    <input
                      value={agentUserId}
                      onChange={(e) => setAgentUserId(e.target.value)}
                      placeholder="auth.users UUID"
                      className="rounded-xl border border-slate-200 bg-[#F8FBFF] px-3 py-3 text-sm text-[#203266]"
                    />
                  </Field>
                </>
              ) : null}

              <div className="flex gap-3">
                <button onClick={saveAssignment} disabled={!canSave || saving} className="flex-1 rounded-xl bg-[linear-gradient(135deg,#2E58E6,#4D8BFF)] px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-[0_14px_28px_rgba(46,88,230,0.20)] disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="rounded-2xl border border-[#E4ECF8] bg-white p-4 shadow-sm">
                <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#6C82AE]"><Route size={13} /> Routing engine</div>
                <div className="mt-2 text-sm text-[#203266]">
                Force-run active routing rules and re-evaluate assignment for this conversation.
                </div>
              </div>
              <div className="text-sm text-slate-600">
                Current conversation will be re-scored against the active queue and assignment rules.
              </div>
              <button onClick={forceRunRouting} disabled={routing} className="rounded-xl border border-[#D5E4FF] bg-[#EEF4FF] px-4 py-3 text-xs font-black uppercase tracking-widest text-[#315FD0] disabled:opacity-50">
                {routing ? 'Routing...' : 'Force Run Routing'}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#E4ECF8] bg-white/80 px-5 py-4 text-xs text-[#6C82AE]">
          <div>
            Tenant: {tenantId ? tenantId.slice(0, 8) : 'n/a'}
          </div>
          <button onClick={onClose} className="rounded-xl border border-[#DCE7FA] bg-[#F4F8FF] px-3 py-2 text-xs font-black uppercase tracking-widest text-[#315FD0]">Done</button>
        </div>
      </div>
    </div>
  );
}
