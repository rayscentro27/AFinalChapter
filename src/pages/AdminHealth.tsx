import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import SystemObservabilityPanels, { type SystemObservabilityPayload } from '../components/admin/SystemObservabilityPanels';

type Tenant = {
  id: string;
  name: string;
  created_at?: string;
};

type HealthPayload = {
  ok: boolean;
  outbox?: {
    queued: number;
    sending: number;
    failed: number;
    oldest_due_minutes: number;
  };
  webhooks?: {
    accepted_24h: number;
    ignored_24h: number;
    failed_24h: number;
    last_failures: Array<{
      id: number;
      provider: string;
      external_event_id: string;
      received_at: string;
      error: string;
    }>;
  };
  delivery?: {
    pending: number;
    delivered: number;
    failed: number;
  };
};

type AlertItem = {
  id: number;
  tenant_id: string;
  alert_key: string;
  status: 'open' | 'resolved';
  severity: 'warning' | 'critical' | string;
  summary: string;
  details?: Record<string, unknown>;
  first_triggered_at: string;
  last_triggered_at: string;
  last_notified_at: string | null;
  occurrences: number;
  resolved_at: string | null;
};

type AlertNotificationItem = {
  id: number;
  tenant_id: string;
  alert_key: string;
  status: string;
  severity: string;
  summary: string;
  delivered: boolean;
  response_code: number | null;
  error: string | null;
  created_at: string;
};

export default function AdminHealth() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningAlerts, setRunningAlerts] = useState(false);
  const [error, setError] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [notifications, setNotifications] = useState<AlertNotificationItem[]>([]);
  const [systemObservability, setSystemObservability] = useState<SystemObservabilityPayload | null>(null);

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
          .select('id,name,created_at')
          .order('created_at', { ascending: false });

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
      void refreshAll();
    }
  }, [tenantId, loading]);

  const healthCards = useMemo(() => {
    return [
      { label: 'Outbox Queued', value: health?.outbox?.queued ?? 0 },
      { label: 'Outbox Sending', value: health?.outbox?.sending ?? 0 },
      { label: 'Outbox Failed', value: health?.outbox?.failed ?? 0 },
      { label: 'Oldest Due (min)', value: health?.outbox?.oldest_due_minutes ?? 0 },
      { label: 'Webhooks Accepted 24h', value: health?.webhooks?.accepted_24h ?? 0 },
      { label: 'Webhooks Ignored 24h', value: health?.webhooks?.ignored_24h ?? 0 },
      { label: 'Webhooks Failed 24h', value: health?.webhooks?.failed_24h ?? 0 },
      { label: 'Delivery Pending', value: health?.delivery?.pending ?? 0 },
      { label: 'Delivery Delivered', value: health?.delivery?.delivered ?? 0 },
      { label: 'Delivery Failed', value: health?.delivery?.failed ?? 0 },
    ];
  }, [health]);

  async function authToken() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Sign in required');
    return token;
  }

  async function fetchHealth() {
    if (!tenantId) return;

    const token = await authToken();
    const response = await fetch(`/.netlify/functions/admin-health?tenant_id=${encodeURIComponent(tenantId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as HealthPayload & { error?: string };
    if (!response.ok) {
      throw new Error(String(payload?.error || `Admin health failed (${response.status})`));
    }

    setHealth(payload);
  }

  async function fetchAlerts() {
    if (!tenantId) return;

    const token = await authToken();
    const response = await fetch(`/.netlify/functions/admin-alerts?tenant_id=${encodeURIComponent(tenantId)}&status=open&limit=50`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; items?: AlertItem[] };
    if (!response.ok) {
      throw new Error(String(payload?.error || `Admin alerts failed (${response.status})`));
    }

    setAlerts(Array.isArray(payload?.items) ? payload.items : []);
  }

  async function fetchAlertNotifications() {
    if (!tenantId) return;

    const token = await authToken();
    const response = await fetch(`/.netlify/functions/admin-alerts-notifications?tenant_id=${encodeURIComponent(tenantId)}&limit=50`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      items?: AlertNotificationItem[];
    };

    if (!response.ok) {
      throw new Error(String(payload?.error || `Admin alert notifications failed (${response.status})`));
    }

    setNotifications(Array.isArray(payload?.items) ? payload.items : []);
  }

  async function fetchSystemObservability() {
    if (!tenantId) return;

    const token = await authToken();
    const response = await fetch(`/.netlify/functions/admin-system-observability?tenant_id=${encodeURIComponent(tenantId)}&hours=24`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as SystemObservabilityPayload & { error?: string };
    if (!response.ok) {
      throw new Error(String(payload?.error || `System observability failed (${response.status})`));
    }

    setSystemObservability(payload);
  }

  async function refreshAll() {
    try {
      setRefreshing(true);
      setError('');
      await Promise.all([fetchHealth(), fetchAlerts(), fetchAlertNotifications(), fetchSystemObservability()]);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRefreshing(false);
    }
  }

  async function runAlertCheck() {
    if (!tenantId) return;

    try {
      setRunningAlerts(true);
      setError('');

      const token = await authToken();
      const response = await fetch('/.netlify/functions/admin-alerts-run', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenant_id: tenantId, notify: true }),
      });

      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(String(payload?.error || `Alert check failed (${response.status})`));
      }

      await refreshAll();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRunningAlerts(false);
    }
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 text-slate-200">Loading admin health...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Gateway Health</h1>
          <p className="text-sm text-slate-400 mt-2">Operational status of outbox, webhooks, delivery states, and alerts.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void runAlertCheck()}
            disabled={runningAlerts || !tenantId}
            className="rounded-xl bg-amber-500/20 border border-amber-400/30 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
          >
            {runningAlerts ? 'Running Alerts...' : 'Run Alert Check'}
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {healthCards.map((card) => (
          <div key={card.label} className="bg-slate-900 border border-white/10 rounded-2xl p-4">
            <div className="text-xs text-slate-400 uppercase tracking-widest font-black">{card.label}</div>
            <div className="mt-2 text-2xl font-black">{card.value}</div>
          </div>
        ))}
      </div>

      <SystemObservabilityPanels payload={systemObservability} />

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
                <th className="px-6 py-3">Summary</th>
                <th className="px-6 py-3">Occurrences</th>
                <th className="px-6 py-3">Last Triggered</th>
                <th className="px-6 py-3">Last Notified</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-slate-400" colSpan={6}>No open alerts.</td>
                </tr>
              ) : (
                alerts.map((item) => (
                  <tr key={item.id} className="border-t border-white/5 align-top">
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-lg border ${item.severity === 'critical' ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>
                        {item.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300 font-mono text-xs">{item.alert_key}</td>
                    <td className="px-6 py-4 text-slate-200">{item.summary}</td>
                    <td className="px-6 py-4 text-slate-300">{item.occurrences}</td>
                    <td className="px-6 py-4 text-slate-300">{new Date(item.last_triggered_at).toLocaleString()}</td>
                    <td className="px-6 py-4 text-slate-300">{item.last_notified_at ? new Date(item.last_notified_at).toLocaleString() : '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Recent Alert Notifications</h2>
          <span className="text-xs px-2 py-1 rounded-lg border border-white/20 bg-white/5">{notifications.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-400">
                <th className="px-6 py-3">Time</th>
                <th className="px-6 py-3">Alert Key</th>
                <th className="px-6 py-3">Severity</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Delivered</th>
                <th className="px-6 py-3">HTTP</th>
                <th className="px-6 py-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {notifications.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-slate-400" colSpan={7}>No notification attempts yet.</td>
                </tr>
              ) : (
                notifications.map((item) => (
                  <tr key={item.id} className="border-t border-white/5 align-top">
                    <td className="px-6 py-4 text-slate-300">{new Date(item.created_at).toLocaleString()}</td>
                    <td className="px-6 py-4 text-slate-300 font-mono text-xs">{item.alert_key}</td>
                    <td className="px-6 py-4 text-slate-300">{item.severity}</td>
                    <td className="px-6 py-4 text-slate-300">{item.status}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-lg border ${item.delivered ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-red-500/40 bg-red-500/10 text-red-200'}`}>
                        {item.delivered ? 'yes' : 'no'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300">{item.response_code ?? '-'}</td>
                    <td className="px-6 py-4 text-slate-300">{item.error || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Recent Webhook Failures</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-400">
                <th className="px-6 py-3">Provider</th>
                <th className="px-6 py-3">External Event ID</th>
                <th className="px-6 py-3">Received At</th>
                <th className="px-6 py-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {(health?.webhooks?.last_failures || []).length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-slate-400" colSpan={4}>No failures recorded.</td>
                </tr>
              ) : (
                (health?.webhooks?.last_failures || []).map((item) => (
                  <tr key={`${item.provider}:${item.id}`} className="border-t border-white/5 align-top">
                    <td className="px-6 py-4 text-slate-200">{item.provider}</td>
                    <td className="px-6 py-4 text-slate-300 font-mono text-xs">{item.external_event_id}</td>
                    <td className="px-6 py-4 text-slate-300">{new Date(item.received_at).toLocaleString()}</td>
                    <td className="px-6 py-4 text-slate-300">{item.error || '-'}</td>
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
