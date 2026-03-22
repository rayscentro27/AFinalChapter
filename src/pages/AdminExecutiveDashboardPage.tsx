import React from 'react';
import BottlenecksPanel from '../components/executiveDashboard/BottlenecksPanel';
import CapitalPathPanel from '../components/executiveDashboard/CapitalPathPanel';
import GrantEngagementPanel from '../components/executiveDashboard/GrantEngagementPanel';
import MetricsOverviewRow from '../components/executiveDashboard/MetricsOverviewRow';
import ReviewWorkloadPanel from '../components/executiveDashboard/ReviewWorkloadPanel';
import StageDistributionPanel from '../components/executiveDashboard/StageDistributionPanel';
import TradingEngagementPanel from '../components/executiveDashboard/TradingEngagementPanel';
import { useExecutiveMetrics } from '../hooks/useExecutiveMetrics';

function goToHash(hash: string, path?: string) {
  if (path) {
    window.history.pushState({}, '', path);
  }
  window.location.hash = hash;
}

export default function AdminExecutiveDashboardPage() {
  const { user, checkingAccess, isAuthorized, loading, refreshing, error, snapshot, refresh } = useExecutiveMetrics();

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying executive analytics access...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Unauthorized</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900">Internal executive analytics access required</h1>
          <p className="mt-3 text-sm text-slate-600">This route is reserved for internal/admin users. Client-facing users do not have access to cross-system operational analytics.</p>
          <p className="mt-2 text-xs text-slate-500">Signed in role: {String(user?.role || 'unknown')}</p>
        </div>
      </div>
    );
  }

  if (loading && !snapshot) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading executive analytics...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Internal Executive Operations</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Cross-System Analytics</h1>
          <p className="mt-1 text-sm text-slate-400">Funding, readiness, capital, trading, grants, and review operations in one internal executive dashboard.</p>
        </div>
        <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh Dashboard'}
        </button>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {snapshot ? (
        <>
          <MetricsOverviewRow metrics={snapshot.overview} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <StageDistributionPanel rows={snapshot.stageDistribution} onOpenFunding={() => goToHash('funding_outcomes')} />
            <BottlenecksPanel rows={snapshot.bottlenecks} commonBlockers={snapshot.commonBlockers} onOpenDocuments={() => goToHash('documents')} />
          </div>

          <CapitalPathPanel rows={snapshot.capitalPath} onOpenFunding={() => goToHash('funding_outcomes')} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <TradingEngagementPanel rows={snapshot.tradingEngagement} />
            <GrantEngagementPanel
              rows={snapshot.grantEngagement}
              onOpenGrants={() => goToHash('grants')}
              onOpenTracking={() => goToHash('admin_grants_tracking')}
            />
          </div>

          <ReviewWorkloadPanel
            rows={snapshot.reviewWorkload}
            onOpenAnalytics={() => goToHash('admin_review_analytics', '/admin/review-analytics')}
            onOpenReviewQueue={() => goToHash('admin_research_approvals', '/admin/content-review')}
          />

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Data / API Dependency Notes</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">What is grounded today vs. still missing</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              {snapshot.dependencyNotes.map((note) => (
                <div key={note} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">{note}</div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-700 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Empty Snapshot</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">No executive analytics snapshot is available yet</h2>
          <p className="mt-2 text-sm text-slate-500">Once cross-system records exist for funding, capital, grants, and review ops, this dashboard will summarize them here.</p>
        </div>
      )}
    </div>
  );
}