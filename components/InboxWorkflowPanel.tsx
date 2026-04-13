import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Users, Tag, Mail, Clock3 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

type WorkflowStatus = 'new' | 'active' | 'waiting' | 'qualified' | 'closed';
type WorkflowThreadType = 'lead' | 'support' | 'client' | 'general';
type AiMode = 'off' | 'suggest_only';
type ChannelType = 'messenger' | 'instagram_dm' | 'nexus_chat' | 'future_email';

type WorkflowConversationRow = {
  id: string;
  tenant_id?: string | null;
  thread_status?: WorkflowStatus | null;
  workflow_thread_type?: WorkflowThreadType | null;
  owner_user_id?: string | null;
  ai_mode?: AiMode | null;
  channel_type?: ChannelType | null;
  priority?: number | null;
  status?: string | null;
  thread_type?: string | null;
  assignee_type?: 'contact' | 'agent' | 'ai' | null;
  assignee_user_id?: string | null;
  assignee_ai_key?: string | null;
  assigned_staff_user_id?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  updated_at?: string | null;
};

type AgentOption = {
  user_id: string;
  display_name: string | null;
};

const WORKFLOW_STATUSES: Array<{ value: WorkflowStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'active', label: 'Active' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'closed', label: 'Closed' },
];

const WORKFLOW_TYPES: Array<{ value: WorkflowThreadType; label: string }> = [
  { value: 'lead', label: 'Lead' },
  { value: 'support', label: 'Support' },
  { value: 'client', label: 'Client' },
  { value: 'general', label: 'General' },
];

const AI_MODES: Array<{ value: AiMode; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'suggest_only', label: 'Suggest Only' },
];

const CHANNEL_LABELS: Record<ChannelType, string> = {
  messenger: 'Facebook Messenger',
  instagram_dm: 'Instagram DM',
  nexus_chat: 'Portal Chat',
  future_email: 'Future Email',
};

const OWNER_ROLES = new Set(['owner', 'super_admin', 'admin', 'supervisor', 'agent', 'sales', 'salesperson', 'member']);

function formatTimestamp(value?: string | null) {
  if (!value) return 'n/a';
  const ts = new Date(value);
  if (Number.isNaN(ts.getTime())) return 'n/a';
  return ts.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function deriveThreadStatus(row: Partial<WorkflowConversationRow>): WorkflowStatus {
  const value = String(row.thread_status || '').toLowerCase();
  if (value === 'new' || value === 'active' || value === 'waiting' || value === 'qualified' || value === 'closed') return value;

  const legacy = String(row.status || '').toLowerCase();
  if (legacy === 'closed') return 'closed';
  if (legacy === 'pending_client') return 'waiting';
  if (legacy === 'pending' || legacy === 'pending_staff' || legacy === 'escalated' || legacy === 'open') return 'active';
  return 'new';
}

function deriveWorkflowType(row: Partial<WorkflowConversationRow>): WorkflowThreadType {
  const value = String(row.workflow_thread_type || '').toLowerCase();
  if (value === 'lead' || value === 'support' || value === 'client' || value === 'general') return value;
  if (String(row.thread_type || '').toLowerCase() === 'client_portal') return 'client';
  return 'general';
}

function deriveAiMode(row: Partial<WorkflowConversationRow>): AiMode {
  const value = String(row.ai_mode || '').toLowerCase();
  if (value === 'off' || value === 'suggest_only') return value;
  if (row.assignee_type === 'ai' || String(row.assignee_ai_key || '').trim()) return 'suggest_only';
  return 'off';
}

function deriveEffectiveOwner(row?: Partial<WorkflowConversationRow> | null): string {
  if (!row) return '';
  return String(row.owner_user_id || row.assigned_staff_user_id || row.assignee_user_id || '').trim();
}

function statusTone(status: WorkflowStatus) {
  if (status === 'new') return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  if (status === 'active') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'waiting') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'qualified') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

async function loadOwnerOptions(tenantId: string) {
  const { data: memberships, error: membershipError } = await supabase
    .from('tenant_memberships')
    .select('user_id, role')
    .eq('tenant_id', tenantId);

  if (membershipError) throw membershipError;

  const eligibleIds = Array.from(
    new Set(
      ((memberships || []) as Array<{ user_id: string; role: string | null }>)
        .filter((row) => OWNER_ROLES.has(String(row.role || '').toLowerCase()))
        .map((row) => row.user_id)
        .filter(Boolean)
    )
  );

  if (!eligibleIds.length) return [] as AgentOption[];

  let profileRows: Array<{ user_id: string; display_name?: string | null; full_name?: string | null }> = [];
  let profileError: any = null;

  const profileSelectAll = await supabase
    .from('profiles')
    .select('user_id, display_name, full_name')
    .in('user_id', eligibleIds);
  profileRows = profileSelectAll.data ?? [];
  profileError = profileSelectAll.error;

  if (profileError && String(profileError.message || '').toLowerCase().includes('display_name')) {
    const profileSelectFullName = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', eligibleIds);
    profileRows = profileSelectFullName.data ?? [];
    profileError = profileSelectFullName.error;
  }

  if (profileError && String(profileError.message || '').toLowerCase().includes('full_name')) {
    const profileSelectDisplayName = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', eligibleIds);
    profileRows = profileSelectDisplayName.data ?? [];
    profileError = profileSelectDisplayName.error;
  }

  if (profileError) throw profileError;

  const profileMap = new Map<string, string | null>();
  for (const row of profileRows || []) {
    profileMap.set(String(row.user_id), row.display_name || row.full_name || null);
  }

  return eligibleIds
    .map((userId) => ({
      user_id: userId,
      display_name: profileMap.get(userId) || null,
    }))
    .sort((a, b) => {
      const left = (a.display_name || a.user_id).toLowerCase();
      const right = (b.display_name || b.user_id).toLowerCase();
      return left.localeCompare(right);
    });
}

export default function InboxWorkflowPanel({
  tenantId,
  conversationId,
}: {
  tenantId?: string | null;
  conversationId?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [row, setRow] = useState<WorkflowConversationRow | null>(null);
  const [owners, setOwners] = useState<AgentOption[]>([]);

  const [threadStatus, setThreadStatus] = useState<WorkflowStatus>('new');
  const [workflowThreadType, setWorkflowThreadType] = useState<WorkflowThreadType>('general');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [aiMode, setAiMode] = useState<AiMode>('off');
  const [priority, setPriority] = useState<number>(3);

  const channelLabel = useMemo(() => {
    const channel = String(row?.channel_type || 'nexus_chat') as ChannelType;
    return CHANNEL_LABELS[channel] || CHANNEL_LABELS.nexus_chat;
  }, [row?.channel_type]);

  const effectiveOwnerUserId = useMemo(() => deriveEffectiveOwner(row), [row]);
  const hasLegacyOwner = Boolean(row && !row.owner_user_id && (row.assigned_staff_user_id || row.assignee_user_id));

  useEffect(() => {
    if (!tenantId) {
      setOwners([]);
      return;
    }

    let active = true;
    void loadOwnerOptions(String(tenantId))
      .then((next) => {
        if (active) setOwners(next);
      })
      .catch((loadError) => {
        if (active) {
          console.warn('InboxWorkflowPanel: owner load failed', loadError);
          setOwners([]);
        }
      });

    return () => {
      active = false;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !conversationId) {
      setRow(null);
      setThreadStatus('new');
      setWorkflowThreadType('general');
      setOwnerUserId('');
      setAiMode('off');
      setPriority(3);
      return;
    }

    let active = true;
    const workflowSelect = 'id,tenant_id,thread_status,workflow_thread_type,owner_user_id,ai_mode,channel_type,priority,status,thread_type,assignee_type,assignee_user_id,assignee_ai_key,assigned_staff_user_id,last_inbound_at,last_outbound_at,updated_at';
    const legacySelect = 'id,tenant_id,priority,status,thread_type,assignee_type,assignee_user_id,assignee_ai_key,assigned_staff_user_id,last_inbound_at,last_outbound_at,updated_at';

    const loadConversation = async () => {
      let query: any = supabase
        .from('conversations')
        .select(workflowSelect)
        .eq('tenant_id', tenantId)
        .eq('id', conversationId)
        .limit(1);

      let data: WorkflowConversationRow | null = null;
      let error: any = null;

      ({ data, error } = await query.maybeSingle());

      if (error && String(error.message || '').toLowerCase().includes('column')) {
        const fallback = await supabase
          .from('conversations')
          .select(legacySelect)
          .eq('tenant_id', tenantId)
          .eq('id', conversationId)
          .limit(1)
          .maybeSingle();
        data = (fallback.data as WorkflowConversationRow | null) || null;
        error = fallback.error;
      }

      if (error) {
        console.error('InboxWorkflowPanel: failed to load conversation', error.message);
        return;
      }

      const nextRow: WorkflowConversationRow | null = data
        ? {
            ...data,
            thread_status: deriveThreadStatus(data),
            workflow_thread_type: deriveWorkflowType(data),
            owner_user_id: data.owner_user_id || data.assigned_staff_user_id || data.assignee_user_id || null,
            ai_mode: deriveAiMode(data),
            channel_type: (data.channel_type as ChannelType) || 'nexus_chat',
            priority: typeof data.priority === 'number' ? Number(data.priority) : 3,
          }
        : null;

      if (!active) return;
      setRow(nextRow);
      setThreadStatus(nextRow?.thread_status || 'new');
      setWorkflowThreadType(nextRow?.workflow_thread_type || 'general');
      setOwnerUserId(deriveEffectiveOwner(nextRow || {}));
      setAiMode(nextRow?.ai_mode || 'off');
      setPriority(typeof nextRow?.priority === 'number' ? Number(nextRow.priority) : 3);
    };

    void loadConversation();

    const channel = supabase
      .channel(`inbox-workflow-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${conversationId}` },
        (payload) => {
          const updated = (payload as any).new as WorkflowConversationRow;
          if (!updated) return;
          const nextRow = {
            ...updated,
            thread_status: deriveThreadStatus(updated),
            workflow_thread_type: deriveWorkflowType(updated),
            owner_user_id: updated.owner_user_id || updated.assigned_staff_user_id || updated.assignee_user_id || null,
            ai_mode: deriveAiMode(updated),
            channel_type: (updated.channel_type as ChannelType) || 'nexus_chat',
            priority: typeof updated.priority === 'number' ? Number(updated.priority) : 3,
          };

          if (!active) return;
          setRow(nextRow);
          setThreadStatus(nextRow.thread_status || 'new');
          setWorkflowThreadType(nextRow.workflow_thread_type || 'general');
          setOwnerUserId(deriveEffectiveOwner(nextRow));
          setAiMode(nextRow.ai_mode || 'off');
          setPriority(typeof nextRow.priority === 'number' ? Number(nextRow.priority) : 3);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [tenantId, conversationId]);

  async function patchConversation(patch: Partial<WorkflowConversationRow>) {
    if (!tenantId || !conversationId) return null;

    try {
      setBusy(true);
      setError('');

      const { data, error: updateError } = await supabase
        .from('conversations')
        .update(patch)
        .eq('tenant_id', tenantId)
        .eq('id', conversationId)
        .select('id,tenant_id,thread_status,workflow_thread_type,owner_user_id,ai_mode,channel_type,priority,status,thread_type,assignee_type,assignee_user_id,assignee_ai_key,assigned_staff_user_id,last_inbound_at,last_outbound_at,updated_at')
        .single();

      if (updateError) throw updateError;

      const updated = data as WorkflowConversationRow | null;
      if (updated) {
        const nextRow = {
          ...updated,
          thread_status: deriveThreadStatus(updated),
          workflow_thread_type: deriveWorkflowType(updated),
          owner_user_id: updated.owner_user_id || updated.assigned_staff_user_id || updated.assignee_user_id || null,
          ai_mode: deriveAiMode(updated),
          channel_type: (updated.channel_type as ChannelType) || 'nexus_chat',
          priority: typeof updated.priority === 'number' ? Number(updated.priority) : 3,
        };
        setRow(nextRow);
        setThreadStatus(nextRow.thread_status || 'new');
        setWorkflowThreadType(nextRow.workflow_thread_type || 'general');
        setOwnerUserId(deriveEffectiveOwner(nextRow));
        setAiMode(nextRow.ai_mode || 'off');
        setPriority(typeof nextRow.priority === 'number' ? Number(nextRow.priority) : 3);
        return nextRow;
      }

      return null;
    } catch (e: any) {
      setError(String(e?.message || e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  const priorityOptions = useMemo(() => {
    const values = [1, 3, 10, 50, 100];
    const current = Number(priority || 0);
    return current && !values.includes(current) ? [current, ...values] : values;
  }, [priority]);

  if (!tenantId || !conversationId) return null;

  return (
    <div className="rounded-[1.7rem] border border-[#E4ECF8] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Workflow</p>
        <span className="rounded-full border border-[#D5E4FF] bg-[#EEF4FF] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#4677E6]">
          {channelLabel}
        </span>
      </div>

      {error ? <p className="mb-3 text-[11px] font-bold text-amber-700">{error}</p> : null}

      <div className="grid gap-3">
        <label className="grid gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Thread Status</span>
          <div className="flex flex-wrap gap-2">
            {WORKFLOW_STATUSES.map((item) => (
              <button
                key={item.value}
                disabled={busy}
                onClick={() => {
                  setThreadStatus(item.value);
                  void patchConversation({ thread_status: item.value });
                }}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${threadStatus === item.value ? statusTone(item.value) : 'border-[#DCE7FA] bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </label>

        <label className="grid gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Thread Type</span>
          <select
            value={workflowThreadType}
            onChange={(event) => {
              const next = event.target.value as WorkflowThreadType;
              setWorkflowThreadType(next);
              void patchConversation({ workflow_thread_type: next });
            }}
            disabled={busy}
            className="rounded-xl border border-[#DCE7FA] bg-white px-3 py-2 text-xs font-bold uppercase tracking-widest text-slate-700"
          >
            {WORKFLOW_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          {hasLegacyOwner ? (
            <p className="text-[11px] font-semibold leading-snug text-amber-700">
              Legacy assignment is still active. Clearing workflow owner will not make this thread unassigned until the legacy assignee is cleared elsewhere.
            </p>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Owner</span>
          <select
            value={ownerUserId}
            onChange={(event) => {
              const next = event.target.value;
              setOwnerUserId(next);
              void patchConversation({ owner_user_id: next || null });
            }}
            disabled={busy}
            className="rounded-xl border border-[#DCE7FA] bg-white px-3 py-2 text-xs font-bold uppercase tracking-widest text-slate-700"
          >
            <option value="">Unassigned</option>
            {owners.map((owner) => (
              <option key={owner.user_id} value={owner.user_id}>
                {owner.display_name || owner.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">AI Mode</span>
          <select
            value={aiMode}
            onChange={(event) => {
              const next = event.target.value as AiMode;
              setAiMode(next);
              void patchConversation({ ai_mode: next });
            }}
            disabled={busy}
            className="rounded-xl border border-[#DCE7FA] bg-white px-3 py-2 text-xs font-bold uppercase tracking-widest text-slate-700"
          >
            {AI_MODES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Priority</span>
          <select
            value={String(priority)}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              setPriority(next);
              void patchConversation({ priority: next });
            }}
            disabled={busy}
            className="rounded-xl border border-[#DCE7FA] bg-white px-3 py-2 text-xs font-bold uppercase tracking-widest text-slate-700"
          >
            {priorityOptions.map((value) => (
              <option key={value} value={String(value)}>
                P{value}{value <= 3 ? ' Urgent' : value <= 10 ? ' High' : value <= 50 ? ' Normal' : ' Low'}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#EEF2FA] bg-[#FBFDFF] p-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Last Inbound</p>
            <p className="mt-1 text-[11px] font-semibold text-[#5E7096]">{formatTimestamp(row?.last_inbound_at)}</p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Last Outbound</p>
            <p className="mt-1 text-[11px] font-semibold text-[#5E7096]">{formatTimestamp(row?.last_outbound_at)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#EEF2FA] bg-[#FBFDFF] p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[#5E7096]">
            <Tag size={14} className="text-[#4677E6]" />
            <span>Type: {workflowThreadType}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[#5E7096]">
            <Users size={14} className="text-[#4677E6]" />
            <span>{effectiveOwnerUserId ? 'Assigned' : 'Unassigned'}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[#5E7096]">
            <Mail size={14} className="text-[#4677E6]" />
            <span>AI: {aiMode}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[#5E7096]">
            <Clock3 size={14} className="text-[#4677E6]" />
            <span>Priority P{priority || 0}</span>
          </div>
        </div>
      </div>

      {busy ? (
        <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#4677E6]">
          <Loader2 size={12} className="animate-spin" />
          Updating
        </div>
      ) : null}
    </div>
  );
}
