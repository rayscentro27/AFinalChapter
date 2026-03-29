import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const PROVIDERS = ['meta', 'matrix', 'google_voice'] as const;
const AGENT_ROLES = ['owner', 'admin', 'agent'] as const;

type Provider = (typeof PROVIDERS)[number];

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

type ChannelPoolRow = {
  id: string;
  tenant_id: string;
  provider: Provider;
  user_id: string;
  enabled: boolean;
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

export default function AdminChannelPools() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [provider, setProvider] = useState<Provider>('meta');
  const [selectedUser, setSelectedUser] = useState('');
  const [rows, setRows] = useState<ChannelPoolRow[]>([]);

  const canAdd = useMemo(() => !!tenantId && !!provider && !!selectedUser, [tenantId, provider, selectedUser]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      setLoading(true);
      setError('');

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!authData?.user?.id) throw new Error('Not signed in.');

        const { data: tenantData, error: tenantErr } = await supabase
          .from('tenants')
          .select('id,name,created_at')
          .order('created_at', { ascending: false });

        if (tenantErr) throw tenantErr;
        if (!mounted) return;

        const nextTenants = (tenantData || []) as Tenant[];
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
    void refresh(tenantId, provider);
  }, [tenantId, provider]);

  async function refresh(currentTenantId = tenantId, currentProvider = provider) {
    setError('');

    try {
      const agentOptions = await loadTenantAgents(currentTenantId);
      setAgents(agentOptions);
      if (!selectedUser && agentOptions.length > 0) {
        setSelectedUser(agentOptions[0].user_id);
      }

      const { data, error: poolErr } = await supabase
        .from('tenant_channel_pools')
        .select('id,tenant_id,provider,user_id,enabled,created_at')
        .eq('tenant_id', currentTenantId)
        .eq('provider', currentProvider)
        .order('created_at', { ascending: false });

      if (poolErr) throw poolErr;

      const nameMap = new Map(agentOptions.map((agent) => [agent.user_id, agent.display_name || null]));
      setRows(
        ((data || []) as ChannelPoolRow[]).map((row) => ({
          ...row,
          display_name: nameMap.get(row.user_id) || null,
        }))
      );
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  async function addToPool() {
    if (!canAdd) return;

    setError('');
    const { error: upsertErr } = await supabase
      .from('tenant_channel_pools')
      .upsert(
        {
          tenant_id: tenantId,
          provider,
          user_id: selectedUser,
          enabled: true,
        },
        { onConflict: 'tenant_id,provider,user_id' }
      );

    if (upsertErr) {
      setError(upsertErr.message);
      return;
    }

    await refresh();
  }

  async function toggle(row: ChannelPoolRow) {
    setError('');
    const { error: updateErr } = await supabase
      .from('tenant_channel_pools')
      .update({ enabled: !row.enabled })
      .eq('tenant_id', row.tenant_id)
      .eq('provider', row.provider)
      .eq('user_id', row.user_id);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    await refresh();
  }

  async function remove(row: ChannelPoolRow) {
    const confirmed = window.confirm('Remove this user from the channel pool?');
    if (!confirmed) return;

    setError('');
    const { error: deleteErr } = await supabase
      .from('tenant_channel_pools')
      .delete()
      .eq('tenant_id', row.tenant_id)
      .eq('provider', row.provider)
      .eq('user_id', row.user_id);

    if (deleteErr) {
      setError(deleteErr.message);
      return;
    }

    await refresh();
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 text-slate-200">Loading channel pools...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Channel Agent Pools</h1>
        <p className="text-sm text-slate-400 mt-2">
          If a provider pool is configured, SLA escalations route only to those agents.
        </p>
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-4 text-sm font-medium">
          {error}
        </div>
      ) : null}

      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
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
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              {PROVIDERS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Add Agent</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              {agents.map((agent) => (
                <option key={agent.user_id} value={agent.user_id}>
                  {agent.display_name || agent.user_id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={addToPool}
              disabled={!canAdd}
              className="w-full px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest"
            >
              Add to Pool
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">{provider} Pool</h2>
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
                <th className="px-6 py-3">Enabled</th>
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
                  <td className="px-6 py-4">{String(row.enabled)}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => toggle(row)}
                        className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs font-black uppercase tracking-wider"
                      >
                        {row.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => remove(row)}
                        className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs font-black uppercase tracking-wider"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr className="border-t border-white/5">
                  <td colSpan={3} className="px-6 py-6 text-slate-400 text-sm">
                    No pool members yet.
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
