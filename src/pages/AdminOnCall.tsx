import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const CHANNELS = ['all', 'meta', 'matrix', 'google_voice'] as const;
const AGENT_ROLES = ['owner', 'admin', 'agent'] as const;

type Channel = (typeof CHANNELS)[number];

type Tenant = {
  id: string;
  name: string;
  created_at?: string;
};

type TenantMembershipRow = {
  user_id: string;
  role: string;
};

type ProfileRow = {
  user_id: string;
  display_name?: string | null;
  full_name?: string | null;
};

type AgentOption = {
  user_id: string;
  display_name: string | null;
};

type OnCallRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  channel: Channel;
  is_on_call: boolean;
  starts_at: string | null;
  ends_at: string | null;
  note: string | null;
  created_at?: string;
  display_name?: string | null;
};

function isMissingColumnError(err: unknown, column: string): boolean {
  const msg = String((err as any)?.message || '').toLowerCase();
  return msg.includes(column.toLowerCase()) || msg.includes('column') || msg.includes('does not exist');
}

async function loadTenantAgents(tenantId: string): Promise<AgentOption[]> {
  const { data: memberships, error } = await supabase
    .from('tenant_memberships')
    .select('user_id,role')
    .eq('tenant_id', tenantId);

  if (error) throw error;

  const eligibleIds = Array.from(
    new Set(
      ((memberships || []) as TenantMembershipRow[])
        .filter((row) => AGENT_ROLES.includes((row.role || '').toLowerCase() as (typeof AGENT_ROLES)[number]))
        .map((row) => row.user_id)
    )
  );

  if (eligibleIds.length === 0) return [];

  let profiles: ProfileRow[] | null = null;
  let profileError: any = null;

  ({ data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('user_id,display_name,full_name')
    .in('user_id', eligibleIds));

  if (profileError && isMissingColumnError(profileError, 'display_name')) {
    ({ data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('user_id,full_name')
      .in('user_id', eligibleIds));
  }

  const nameMap = new Map<string, string | null>();
  if (!profileError && profiles) {
    for (const profile of profiles) {
      nameMap.set(profile.user_id, profile.display_name || profile.full_name || null);
    }
  }

  return eligibleIds.map((id) => ({
    user_id: id,
    display_name: nameMap.get(id) || null,
  }));
}

export default function AdminOnCall() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [rows, setRows] = useState<OnCallRow[]>([]);

  const [formUserId, setFormUserId] = useState('');
  const [formChannel, setFormChannel] = useState<Channel>('all');
  const [formIsOnCall, setFormIsOnCall] = useState(true);
  const [formStartsAt, setFormStartsAt] = useState('');
  const [formEndsAt, setFormEndsAt] = useState('');
  const [formNote, setFormNote] = useState('');

  const canSave = useMemo(() => {
    return !!tenantId && formUserId.trim().length > 10;
  }, [tenantId, formUserId]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      setLoading(true);
      setError('');
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!authData?.user?.id) throw new Error('Not signed in.');

        const { data, error: tenantErr } = await supabase
          .from('tenants')
          .select('id,name,created_at')
          .order('created_at', { ascending: false });

        if (tenantErr) throw tenantErr;
        if (!mounted) return;

        const nextTenants = (data || []) as Tenant[];
        setTenants(nextTenants);
        if (nextTenants.length > 0) setTenantId(nextTenants[0].id);
      } catch (e: any) {
        if (mounted) setError(String(e?.message || e));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void boot();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    void refresh(tenantId);
  }, [tenantId]);

  async function refresh(currentTenantId = tenantId) {
    setError('');
    try {
      const agentOptions = await loadTenantAgents(currentTenantId);
      setAgents(agentOptions);
      if (!formUserId && agentOptions.length) {
        setFormUserId(agentOptions[0].user_id);
      }

      const { data, error: onCallErr } = await supabase
        .from('tenant_on_call')
        .select('id,tenant_id,user_id,channel,is_on_call,starts_at,ends_at,note,created_at')
        .eq('tenant_id', currentTenantId)
        .order('created_at', { ascending: false });

      if (onCallErr) throw onCallErr;

      const nameMap = new Map(agentOptions.map((agent) => [agent.user_id, agent.display_name || null]));

      setRows(
        ((data || []) as OnCallRow[]).map((row) => ({
          ...row,
          display_name: nameMap.get(row.user_id) || null,
        }))
      );
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  async function upsertRow() {
    if (!canSave) return;

    setSaving(true);
    setError('');

    try {
      const payload = {
        tenant_id: tenantId,
        user_id: formUserId.trim(),
        channel: formChannel,
        is_on_call: formIsOnCall,
        starts_at: formStartsAt ? new Date(formStartsAt).toISOString() : null,
        ends_at: formEndsAt ? new Date(formEndsAt).toISOString() : null,
        note: formNote.trim() || null,
      };

      const { error: upsertErr } = await supabase
        .from('tenant_on_call')
        .upsert(payload, { onConflict: 'tenant_id,user_id,channel' });

      if (upsertErr) throw upsertErr;

      setFormStartsAt('');
      setFormEndsAt('');
      setFormNote('');
      await refresh();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(row: OnCallRow) {
    setError('');
    const { error: updateErr } = await supabase
      .from('tenant_on_call')
      .update({ is_on_call: !row.is_on_call })
      .eq('tenant_id', row.tenant_id)
      .eq('user_id', row.user_id)
      .eq('channel', row.channel);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    await refresh();
  }

  async function remove(row: OnCallRow) {
    const confirmed = window.confirm('Delete this on-call row?');
    if (!confirmed) return;

    setError('');
    const { error: deleteErr } = await supabase
      .from('tenant_on_call')
      .delete()
      .eq('tenant_id', row.tenant_id)
      .eq('user_id', row.user_id)
      .eq('channel', row.channel);

    if (deleteErr) {
      setError(deleteErr.message);
      return;
    }

    await refresh();
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 text-slate-200">Loading on-call schedule...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">On-Call Schedule</h1>
        <p className="text-sm text-slate-400 mt-2">
          Configure channel-aware on-call coverage used by SLA escalation.
        </p>
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-4 text-sm font-medium">
          {error}
        </div>
      ) : null}

      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Tenant</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Agent</label>
            <select
              value={formUserId}
              onChange={(e) => setFormUserId(e.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              {agents.map((agent) => (
                <option key={agent.user_id} value={agent.user_id}>
                  {agent.display_name || agent.user_id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Channel</label>
            <select
              value={formChannel}
              onChange={(e) => setFormChannel(e.target.value as Channel)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">On Call</label>
            <select
              value={formIsOnCall ? 'true' : 'false'}
              onChange={(e) => setFormIsOnCall(e.target.value === 'true')}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={upsertRow}
              disabled={!canSave || saving}
              className="w-full px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Starts At (optional)</label>
            <input
              type="datetime-local"
              value={formStartsAt}
              onChange={(e) => setFormStartsAt(e.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Ends At (optional)</label>
            <input
              type="datetime-local"
              value={formEndsAt}
              onChange={(e) => setFormEndsAt(e.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Note (optional)</label>
            <input
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="weekend on-call"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Current On-Call Rows</h2>
          <button
            onClick={() => refresh()}
            className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs font-black uppercase tracking-wider"
          >
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-400">
                <th className="px-6 py-3">Agent</th>
                <th className="px-6 py-3">Channel</th>
                <th className="px-6 py-3">On Call</th>
                <th className="px-6 py-3">Window</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-white/5">
                  <td className="px-6 py-4">
                    <div className="font-bold">{row.display_name || row.user_id.slice(0, 8)}</div>
                    <div className="text-xs text-slate-400 font-mono">{row.user_id}</div>
                  </td>
                  <td className="px-6 py-4">{row.channel}</td>
                  <td className="px-6 py-4">{String(row.is_on_call)}</td>
                  <td className="px-6 py-4 text-xs text-slate-300">
                    {(row.starts_at ? new Date(row.starts_at).toLocaleString() : '—') + ' → ' + (row.ends_at ? new Date(row.ends_at).toLocaleString() : '—')}
                    {row.note ? <div className="text-slate-400 mt-1">{row.note}</div> : null}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => toggle(row)}
                        className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs font-black uppercase tracking-wider"
                      >
                        {row.is_on_call ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => remove(row)}
                        className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs font-black uppercase tracking-wider"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr className="border-t border-white/5">
                  <td colSpan={5} className="px-6 py-6 text-slate-400 text-sm">
                    No on-call rows yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
