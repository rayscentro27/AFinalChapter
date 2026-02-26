import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = {
  id: string;
  name: string;
  created_at?: string;
};

type MonitoringOverview = {
  ok: boolean;
  now?: string;
  outbox?: {
    queued: number;
    sending: number;
    failed: number;
    oldest_due_minutes: number;
  };
  webhooks?: {
    accepted_15m: number;
    ignored_15m: number;
    failed_15m: number;
    lag_p95_seconds: number;
  };
  delivery?: {
    pending: number;
    delivered: number;
    failed: number;
  };
  providers?: Record<string, { total: number; active: number; healthy: number; degraded: number; down: number }>;
};

type AlertItem = {
  id: number;
  tenant_id: string;
  alert_key: string;
  severity: string;
  message: string;
  status: 'open' | 'ack' | 'resolved' | string;
  opened_at: string;
  resolved_at: string | null;
};

function cardClass() {
  return 'bg-slate-900 border border-white/10 rounded-2xl p-4';
}

export default function AdminMonitoring() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [overview, setOverview] = useState<MonitoringOverview | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      setError('');

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!authData?.user?.id) throw new Error('Not signed in');

        const { data, error: tenantError } = await supabase
          .from('tenants')
          .select('id,name,created_at')
          .order('created_at', { ascending: false });

        if (tenantError) throw tenantError;
        if (!active) return;

        const list = (data || []) as Tenant[];
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
      void refreshAll();
    }
  }, [tenantId, loading]);

  const stats = useMemo(() => {
    return [
      { label: 'Outbox Queued', value: overview?.outbox?.queued ?? 0 },
      { label: 'Outbox Sending', value: overview?.outbox?.sending ?? 0 },
      { label: 'Outbox Failed', value: overview?.outbox?.failed ?? 0 },
      { label: 'Oldest Due (min)', value: overview?.outbox?.oldest_due_minutes ?? 0 },
      { label: 'Webhooks Accepted 15m', value: overview?.webhooks?.accepted_15m ?? 0 },
      { label: 'Webhooks Failed 15m', value: overview?.webhooks?.failed_15m ?? 0 },
      { label: 'Webhook Lag p95 (s)', value: overview?.webhooks?.lag_p95_seconds ?? 0 },
      { label: 'Delivery Pending', value: overview?.delivery?.pending ?? 0 },
      { label: 'Delivery Delivered', value: overview?.delivery?.delivered ?? 0 },
      { label: 'Delivery Failed', value: overview?.delivery?.failed ?? 0 },
    ];
  }, [overview]);

  async function authToken() {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error('Sign in required');
    return token;
  }

  async function refreshAll() {
    if (!tenantId) return;

    try {
      setRefreshing(true);
      setError('');

      const token = await authToken();
      const [overviewRes, alertsRes] = await Promise.all([
        fetch(`/.netlify/functions/admin-monitoring-overview?tenant_id=${encodeURIComponent(tenantId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/.netlify/functions/admin-monitoring-alerts?tenant_id=${encodeURIComponent(tenantId)}&status=open&limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const overviewBody = (await overviewRes.json().catch(() => ({}))) as MonitoringOverview & { error?: string };
      if (!overviewRes.ok) throw new Error(String(overviewBody?.error || `Monitoring overview failed (${overviewRes.status})`));

      const alertsBody = (await alertsRes.json().catch(() => ({}))) as { items?: AlertItem[]; error?: string };
      if (!alertsRes.ok) throw new Error(String(alertsBody?.error || `Monitoring alerts failed (${alertsRes.status})`));

      setOverview(overviewBody);
      setAlerts(Array.isArray(alertsBody.items) ? alertsBody.items : []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRefreshing(false);
    }
  }

  async function ackAlert(alertId: number) {
    if (!tenantId) return;

    try {
      const token = await authToken();
      const response = await fetch('/.netlify/functions/admin-monitoring-ack', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenant_id: tenantId, alert_id: alertId }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || `Ack failed (${response.status})`));

      await refreshAll();
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  async function sendTestAlert() {
    if (!tenantId) return;

    try {
      setTesting(true);
      const token = await authToken();
      const response = await fetch('/.netlify/functions/admin-monitoring-test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          severity: 'warn',
          message: 'Manual monitoring test alert',
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || `Test alert failed (${response.status})`));
      await refreshAll();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className="max-w-6xl mx-auto p-6 text-slate-200">Loading monitoring...</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Admin Monitoring</h1>
          <p className="text-sm text-slate-400 mt-2">Outbox, webhook, delivery and provider health in one view.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void sendTestAlert()}
            disabled={testing || !tenantId}
            className="rounded-xl bg-amber-500/20 border border-amber-400/30 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
          >
            {testing ? 'Sending...' : 'Send Test Alert'}
          </button>
          <button
            onClick={() => void refreshAll()}
            disabled={refreshing || !tenantId}
            className="rounded-xl bg-black/30 border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-4 text-sm font-medium">{error}</div>
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {stats.map((card) => (
          <div key={card.label} className={cardClass()}>
            <div className="text-xs text-slate-400 uppercase tracking-widest font-black">{card.label}</div>
            <div className="mt-2 text-2xl font-black">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-4">Provider Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(overview?.providers || {}).map(([provider, statsRow]) => (
            <div key={provider} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
              <div className="font-black uppercase tracking-widest text-slate-300">{provider}</div>
              <div className="text-slate-300 mt-1">active {statsRow.active}/{statsRow.total}</div>
              <div className="text-slate-400 text-xs mt-1">
                healthy {statsRow.healthy} | degraded {statsRow.degraded} | down {statsRow.down}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Open Alerts</h2>
          <span className="text-xs px-2 py-1 rounded-lg border border-white/20 bg-white/5">{alerts.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-400">
                <th className="px-6 py-3">Severity</th>
                <th className="px-6 py-3">Alert Key</th>
                <th className="px-6 py-3">Message</th>
                <th className="px-6 py-3">Opened</th>
                <th className="px-6 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">No open alerts</td>
                </tr>
              ) : (
                alerts.map((alert) => (
                  <tr key={alert.id} className="border-t border-white/5">
                    <td className="px-6 py-3">
                      <span className={`rounded-lg px-2 py-1 text-xs font-black uppercase ${alert.severity === 'critical' ? 'bg-red-500/15 border border-red-400/40 text-red-200' : 'bg-amber-500/15 border border-amber-400/40 text-amber-200'}`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-semibold text-slate-200">{alert.alert_key}</td>
                    <td className="px-6 py-3 text-slate-300">{alert.message}</td>
                    <td className="px-6 py-3 text-slate-400">{new Date(alert.opened_at).toLocaleString()}</td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => void ackAlert(alert.id)}
                        className="rounded-lg border border-white/20 bg-white/5 px-3 py-1 text-xs font-black uppercase tracking-wider"
                      >
                        Ack
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
