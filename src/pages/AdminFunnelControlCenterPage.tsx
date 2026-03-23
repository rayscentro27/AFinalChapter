import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Megaphone, PhoneCall, ShieldCheck, TrendingUp, TriangleAlert } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { aggregateFunnelMetrics } from '../services/funnelService';

type Tenant = { id: string; name: string | null };
type Organization = { id: string; org_name: string };
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
type AdCampaignRow = { org_id: string | null; platform: string | null; status: string | null; budget: number | null };
type CallSessionRow = { org_id: string | null; status: string | null; outcome: string | null; duration_sec: number | null; created_at: string | null };
type ReviewQueueRow = { status: string | null };

function pct(numerator: number, denominator: number): string {
  if (!denominator) return '0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default function AdminFunnelControlCenterPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [orgId, setOrgId] = useState('');
  const [daysBack, setDaysBack] = useState(30);
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaignRow[]>([]);
  const [callSessions, setCallSessions] = useState<CallSessionRow[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueRow[]>([]);

  useEffect(() => {
    let active = true;

    async function loadScopes() {
      if (!isAdmin) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const [tenantRes, orgRes] = await Promise.all([
          supabase.from('tenants').select('id,name').order('name', { ascending: true }),
          supabase.from('organizations').select('id,org_name').order('org_name', { ascending: true }),
        ]);

        if (tenantRes.error) throw tenantRes.error;
        if (orgRes.error) throw orgRes.error;
        if (!active) return;

        const tenantRows = (tenantRes.data || []) as Tenant[];
        const orgRows = (orgRes.data || []) as Organization[];
        setTenants(tenantRows);
        setOrganizations(orgRows);
        setTenantId((current) => current || tenantRows[0]?.id || '');
        setOrgId((current) => current || orgRows[0]?.id || '');
      } catch (e: any) {
        if (active) setError(String(e?.message || e));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadScopes();
    return () => {
      active = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!tenantId && !orgId) return;

    let active = true;

    async function loadData() {
      setError('');
      try {
        const start = new Date();
        start.setDate(start.getDate() - Math.max(1, daysBack));

        const metricsQuery = supabase
          .from('funnel_metrics_daily')
          .select('tenant_id,day,visitors,leads,optins,signups,upgrades_growth,upgrades_premium,outcomes_approved')
          .gte('day', start.toISOString().slice(0, 10))
          .order('day', { ascending: false })
          .limit(120);

        const campaignQuery = supabase.from('ad_campaigns').select('org_id,platform,status,budget');
        const callQuery = supabase.from('call_sessions').select('org_id,status,outcome,duration_sec,created_at').gte('created_at', start.toISOString());
        const reviewQuery = supabase.from('approval_queue').select('status').limit(500);

        const scopedMetricsQuery = tenantId ? metricsQuery.eq('tenant_id', tenantId) : metricsQuery;
        const scopedCampaignQuery = orgId ? campaignQuery.eq('org_id', orgId) : campaignQuery;
        const scopedCallQuery = orgId ? callQuery.eq('org_id', orgId) : callQuery;

        const [metricsRes, campaignRes, callRes, reviewRes] = await Promise.all([
          scopedMetricsQuery,
          scopedCampaignQuery,
          scopedCallQuery,
          reviewQuery,
        ]);

        if (metricsRes.error) throw metricsRes.error;
        if (campaignRes.error) throw campaignRes.error;
        if (callRes.error) throw callRes.error;
        if (reviewRes.error) throw reviewRes.error;

        if (!active) return;

        setRows((metricsRes.data || []) as DailyRow[]);
        setCampaigns((campaignRes.data || []) as AdCampaignRow[]);
        setCallSessions((callRes.data || []) as CallSessionRow[]);
        setReviewQueue((reviewRes.data || []) as ReviewQueueRow[]);
      } catch (e: any) {
        if (active) setError(String(e?.message || e));
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, [tenantId, orgId, daysBack]);

  const funnelTotals = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc.visitors += Number(row.visitors || 0);
      acc.leads += Number(row.leads || 0);
      acc.optins += Number(row.optins || 0);
      acc.signups += Number(row.signups || 0);
      acc.upgradesGrowth += Number(row.upgrades_growth || 0);
      acc.upgradesPremium += Number(row.upgrades_premium || 0);
      acc.outcomesApproved += Number(row.outcomes_approved || 0);
      return acc;
    }, {
      visitors: 0,
      leads: 0,
      optins: 0,
      signups: 0,
      upgradesGrowth: 0,
      upgradesPremium: 0,
      outcomesApproved: 0,
    });
  }, [rows]);

  const campaignSummary = useMemo(() => {
    return campaigns.reduce((acc, row) => {
      acc.total += 1;
      acc.live += String(row.status || '').toLowerCase() === 'active' ? 1 : 0;
      acc.draft += String(row.status || '').toLowerCase() === 'draft' ? 1 : 0;
      acc.budget += Number(row.budget || 0);
      return acc;
    }, { total: 0, live: 0, draft: 0, budget: 0 });
  }, [campaigns]);

  const callSummary = useMemo(() => {
    return callSessions.reduce((acc, row) => {
      acc.total += 1;
      acc.connected += String(row.status || '').toLowerCase() === 'connected' ? 1 : 0;
      acc.completed += String(row.status || '').toLowerCase() === 'completed' ? 1 : 0;
      acc.duration += Number(row.duration_sec || 0);
      if (String(row.outcome || '').toLowerCase().includes('meeting')) acc.meetings += 1;
      return acc;
    }, { total: 0, connected: 0, completed: 0, duration: 0, meetings: 0 });
  }, [callSessions]);

  const reviewSummary = useMemo(() => {
    const pending = reviewQueue.filter((row) => String(row.status || '').toLowerCase() === 'pending').length;
    const approved = reviewQueue.filter((row) => String(row.status || '').toLowerCase() === 'approved').length;
    return { pending, approved, total: reviewQueue.length };
  }, [reviewQueue]);

  async function handleAggregate() {
    if (!tenantId) return;

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await aggregateFunnelMetrics({ tenant_id: tenantId, days_back: daysBack });
      setSuccess('Funnel metrics aggregated.');
      const metricsRes = await supabase
        .from('funnel_metrics_daily')
        .select('tenant_id,day,visitors,leads,optins,signups,upgrades_growth,upgrades_premium,outcomes_approved')
        .eq('tenant_id', tenantId)
        .order('day', { ascending: false })
        .limit(120);

      if (metricsRes.error) throw metricsRes.error;
      setRows((metricsRes.data || []) as DailyRow[]);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return <div className="mx-auto max-w-4xl px-4 py-8 text-slate-100"><div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Internal admin access required.</div></div>;
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading funnel control center...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 text-slate-100 space-y-6">
      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f0fdf4_42%,#f8fafc_100%)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Funnel + Business Control Center</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Revenue, acquisition, and execution pressure</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">This surface merges funnel conversion metrics with ad campaign footprint, voice-call execution, and review queue pressure so operators can scan business health without jumping between multiple tools.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className="block text-xs uppercase tracking-[0.22em] text-slate-400 mb-2">Tenant Scope</label>
          <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-[0.22em] text-slate-400 mb-2">Organization Scope</label>
          <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={orgId} onChange={(event) => setOrgId(event.target.value)}>
            {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.org_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-[0.22em] text-slate-400 mb-2">Days Back</label>
          <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" type="number" min={1} max={90} value={daysBack} onChange={(event) => setDaysBack(Number(event.target.value || 30))} />
        </div>
        <div className="flex items-end">
          <button type="button" className="w-full rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void handleAggregate()} disabled={busy}>{busy ? 'Running...' : 'Aggregate Funnel'}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={TrendingUp} label="Visitor to Lead" value={pct(funnelTotals.leads, funnelTotals.visitors)} sub={`${funnelTotals.leads} leads from ${funnelTotals.visitors} visitors`} />
        <MetricCard icon={ShieldCheck} label="Lead to Signup" value={pct(funnelTotals.signups, funnelTotals.leads)} sub={`${funnelTotals.signups} signups`} />
        <MetricCard icon={Megaphone} label="Live Campaigns" value={String(campaignSummary.live)} sub={`$${campaignSummary.budget.toFixed(0)} total budget`} />
        <MetricCard icon={PhoneCall} label="Meeting Rate" value={pct(callSummary.meetings, callSummary.total)} sub={`${callSummary.meetings} meeting outcomes`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Funnel Health</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Conversion performance</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            <MiniStat label="Visitors" value={String(funnelTotals.visitors)} />
            <MiniStat label="Leads" value={String(funnelTotals.leads)} />
            <MiniStat label="Opt-ins" value={String(funnelTotals.optins)} />
            <MiniStat label="Signups" value={String(funnelTotals.signups)} />
            <MiniStat label="Growth Upgrades" value={String(funnelTotals.upgradesGrowth)} />
            <MiniStat label="Premium Upgrades" value={String(funnelTotals.upgradesPremium)} />
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Execution Pressure</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Operator workload and business blockers</h2>
          <div className="mt-4 space-y-3">
            <PressureRow icon={Activity} label="Review queue pending" value={String(reviewSummary.pending)} note={`${reviewSummary.approved} approved items visible`} />
            <PressureRow icon={Megaphone} label="Draft campaigns" value={String(campaignSummary.draft)} note={`${campaignSummary.total} total campaigns in scope`} />
            <PressureRow icon={PhoneCall} label="Completed calls" value={String(callSummary.completed)} note={`${Math.round(callSummary.duration / 60)} total minutes`} />
            <PressureRow icon={TriangleAlert} label="Approved outcomes" value={String(funnelTotals.outcomesApproved)} note="Current funnel conversion outcome count" />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Ads + Acquisition</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Campaign footprint</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Platform</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Budget</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.slice(0, 8).map((campaign, index) => (
                  <tr key={`${campaign.platform || 'unknown'}-${index}`}>
                    <td className="px-4 py-3 text-slate-700">{campaign.platform || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{campaign.status || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">${Number(campaign.budget || 0).toFixed(0)}</td>
                  </tr>
                ))}
                {campaigns.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={3}>No campaigns found for this organization scope.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Voice + Sales</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Call session outcomes</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Outcome</th>
                  <th className="px-4 py-3 text-left">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {callSessions.slice(0, 8).map((session, index) => (
                  <tr key={`${session.created_at || 'unknown'}-${index}`}>
                    <td className="px-4 py-3 text-slate-700">{session.created_at ? new Date(session.created_at).toLocaleString() : '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{session.status || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{session.outcome || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{Math.round(Number(session.duration_sec || 0) / 60)} min</td>
                  </tr>
                ))}
                {callSessions.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={4}>No call sessions found for this organization scope.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</p>
          <div className="mt-3 text-3xl font-semibold text-slate-950">{value}</div>
          <div className="mt-1 text-sm text-slate-500">{sub}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-700"><Icon size={20} /></div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function PressureRow({ icon: Icon, label, value, note }: { icon: React.ElementType; label: string; value: string; note: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-white p-2 text-slate-600 shadow-sm"><Icon size={16} /></div>
        <div>
          <div className="text-sm font-semibold text-slate-900">{label}</div>
          <div className="text-xs text-slate-500">{note}</div>
        </div>
      </div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}