import React, { useEffect, useMemo, useState } from 'react';
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { supabase } from '../../lib/supabaseClient';

type Tenant = {
  id: string;
  name: string;
  created_at?: string;
};

type MonitoringOverview = {
  ok: boolean;
  now?: string;
  safe_mode?: boolean;
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
};

type SeriesPoint = {
  t: string;
  v: number;
};

type SreChartsResponse = {
  ok: boolean;
  range: '24h' | '7d' | '30d';
  series: {
    outbox_sent: SeriesPoint[];
    outbox_failed: SeriesPoint[];
    webhook_accepted?: SeriesPoint[];
    webhook_failed: SeriesPoint[];
    delivery_failed: SeriesPoint[];
    provider_down_count: SeriesPoint[];
  };
  warning?: string;
};

type ChartRow = {
  t: string;
  label: string;
  sent?: number;
  failed?: number;
  accepted?: number;
  delivery_failed?: number;
  failure_rate?: number;
  down?: number;
};

function cardClass() {
  return 'bg-slate-900 border border-white/10 rounded-2xl p-4';
}

function formatBucketLabel(ts: string, range: '24h' | '7d' | '30d') {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  if (range === '24h') return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit' });
}

export default function AdminSRE() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningRollup, setRunningRollup] = useState(false);
  const [error, setError] = useState('');
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [overview, setOverview] = useState<MonitoringOverview | null>(null);
  const [charts, setCharts] = useState<SreChartsResponse | null>(null);

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
  }, [tenantId, range, loading]);

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

      const [chartsRes, overviewRes] = await Promise.all([
        fetch(`/.netlify/functions/admin-sre-charts?tenant_id=${encodeURIComponent(tenantId)}&range=${encodeURIComponent(range)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/.netlify/functions/admin-monitoring-overview?tenant_id=${encodeURIComponent(tenantId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const chartsBody = (await chartsRes.json().catch(() => ({}))) as SreChartsResponse & { error?: string };
      if (!chartsRes.ok) throw new Error(String(chartsBody?.error || `SRE charts failed (${chartsRes.status})`));

      const overviewBody = (await overviewRes.json().catch(() => ({}))) as MonitoringOverview & { error?: string };
      if (!overviewRes.ok) throw new Error(String(overviewBody?.error || `Monitoring overview failed (${overviewRes.status})`));

      setCharts(chartsBody);
      setOverview(overviewBody);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRefreshing(false);
    }
  }

  async function runRollupNow() {
    if (!tenantId) return;

    try {
      setRunningRollup(true);
      setError('');
      const token = await authToken();
      const response = await fetch('/.netlify/functions/admin-sre-rollup-run', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenant_id: tenantId, horizon_hours: range === '24h' ? 24 : range === '7d' ? 168 : 168 }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || `SRE rollup run failed (${response.status})`));
      await refreshAll();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRunningRollup(false);
    }
  }

  const outboxSeries = useMemo<ChartRow[]>(() => {
    const sent = charts?.series?.outbox_sent || [];
    const failed = charts?.series?.outbox_failed || [];
    const byBucket = new Map<string, ChartRow>();

    for (const point of sent) {
      const existing = byBucket.get(point.t) || { t: point.t, label: formatBucketLabel(point.t, range) };
      existing.sent = Number(point.v || 0);
      byBucket.set(point.t, existing);
    }

    for (const point of failed) {
      const existing = byBucket.get(point.t) || { t: point.t, label: formatBucketLabel(point.t, range) };
      existing.failed = Number(point.v || 0);
      byBucket.set(point.t, existing);
    }

    return Array.from(byBucket.values()).sort((a, b) => a.t.localeCompare(b.t));
  }, [charts, range]);

  const webhookSeries = useMemo<ChartRow[]>(() => {
    const accepted = charts?.series?.webhook_accepted || [];
    const failed = charts?.series?.webhook_failed || [];
    const byBucket = new Map<string, ChartRow>();

    for (const point of accepted) {
      const existing = byBucket.get(point.t) || { t: point.t, label: formatBucketLabel(point.t, range) };
      existing.accepted = Number(point.v || 0);
      byBucket.set(point.t, existing);
    }

    for (const point of failed) {
      const existing = byBucket.get(point.t) || { t: point.t, label: formatBucketLabel(point.t, range) };
      existing.failed = Number(point.v || 0);
      byBucket.set(point.t, existing);
    }

    return Array.from(byBucket.values()).sort((a, b) => a.t.localeCompare(b.t));
  }, [charts, range]);

  const deliveryFailureSeries = useMemo<ChartRow[]>(() => {
    const failed = charts?.series?.delivery_failed || [];
    const sent = charts?.series?.outbox_sent || [];
    const sentByBucket = new Map(sent.map((point) => [point.t, Number(point.v || 0)]));

    return failed.map((point) => {
      const failedCount = Number(point.v || 0);
      const sentCount = Number(sentByBucket.get(point.t) || 0);
      const denominator = Math.max(1, failedCount + sentCount);
      return {
        t: point.t,
        label: formatBucketLabel(point.t, range),
        delivery_failed: failedCount,
        failure_rate: Number(((failedCount / denominator) * 100).toFixed(2)),
      };
    });
  }, [charts, range]);

  const providerDownSeries = useMemo<ChartRow[]>(() => {
    return (charts?.series?.provider_down_count || []).map((point) => ({
      t: point.t,
      label: formatBucketLabel(point.t, range),
      down: Number(point.v || 0),
    }));
  }, [charts, range]);

  const topStats = useMemo(() => {
    return [
      { label: 'Outbox Queued', value: overview?.outbox?.queued ?? 0 },
      { label: 'Outbox Failed', value: overview?.outbox?.failed ?? 0 },
      { label: 'Webhook Failed (15m)', value: overview?.webhooks?.failed_15m ?? 0 },
      { label: 'Webhook Lag p95 (s)', value: overview?.webhooks?.lag_p95_seconds ?? 0 },
      { label: 'Delivery Failed', value: overview?.delivery?.failed ?? 0 },
      { label: 'Range', value: range },
    ];
  }, [overview, range]);

  if (loading) return <div className="max-w-6xl mx-auto p-6 text-slate-200">Loading SRE dashboard...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Admin SRE Dashboard</h1>
          <p className="text-sm text-slate-400 mt-2">Chart-ready throughput, failures, and provider stability.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(event) => setRange(event.target.value as '24h' | '7d' | '30d')}
            className="rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
          >
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
          </select>
          <button
            onClick={() => void runRollupNow()}
            disabled={runningRollup || !tenantId}
            className="rounded-xl bg-cyan-500/20 border border-cyan-400/30 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
          >
            {runningRollup ? 'Running...' : 'Run Rollup'}
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

      {overview?.safe_mode ? (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-2xl p-4 text-sm font-medium">
          SAFE_MODE is enabled. Outbound sending is paused.
        </div>
      ) : null}

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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        {topStats.map((card) => (
          <div key={card.label} className={cardClass()}>
            <div className="text-xs text-slate-400 uppercase tracking-widest font-black">{card.label}</div>
            <div className="mt-2 text-2xl font-black">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className={cardClass()}>
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-3">Outbox Sent vs Failed</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={outboxSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                <YAxis tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }} />
                <Legend />
                <Line type="monotone" dataKey="sent" stroke="#22c55e" strokeWidth={2} dot={false} name="Sent" />
                <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} dot={false} name="Failed" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={cardClass()}>
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-3">Webhooks Accepted vs Failed</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={webhookSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                <YAxis tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }} />
                <Legend />
                <Line type="monotone" dataKey="accepted" stroke="#38bdf8" strokeWidth={2} dot={false} name="Accepted" />
                <Line type="monotone" dataKey="failed" stroke="#f97316" strokeWidth={2} dot={false} name="Failed" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={cardClass()}>
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-3">Delivery Failed Rate (%)</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={deliveryFailureSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                <YAxis tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }} />
                <Legend />
                <Line type="monotone" dataKey="failure_rate" stroke="#f43f5e" strokeWidth={2} dot={false} name="Failure Rate %" />
                <Line type="monotone" dataKey="delivery_failed" stroke="#fb7185" strokeWidth={1.5} dot={false} name="Failed Count" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={cardClass()}>
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-3">Provider Down Count</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={providerDownSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                <YAxis tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }} />
                <Legend />
                <Line type="monotone" dataKey="down" stroke="#a855f7" strokeWidth={2} dot={false} name="Down" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-3">Drilldowns</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { window.location.hash = 'admin_health'; }}
            className="rounded-xl bg-black/30 border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest"
          >
            View webhook failures
          </button>
          <button
            onClick={() => { window.location.hash = 'outbox'; }}
            className="rounded-xl bg-black/30 border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest"
          >
            View outbox failed items
          </button>
          <button
            onClick={() => { window.location.hash = 'channel_health'; }}
            className="rounded-xl bg-black/30 border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest"
          >
            View provider health
          </button>
        </div>
      </div>
    </div>
  );
}
