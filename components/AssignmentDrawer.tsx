import React, { useEffect, useMemo, useState } from 'react';
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

const drawerContainerStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'grid',
  gridTemplateColumns: '1fr min(420px, 92vw)',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 12, opacity: 0.75 }}>{label}</span>
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
    <div style={drawerContainerStyle}>
      <div onClick={onClose} style={{ background: 'rgba(0,0,0,0.35)' }} />
      <div
        style={{
          background: '#fff',
          height: '100%',
          boxShadow: '-10px 0 30px rgba(0,0,0,0.2)',
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
        }}
      >
        <div
          style={{
            padding: 14,
            borderBottom: '1px solid rgba(0,0,0,0.10)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontWeight: 800 }}>Assignment</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Conversation: {conversation.id.slice(0, 8)}</div>
          </div>
          <button onClick={onClose} style={{ padding: '8px 10px' }}>Close</button>
        </div>

        <div style={{ padding: 14, display: 'grid', gap: 14, overflow: 'auto' }}>
          {error ? (
            <div
              style={{
                border: '1px solid rgba(200,0,0,0.35)',
                background: 'rgba(200,0,0,0.08)',
                padding: 12,
                borderRadius: 10,
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setTab('assign')}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid rgba(0,0,0,0.15)',
                background: tab === 'assign' ? 'rgba(0,0,0,0.06)' : 'white',
              }}
            >
              Manual Assign
            </button>
            <button
              onClick={() => setTab('routing')}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid rgba(0,0,0,0.15)',
                background: tab === 'routing' ? 'rgba(0,0,0,0.06)' : 'white',
              }}
            >
              Run Routing
            </button>
          </div>

          {tab === 'assign' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <Field label="Assignment Type">
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as AssignmentMode)}
                  style={{ padding: '10px 12px' }}
                >
                  <option value="ai">AI Employee</option>
                  <option value="agent">Human Agent</option>
                  <option value="none">Unassigned</option>
                </select>
              </Field>

              {mode === 'ai' ? (
                <Field label="AI Key">
                  <select value={aiKey} onChange={(e) => setAiKey(e.target.value)} style={{ padding: '10px 12px' }}>
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
                      style={{ padding: '10px 12px' }}
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
                      style={{ padding: '10px 12px' }}
                    />
                  </Field>
                </>
              ) : null}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveAssignment} disabled={!canSave || saving} style={{ padding: '10px 12px', flex: 1 }}>
                  {saving ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 13, opacity: 0.85 }}>
                Force-run active routing rules and re-evaluate assignment for this conversation.
              </div>
              <button onClick={forceRunRouting} disabled={routing} style={{ padding: '10px 12px' }}>
                {routing ? 'Routing...' : 'Force Run Routing'}
              </button>
            </div>
          )}
        </div>

        <div
          style={{
            padding: 14,
            borderTop: '1px solid rgba(0,0,0,0.10)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Tenant: {tenantId ? tenantId.slice(0, 8) : 'n/a'}
          </div>
          <button onClick={onClose} style={{ padding: '8px 10px' }}>Done</button>
        </div>
      </div>
    </div>
  );
}
