import React from 'react';
import AtRiskClientsPanel from '../components/executiveDashboard/AtRiskClientsPanel';
import BottlenecksPanel from '../components/executiveDashboard/BottlenecksPanel';
import CapitalPathPanel from '../components/executiveDashboard/CapitalPathPanel';
import GrantEngagementPanel from '../components/executiveDashboard/GrantEngagementPanel';
import MetricsOverviewRow from '../components/executiveDashboard/MetricsOverviewRow';
import OperationalPulsePanel from '../components/executiveDashboard/OperationalPulsePanel';
import ReviewWorkloadPanel from '../components/executiveDashboard/ReviewWorkloadPanel';
import StageDistributionPanel from '../components/executiveDashboard/StageDistributionPanel';
import TrendPanel from '../components/executiveDashboard/TrendPanel';
import TradingEngagementPanel from '../components/executiveDashboard/TradingEngagementPanel';
import type { DealEscalationItem } from '../hooks/useExecutiveMetrics';
import { useExecutiveMetrics } from '../hooks/useExecutiveMetrics';
import { buildDocumentsDrillthroughPath, buildFundingDrillthroughPath, buildReviewQueueDrillthroughPath, goToHash } from '../utils/dealEscalationDrillthrough';

export default function AdminExecutiveDashboardPage() {
  const {
    user,
    checkingAccess,
    isAuthorized,
    loading,
    refreshing,
    error,
    snapshot,
    refresh,
    tenants,
    tenantId,
    setTenantId,
    hours,
    setHours,
  } = useExecutiveMetrics();

  function openClientDocuments(item: DealEscalationItem) {
    goToHash('admin_documents', buildDocumentsDrillthroughPath(item));
  }

  function openClientFunding(item: DealEscalationItem) {
    goToHash('admin_commissions', buildFundingDrillthroughPath(item));
  }

  function openClientReviewQueue(item: DealEscalationItem) {
    goToHash('admin_research_approvals', buildReviewQueueDrillthroughPath(item));
  }

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
      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#eff6ff_48%,#f8fafc_100%)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Executive Command Center</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Operational command center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">System health, autonomy visibility, review workload, client-stage distribution, deal SLA pressure, and business-impact signals in one internal surface. This route remains staff-only and intentionally calm.</p>
          </div>
          <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh Dashboard'}
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Tenant Scope</label>
            <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Window</label>
            <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={hours} onChange={(event) => setHours(Number(event.target.value))}>
              <option value={24}>24 hours</option>
              <option value={72}>72 hours</option>
              <option value={168}>7 days</option>
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Snapshot Time</div>
            <div className="mt-2 text-base font-semibold text-slate-900">{snapshot?.generatedAt ? new Date(snapshot.generatedAt).toLocaleString() : 'Awaiting snapshot'}</div>
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Top System Metrics</p>
          <p className="mt-1 text-sm text-slate-400">The headline counters below are optimized for operator scan speed.</p>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {snapshot ? (
        <>
          <MetricsOverviewRow metrics={snapshot.overview} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
            <TrendPanel
              title="Deal pressure trend"
              description="Recent snapshots of client risk posture across the current scope and selected window bucket." 
              series={[
                { key: 'escalated', label: 'Escalated', colorClass: 'bg-rose-400', points: snapshot.history.escalated },
                { key: 'at-risk', label: 'At Risk', colorClass: 'bg-amber-400', points: snapshot.history.atRisk },
              ]}
            />
            <TrendPanel
              title="Operational friction trend"
              description="Recent snapshots showing review pressure and hard system issues moving over time."
              series={[
                { key: 'pending-reviews', label: 'Pending Reviews', colorClass: 'bg-sky-400', points: snapshot.history.pendingReviews },
                { key: 'open-system-issues', label: 'Open System Issues', colorClass: 'bg-slate-500', points: snapshot.history.openSystemIssues },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
            <OperationalPulsePanel
              eyebrow="Worker / Autonomy Health"
              title="Worker and autonomy health"
              description="Keep this section calm and factual: it is the operating heartbeat for staff before they drill into incidents."
              rows={snapshot.workerHealth}
            />
            <OperationalPulsePanel
              eyebrow="System Health"
              title="System health"
              description="Gateway, jobs, webhooks, and delivery pressure pulled into one operator summary."
              rows={snapshot.systemHealth}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <StageDistributionPanel rows={snapshot.stageDistribution} onOpenFunding={() => goToHash('funding_outcomes')} />
            <BottlenecksPanel rows={snapshot.bottlenecks} commonBlockers={snapshot.commonBlockers} onOpenDocuments={() => goToHash('documents')} />
          </div>

          <AtRiskClientsPanel
            items={snapshot.atRiskClients}
            onOpenDocuments={openClientDocuments}
            onOpenFunding={openClientFunding}
            onOpenReviewQueue={openClientReviewQueue}
          />

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

          <OperationalPulsePanel
            eyebrow="Business Impact"
            title="Business impact summary"
            description="A compact view of business outcomes that could be suppressed if queue, system, or deal pressure is ignored."
            rows={snapshot.businessImpact}
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