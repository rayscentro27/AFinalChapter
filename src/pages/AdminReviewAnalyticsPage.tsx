import React from 'react';
import MetricCardsRow from '../components/reviewAnalytics/MetricCardsRow';
import FreshnessPanel from '../components/reviewAnalytics/FreshnessPanel';
import PriorityAttentionList from '../components/reviewAnalytics/PriorityAttentionList';
import QueueHealthPanel from '../components/reviewAnalytics/QueueHealthPanel';
import { useReviewAnalytics } from '../hooks/useReviewAnalytics';
import { buildReviewDashboardPath, ReviewDashboardQuery } from '../services/reviewAnalyticsService';

function navigateToReviewDrillIn(query: ReviewDashboardQuery) {
  const nextPath = buildReviewDashboardPath(query);
  window.history.pushState({}, '', nextPath);
  window.location.hash = 'admin_research_approvals';
}

export default function AdminReviewAnalyticsPage() {
  const {
    user,
    checkingAccess,
    isAuthorized,
    loading,
    refreshing,
    error,
    tenants,
    tenantId,
    setTenantId,
    dashboard,
    analytics,
    refresh,
  } = useReviewAnalytics();

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying internal analytics access...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Unauthorized</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900">Internal review analytics access required</h1>
          <p className="mt-3 text-sm text-slate-600">This route is reserved for internal reviewers and admins. Client-facing users do not have access to operational queue analytics.</p>
          <p className="mt-2 text-xs text-slate-500">Signed in role: {String(user?.role || 'unknown')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Internal Review Operations</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Reviewer Analytics + Freshness</h1>
        <p className="mt-1 text-sm text-slate-400">Operational visibility for queue pressure, lifecycle state, and stale content across strategies and signals.</p>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.06)] grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Tenant</label>
          <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900" value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2 flex items-end">
          <button type="button" className="w-full rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void refresh()} disabled={refreshing || !tenantId}>
            {refreshing ? 'Refreshing...' : 'Refresh Analytics'}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {!loading && dashboard.items.length === 0 ? (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-700 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Empty Snapshot</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">No internal review items found for this tenant</h2>
          <p className="mt-2 text-sm text-slate-500">Once strategies, options, signals, or review queue rows exist, this dashboard will summarize freshness and review pressure automatically.</p>
        </div>
      ) : null}

      {dashboard.items.length > 0 ? (
        <>
          <MetricCardsRow metrics={analytics.headlineMetrics} onDrillIn={navigateToReviewDrillIn} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <QueueHealthPanel rows={analytics.queueHealth} backlogLeader={analytics.backlogLeader} lastUpdatedLabel={analytics.lastUpdatedLabel} onDrillIn={navigateToReviewDrillIn} />
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Backend Dependency Note</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">Trend placeholder</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{analytics.trendPlaceholder}</p>
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                Current coverage is a live operational snapshot. Daily throughput, reviewer-level trends, and historical backlog burn-down will need backend snapshotting or aggregate endpoints before they can be shown honestly.
              </div>
            </div>
          </div>

          <FreshnessPanel buckets={analytics.freshness} onDrillIn={navigateToReviewDrillIn} />
          <PriorityAttentionList items={analytics.priorityItems} onDrillIn={navigateToReviewDrillIn} />
        </>
      ) : null}
    </div>
  );
}