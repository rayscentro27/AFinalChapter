import React from 'react';
import MonetizationSignalsPanel from '../components/monetization/MonetizationSignalsPanel';
import OpportunitySummaryRow from '../components/monetization/OpportunitySummaryRow';
import TopOpportunitiesTable from '../components/monetization/TopOpportunitiesTable';
import { useMonetizationOpportunities } from '../hooks/useMonetizationOpportunities';
import { openMonetizationOpportunity, openMonetizationSignal } from '../utils/strategicGrowthDrillthrough';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
}

export default function AdminMonetizationOpportunitiesPage() {
  const { user, checkingAccess, isAuthorized, loading, refreshing, error, hours, setHours, limit, setLimit, dashboard, refresh } = useMonetizationOpportunities();
  const totalEstimatedValue = dashboard.topOpportunities.reduce((sum, item) => sum + item.estimatedValue, 0);
  const topDomain = dashboard.topOpportunities[0]?.domain || 'Awaiting opportunities';
  const highConfidenceCount = dashboard.topOpportunities.filter((item) => String(item.confidence).toLowerCase().includes('high')).length;

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying monetization dashboard access...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Unauthorized</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900">Internal monetization dashboard access required</h1>
          <p className="mt-3 text-sm text-slate-600">This route is reserved for internal/admin users only.</p>
          <p className="mt-2 text-xs text-slate-500">Signed in role: {String(user?.role || 'unknown')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f4fff7_48%,#f8fafc_100%)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Monetization Opportunities</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Turn insights into revenue</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Staff-only monetization visibility across funding offers, strategy education, grant services, and business services. The dashboard stays strategic and only surfaces what the backend actually returned.</p>
          </div>
          <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? 'Refreshing...' : 'Refresh Opportunities'}</button>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Window</label>
            <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={hours} onChange={(event) => setHours(Number(event.target.value))}>
              <option value={24}>24 hours</option>
              <option value={72}>72 hours</option>
              <option value={168}>7 days</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Opportunity Count</label>
            <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
              <option value={6}>6 opportunities</option>
              <option value={10}>10 opportunities</option>
              <option value={15}>15 opportunities</option>
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Snapshot Time</div>
            <div className="mt-2 text-base font-semibold text-slate-900">{dashboard.generatedAt ? new Date(dashboard.generatedAt).toLocaleString() : 'Awaiting snapshot'}</div>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {loading && dashboard.topOpportunities.length === 0 ? <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Loading monetization opportunities...</div> : null}

      <OpportunitySummaryRow
        metrics={[
          { id: 'opps', label: 'Top Opportunities', value: String(dashboard.topOpportunities.length), helper: 'Ranked opportunities from cross-domain signals and funding patterns.' },
          { id: 'value', label: 'Estimated Value', value: formatCurrency(totalEstimatedValue), helper: 'Combined estimated value across currently surfaced opportunities.', tone: totalEstimatedValue > 0 ? 'success' : 'default' },
          { id: 'domain', label: 'Leading Domain', value: topDomain, helper: 'Current highest-ranked domain returned by the backend.' },
          { id: 'confidence', label: 'High Confidence', value: String(highConfidenceCount), helper: 'Opportunities explicitly marked high confidence.', tone: highConfidenceCount > 0 ? 'success' : 'warning' },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <TopOpportunitiesTable items={dashboard.topOpportunities} onOpenOpportunity={openMonetizationOpportunity} />
        <MonetizationSignalsPanel items={dashboard.inputSignals} onOpenSignal={openMonetizationSignal} />
      </div>
    </div>
  );
}