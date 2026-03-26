import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const DEFAULT_TAGS = ['new_lead', 'billing', 'support', 'credit_repair', 'funding', 'documents', 'urgent'];

type ConversationStatus = 'open' | 'pending' | 'pending_client' | 'pending_staff' | 'escalated' | 'closed';

type ConversationRow = {
  id: string;
  tenant_id?: string;
  tags?: string[] | null;
  status?: string | null;
  priority?: number | null;
  assignee_type?: 'contact' | 'agent' | 'ai' | null;
  assignee_user_id?: string | null;
  assignee_ai_key?: string | null;
};

type AgentOption = {
  user_id: string;
  display_name: string | null;
};

type QuickActionsBarProps = {
  tenantId?: string;
  conversation: ConversationRow | null;
  onUpdated?: (updatedConversation: ConversationRow) => void;
};

function normalizeTag(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_:-]/g, '');
}

function roleAllowed(role: string | null | undefined): boolean {
  const normalized = String(role || '').toLowerCase();
  return ['owner', 'super_admin', 'admin', 'supervisor', 'agent', 'sales', 'salesperson'].includes(normalized);
}

export default function QuickActionsBar({ tenantId, conversation, onUpdated }: QuickActionsBarProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');

  const convoId = conversation?.id;
  const tags = useMemo(() => (Array.isArray(conversation?.tags) ? conversation?.tags : []), [conversation?.tags]);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;

    const loadAgents = async () => {
      try {
        const { data: memberships, error: membershipError } = await supabase
          .from('tenant_memberships')
          .select('user_id, role')
          .eq('tenant_id', tenantId);

        if (membershipError) return;

        const eligibleIds = Array.from(
          new Set(
            ((memberships || []) as Array<{ user_id: string; role: string | null }>)
              .filter((row) => roleAllowed(row.role))
              .map((row) => row.user_id)
              .filter(Boolean)
          )
        );

        if (!eligibleIds.length) {
          if (active) {
            setAgents([]);
            setSelectedAgent('');
          }
          return;
        }

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

        const profileMap = new Map<string, string | null>();
        for (const row of profileRows || []) {
          profileMap.set(String(row.user_id), row.display_name || row.full_name || null);
        }

        const merged = eligibleIds.map((userId) => ({
          user_id: userId,
          display_name: profileMap.get(userId) || null,
        }));

        if (!active) return;
        setAgents(merged);

        setSelectedAgent((prev) => (merged.find((agent) => agent.user_id === prev) ? prev : (merged[0]?.user_id || '')));
      } catch {
        // no-op
      }
    };

    void loadAgents();

    return () => {
      active = false;
    };
  }, [tenantId]);

  async function patchConversation(patch: Partial<ConversationRow>) {
    if (!tenantId || !convoId) return null;

    try {
      setBusy(true);
      setError('');

      const { data, error: updateError } = await supabase
        .from('conversations')
        .update(patch)
        .eq('tenant_id', tenantId)
        .eq('id', convoId)
        .select('*')
        .single();

      if (updateError) throw updateError;

      const updated = (data || null) as ConversationRow | null;
      if (updated) onUpdated?.(updated);
      return updated;
    } catch (e: any) {
      setError(String(e?.message || e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: ConversationStatus) {
    await patchConversation({ status });
  }

  async function setPriority(priority: number) {
    await patchConversation({ priority });
  }

  async function addTag(tag: string) {
    const normalized = normalizeTag(tag);
    if (!normalized) return;

    const next = Array.from(new Set([...(tags || []), normalized]));
    await patchConversation({ tags: next });
  }

  async function closeAndTag(tag: string) {
    const normalized = normalizeTag(tag);
    const next = normalized ? Array.from(new Set([...(tags || []), normalized])) : tags;
    await patchConversation({ status: 'closed', tags: next });
  }

  async function urgent() {
    const next = Array.from(new Set([...(tags || []), 'urgent']));
    await patchConversation({ priority: 1, status: 'escalated', tags: next });
  }

  async function escalateToHuman() {
    if (!selectedAgent) {
      setError('No agent available to assign.');
      return;
    }

    await patchConversation({
      assignee_type: 'agent',
      assignee_user_id: selectedAgent,
      assignee_ai_key: null,
      status: 'open',
    });
  }

  async function unassign() {
    await patchConversation({
      assignee_user_id: null,
      assignee_ai_key: null,
    });
  }

  async function runRoutingForce() {
    if (!tenantId || !convoId) return;

    try {
      setBusy(true);
      setError('');

      const response = await fetch('/.netlify/functions/routing-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, conversation_id: convoId, force: true }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String((payload as any)?.error || 'Routing failed'));

      const { data, error: refreshError } = await supabase
        .from('conversations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', convoId)
        .single();

      if (refreshError) throw refreshError;
      onUpdated?.(data as ConversationRow);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      {error ? <div className="text-xs font-semibold text-red-700">{error}</div> : null}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#E2EAF7] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-3 shadow-sm">
        <span className="mr-1 text-[11px] font-black uppercase tracking-widest text-[#60739A]">Status</span>
        <button disabled={busy} onClick={() => void setStatus('open')} className="rounded-lg border border-[#DCE7FA] bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#315FD0]">
          Open
        </button>
        <button disabled={busy} onClick={() => void setStatus('pending_client')} className="rounded-lg border border-[#DCE7FA] bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#315FD0]">
          Pending Client
        </button>
        <button disabled={busy} onClick={() => void setStatus('pending_staff')} className="rounded-lg border border-[#DCE7FA] bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#315FD0]">
          Pending Staff
        </button>
        <button disabled={busy} onClick={() => void setStatus('escalated')} className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-800">
          Escalated
        </button>
        <button disabled={busy} onClick={() => void setStatus('closed')} className="rounded-lg border border-[#DCE7FA] bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#315FD0]">
          Closed
        </button>

        <span className="mx-1 h-5 w-px bg-slate-300" />

        <span className="mr-1 text-[11px] font-black uppercase tracking-widest text-[#60739A]">Priority</span>
        <button disabled={busy} onClick={() => void setPriority(10)} className="rounded-lg border border-[#DCE7FA] bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#315FD0]">
          10
        </button>
        <button disabled={busy} onClick={() => void setPriority(50)} className="rounded-lg border border-[#DCE7FA] bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#315FD0]">
          50
        </button>
        <button disabled={busy} onClick={() => void setPriority(100)} className="rounded-lg border border-[#DCE7FA] bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#315FD0]">
          100
        </button>
        <button disabled={busy} onClick={() => void urgent()} className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-700">
          Urgent
        </button>

        <span className="mx-1 h-5 w-px bg-slate-300" />

        <span className="mr-1 text-[11px] font-black uppercase tracking-widest text-[#60739A]">Tags</span>
        {DEFAULT_TAGS.slice(0, 4).map((tag) => (
          <button
            key={tag}
            disabled={busy || tags.includes(tag)}
            onClick={() => void addTag(tag)}
            className="rounded-lg border border-[#DCE7FA] bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#315FD0] disabled:opacity-40"
          >
            + {tag}
          </button>
        ))}

        <span className="mx-1 h-5 w-px bg-slate-300" />

        <span className="mr-1 text-[11px] font-black uppercase tracking-widest text-[#60739A]">Assign</span>
        <button disabled={busy} onClick={() => void unassign()} className="rounded-lg border border-[#DCE7FA] bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#315FD0]">
          Unassign
        </button>

        <div className="inline-flex items-center gap-1.5">
          <select
            value={selectedAgent}
            onChange={(event) => setSelectedAgent(event.target.value)}
            disabled={busy || agents.length === 0}
            className="rounded-lg border border-[#DCE7FA] bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-700"
            title={agents.length ? 'Select agent' : 'No agents available'}
          >
            {agents.length === 0 ? (
              <option value="">No agents</option>
            ) : (
              agents.map((agent) => (
                <option key={agent.user_id} value={agent.user_id}>
                  {agent.display_name || agent.user_id.slice(0, 8)}
                </option>
              ))
            )}
          </select>
          <button
            disabled={busy || agents.length === 0}
            onClick={() => void escalateToHuman()}
            className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-800 disabled:opacity-40"
          >
            Escalate
          </button>
        </div>

        <span className="mx-1 h-5 w-px bg-slate-300" />

        <button disabled={busy} onClick={() => void runRoutingForce()} className="rounded-lg border border-[#D6E5FF] bg-[#EEF4FF] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#315FD0]">
          Run routing
        </button>

        <button disabled={busy} onClick={() => void closeAndTag('resolved')} className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700">
          Close
        </button>
      </div>
    </div>
  );
}
