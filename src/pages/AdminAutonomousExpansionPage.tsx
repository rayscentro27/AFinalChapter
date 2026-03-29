import React from 'react';
import ExpansionInputsPanel from '../components/expansion/ExpansionInputsPanel';
import ExpansionLane from '../components/expansion/ExpansionLane';
import OpportunitySummaryRow from '../components/monetization/OpportunitySummaryRow';
import { useAutonomousExpansion } from '../hooks/useAutonomousExpansion';
import { openExpansionRecommendation } from '../utils/strategicGrowthDrillthrough';

export default function AdminAutonomousExpansionPage() {
  const { user, checkingAccess, isAuthorized, loading, refreshing, error, hours, setHours, limit, setLimit, dashboard, refresh } = useAutonomousExpansion();
  const totalRecommendations = dashboard.recommendedSources.length + dashboard.newDomains.length + dashboard.newProducts.length + dashboard.newServices.length;
  const highestSignal = dashboard.inputs[0]?.label || 'Awaiting signals';
  const highConfidence = [...dashboard.recommendedSources, ...dashboard.newDomains, ...dashboard.newProducts, ...dashboard.newServices].filter((item) => String(item.confidence).toLowerCase().includes('high')).length;

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying autonomous expansion access...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Unauthorized</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900">Internal autonomous expansion access required</h1>
          <p className="mt-3 text-sm text-slate-600">This route is reserved for internal/admin users only.</p>
          <p className="mt-2 text-xs text-slate-500">Signed in role: {String(user?.role || 'unknown')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f7faff_45%,#eefdf4_100%)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Autonomous Expansion</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Strategic self-expansion view</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Internal strategic view for how Nexus could grow itself next, using source recommendations, coverage gaps, and monetization opportunities to suggest the next expansion moves.</p>
          </div>
          <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? 'Refreshing...' : 'Refresh Expansion'}</button>
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
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Lane Depth</label>
            <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
              <option value={4}>4 per lane</option>
              <option value={8}>8 per lane</option>
              <option value={12}>12 per lane</option>
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Snapshot Time</div>
            <div className="mt-2 text-base font-semibold text-slate-900">{dashboard.generatedAt ? new Date(dashboard.generatedAt).toLocaleString() : 'Awaiting snapshot'}</div>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {loading && totalRecommendations === 0 ? <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Loading autonomous expansion...</div> : null}

      <OpportunitySummaryRow
        metrics={[
          { id: 'recommendations', label: 'Expansion Moves', value: String(totalRecommendations), helper: 'Combined recommendations across sources, domains, products, and services.' },
          { id: 'signals', label: 'Input Signals', value: String(dashboard.inputs.length), helper: 'Coverage gaps, source recommendations, and monetization signals used in ranking.' },
          { id: 'lead', label: 'Lead Signal', value: highestSignal, helper: 'The top strategic input currently steering the expansion view.' },
          { id: 'confidence', label: 'High Confidence', value: String(highConfidence), helper: 'Recommendations explicitly labeled high confidence.', tone: highConfidence > 0 ? 'success' : 'warning' },
        ]}
      />

      <ExpansionInputsPanel items={dashboard.inputs} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpansionLane title="Recommended New Sources" description="Potential source additions to improve intelligence coverage and discovery throughput." items={dashboard.recommendedSources} onOpenItem={openExpansionRecommendation} />
        <ExpansionLane title="New Domains To Enter" description="Adjacent markets and research domains the system believes are now worth expanding into." items={dashboard.newDomains} onOpenItem={openExpansionRecommendation} />
        <ExpansionLane title="New Products To Build" description="Product concepts that emerge from the current signal mix and monetization opportunities." items={dashboard.newProducts} onOpenItem={openExpansionRecommendation} />
        <ExpansionLane title="New Services To Offer" description="Service-line additions suggested by repeat intelligence gaps and monetization demand." items={dashboard.newServices} onOpenItem={openExpansionRecommendation} />
      </div>
    </div>
  );
}