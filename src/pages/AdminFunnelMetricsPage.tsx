import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { aggregateFunnelMetrics, runFunnelTick } from '../services/funnelService';

type Tenant = {
  id: string;
  name: string | null;
};

type DailyRow = {
  tenant_id: string;
  day: string;
  visitors: number;
  leads: number;
  optins: number;
  signups: number;
  upgrades_growth: number;
  upgrades_premium: number;
  outcomes_approved: number;
};

function pct(numerator: number, denominator: number): string {
  if (!denominator) return '0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default function AdminFunnelMetricsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [daysBack, setDaysBack] = useState(30);
  const [rows, setRows] = useState<DailyRow[]>([]);

  async function loadTenants() {
    const tenantRes = await supabase
      .from('tenants')
      .select('id,name')
      .order('name', { ascending: true });

    if (tenantRes.error) {
      throw new Error(tenantRes.error.message || 'Unable to load tenants.');
    }

    const list = (tenantRes.data || []) as Tenant[];
    setTenants(list);
    setTenantId((prev) => prev || list[0]?.id || '');
  }

  async function loadMetrics(nextTenantId: string, nextDaysBack: number) {
    if (!nextTenantId) {
      setRows([]);
      return;
    }

    const start = new Date();
    start.setDate(start.getDate() - Math.max(1, nextDaysBack));

    const metricsRes = await supabase
      .from('funnel_metrics_daily')
      .select('tenant_id,day,visitors,leads,optins,signups,upgrades_growth,upgrades_premium,outcomes_approved')
      .eq('tenant_id', nextTenantId)
      .gte('day', start.toISOString().slice(0, 10))
      .order('day', { ascending: false })
      .limit(120);

    if (metricsRes.error) {
      throw new Error(metricsRes.error.message || 'Unable to load funnel metrics.');
    }

    setRows((metricsRes.data || []) as DailyRow[]);
  }

  useEffect(() => {
    let active = true;

    async function boot() {
      if (!isAdmin) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        await loadTenants();
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
  }, [isAdmin]);

  useEffect(() => {
    if (!tenantId) return;
    void loadMetrics(tenantId, daysBack).catch((e: any) => setError(String(e?.message || e)));
  }, [tenantId, daysBack]);

  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc.visitors += Number(row.visitors || 0);
      acc.leads += Number(row.leads || 0);
      acc.optins += Number(row.optins || 0);
      acc.signups += Number(row.signups || 0);
      acc.upgrades_growth += Number(row.upgrades_growth || 0);
      acc.upgrades_premium += Number(row.upgrades_premium || 0);
      acc.outcomes_approved += Number(row.outcomes_approved || 0);
      return acc;
    }, {
      visitors: 0,
      leads: 0,
      optins: 0,
      signups: 0,
      upgrades_growth: 0,
      upgrades_premium: 0,
      outcomes_approved: 0,
    });
  }, [rows]);

  if (!isAdmin) {
    return <div className="mx-auto max-w-3xl px-4 py-8 text-slate-100"><div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Super admin access required.</div></div>;
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading funnel metrics...</div>;
  }

  async function handleAggregate() {
    if (!tenantId) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await aggregateFunnelMetrics({ tenant_id: tenantId, days_back: daysBack });
      await loadMetrics(tenantId, daysBack);
      setSuccess('Metrics aggregation complete.');
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleTickNow() {
    if (!tenantId) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await runFunnelTick(20, tenantId);
      setSuccess('Funnel tick executed.');
      await loadMetrics(tenantId, daysBack);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Funnel Metrics</h1>
        <p className="text-sm text-slate-400 mt-1">Daily conversion metrics for educational funnel performance.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Tenant</label>
          <select className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Days Back</label>
          <input type="number" min={1} max={90} value={daysBack} onChange={(e) => setDaysBack(Number(e.target.value || 30))} className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm" />
        </div>

        <div className="flex items-end">
          <button className="w-full rounded-md border border-cyan-500/50 px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-200" onClick={() => void handleAggregate()} disabled={busy}>Aggregate</button>
        </div>

        <div className="flex items-end">
          <button className="w-full rounded-md border border-emerald-500/50 px-3 py-2 text-xs font-black uppercase tracking-wider text-emerald-200" onClick={() => void handleTickNow()} disabled={busy}>Run Tick Now</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <MetricCard label="Visitors" value={totals.visitors} />
        <MetricCard label="Leads" value={totals.leads} />
        <MetricCard label="Opt-ins" value={totals.optins} sub={`Rate ${pct(totals.optins, Math.max(totals.leads, 1))}`} />
        <MetricCard label="Signups" value={totals.signups} sub={`Rate ${pct(totals.signups, Math.max(totals.leads, 1))}`} />
        <MetricCard label="Growth Upgrades" value={totals.upgrades_growth} />
        <MetricCard label="Premium Upgrades" value={totals.upgrades_premium} />
        <MetricCard label="Outcomes Approved" value={totals.outcomes_approved} />
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1080px]">
            <thead className="bg-slate-800/70 text-slate-300 uppercase text-xs tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Day</th>
                <th className="px-4 py-3 text-left">Visitors</th>
                <th className="px-4 py-3 text-left">Leads</th>
                <th className="px-4 py-3 text-left">Opt-ins</th>
                <th className="px-4 py-3 text-left">Signups</th>
                <th className="px-4 py-3 text-left">Growth</th>
                <th className="px-4 py-3 text-left">Premium</th>
                <th className="px-4 py-3 text-left">Approved Outcomes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((row) => (
                <tr key={`${row.tenant_id}:${row.day}`}>
                  <td className="px-4 py-3 text-slate-200">{row.day}</td>
                  <td className="px-4 py-3 text-slate-300">{row.visitors}</td>
                  <td className="px-4 py-3 text-slate-300">{row.leads}</td>
                  <td className="px-4 py-3 text-slate-300">{row.optins}</td>
                  <td className="px-4 py-3 text-slate-300">{row.signups}</td>
                  <td className="px-4 py-3 text-cyan-300">{row.upgrades_growth}</td>
                  <td className="px-4 py-3 text-emerald-300">{row.upgrades_premium}</td>
                  <td className="px-4 py-3 text-slate-300">{row.outcomes_approved}</td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td className="px-4 py-4 text-slate-400" colSpan={8}>No metrics rows in this period.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <p className="text-[11px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}
