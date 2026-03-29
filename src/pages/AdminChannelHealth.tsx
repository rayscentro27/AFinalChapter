import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = {
  id: string;
  name: string;
};

type ChannelHealthItem = {
  channel_account_id: string;
  provider: string;
  display_name: string | null;
  label: string | null;
  is_active: boolean;
  health_status: 'healthy' | 'degraded' | 'down' | string;
  fail_count: number;
  next_retry_at: string | null;
  last_error: string | null;
  last_fail_at: string | null;
};

type ChannelHealthEvent = {
  id: number;
  channel_account_id: string;
  provider: string;
  severity: string;
  occurred_at: string;
  error: string | null;
  context: Record<string, unknown>;
};

function statusPillClass(status: string): string {
  const key = String(status || '').toLowerCase();
  if (key === 'healthy') return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40';
  if (key === 'degraded') return 'bg-amber-500/20 text-amber-200 border-amber-500/40';
  if (key === 'down') return 'bg-rose-500/20 text-rose-200 border-rose-500/40';
  return 'bg-slate-500/20 text-slate-200 border-slate-500/40';
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in required');
  return token;
}

export default function AdminChannelHealth() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');

  const [items, setItems] = useState<ChannelHealthItem[]>([]);
  const [events, setEvents] = useState<ChannelHealthEvent[]>([]);
  const [eventsChannelId, setEventsChannelId] = useState('');

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      setError('');
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!authData?.user?.id) throw new Error('Not signed in');

        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .select('id,name')
          .order('name', { ascending: true });

        if (tenantError) throw tenantError;
        if (!active) return;

        const list = (tenantData || []) as Tenant[];
        setTenants(list);
        if (list.length > 0) setTenantId((prev) => prev || list[0].id);
      } catch (e: any) {
        if (active) setError(String(e?.message || e));
      } finally {
        if (active) setLoading(false);
      }
    }

    void boot();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loading && tenantId) {
      void fetchChannelHealth();
    }
  }, [tenantId, loading]);

  async function fetchChannelHealth() {
    if (!tenantId) return;

    try {
      setRefreshing(true);
      setError('');
      const token = await getAccessToken();

      const response = await fetch(`/.netlify/functions/admin-channel-health?tenant_id=${encodeURIComponent(tenantId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; items?: ChannelHealthItem[] };
      if (!response.ok) throw new Error(payload?.error || `Channel health failed (${response.status})`);

      setItems(payload.items || []);
      setEvents([]);
      setEventsChannelId('');
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRefreshing(false);
    }
  }

  async function resetChannelHealth(channelAccountId: string) {
    if (!tenantId || !channelAccountId) return;

    try {
      setError('');
      const token = await getAccessToken();

      const response = await fetch('/.netlify/functions/admin-channel-health-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          channel_account_id: channelAccountId,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(payload?.error || `Channel reset failed (${response.status})`);

      await fetchChannelHealth();
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  async function loadEvents(channelAccountId: string) {
    if (!tenantId || !channelAccountId) return;

    try {
      setError('');
      const token = await getAccessToken();

      const response = await fetch(
        `/.netlify/functions/admin-channel-health-events?tenant_id=${encodeURIComponent(tenantId)}&channel_account_id=${encodeURIComponent(channelAccountId)}&limit=50`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; items?: ChannelHealthEvent[] };
      if (!response.ok) throw new Error(payload?.error || `Channel events failed (${response.status})`);

      setEvents(payload.items || []);
      setEventsChannelId(channelAccountId);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 text-slate-200">Loading channel health...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Channel Health</h1>
          <p className="text-sm text-slate-400 mt-2">Circuit breaker state for outbound channel accounts.</p>
        </div>
        <button
          onClick={() => void fetchChannelHealth()}
          disabled={refreshing || !tenantId}
          className="rounded-xl bg-black/30 border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-4 text-sm font-medium">
          {error}
        </div>
      ) : null}

      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Tenant</label>
        <select
          value={tenantId}
          onChange={(event) => setTenantId(event.target.value)}
          className="w-full max-w-2xl rounded-xl bg-black/30 border border-white/10 px-3 py-2"
        >
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
          ))}
        </select>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-400">
                <th className="px-6 py-3">Provider</th>
                <th className="px-6 py-3">Channel</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Failures</th>
                <th className="px-6 py-3">Next Retry</th>
                <th className="px-6 py-3">Last Error</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-slate-400" colSpan={7}>No channel accounts found.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.channel_account_id} className="border-t border-white/5 align-top">
                    <td className="px-6 py-4 text-slate-200 uppercase">{item.provider}</td>
                    <td className="px-6 py-4 text-slate-200">{item.display_name || item.label || item.channel_account_id}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 rounded-lg border text-xs font-black uppercase tracking-wider ${statusPillClass(item.health_status)}`}>
                        {item.health_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300">{item.fail_count}</td>
                    <td className="px-6 py-4 text-slate-300">{item.next_retry_at ? new Date(item.next_retry_at).toLocaleString() : '-'}</td>
                    <td className="px-6 py-4 text-slate-300 max-w-[300px] break-words">{item.last_error || '-'}</td>
                    <td className="px-6 py-4 space-x-2">
                      <button
                        onClick={() => void resetChannelHealth(item.channel_account_id)}
                        className="rounded-lg border border-white/20 px-3 py-1 text-xs font-black uppercase tracking-widest"
                      >
                        Reset
                      </button>
                      <button
                        onClick={() => void loadEvents(item.channel_account_id)}
                        className="rounded-lg border border-white/20 px-3 py-1 text-xs font-black uppercase tracking-widest"
                      >
                        Events
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {eventsChannelId ? (
        <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 text-xs uppercase tracking-widest font-black text-slate-300">
            Recent Events ({eventsChannelId})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-slate-400">
                  <th className="px-6 py-3">Occurred</th>
                  <th className="px-6 py-3">Severity</th>
                  <th className="px-6 py-3">Provider</th>
                  <th className="px-6 py-3">Error</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td className="px-6 py-8 text-slate-400" colSpan={4}>No events found.</td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr key={event.id} className="border-t border-white/5 align-top">
                      <td className="px-6 py-4 text-slate-300">{new Date(event.occurred_at).toLocaleString()}</td>
                      <td className="px-6 py-4 text-slate-200 uppercase">{event.severity}</td>
                      <td className="px-6 py-4 text-slate-200 uppercase">{event.provider}</td>
                      <td className="px-6 py-4 text-slate-300">{event.error || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
