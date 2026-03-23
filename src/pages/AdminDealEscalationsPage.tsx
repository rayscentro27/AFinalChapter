import React from 'react';
import DealEscalationRules from '../components/admin/DealEscalationRules';
import AtRiskClientsPanel from '../components/executiveDashboard/AtRiskClientsPanel';
import TrendPanel from '../components/executiveDashboard/TrendPanel';
import type { DealEscalationItem } from '../hooks/useExecutiveMetrics';
import { useDealEscalations } from '../hooks/useDealEscalations';
import { buildDocumentsDrillthroughPath, buildFundingDrillthroughPath, buildReviewQueueDrillthroughPath, goToHash } from '../utils/dealEscalationDrillthrough';

function summaryCard(label: string, value: number, helper: string, tone: 'default' | 'warning' | 'danger' | 'success' = 'default') {
  const toneClass = tone === 'danger'
    ? 'border-rose-200 bg-rose-50'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50'
      : tone === 'success'
        ? 'border-emerald-200 bg-emerald-50'
        : 'border-slate-200 bg-white';

  return (
    <div key={label} className={`rounded-[1.75rem] border p-5 shadow-sm ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}

export default function AdminDealEscalationsPage() {
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
    hours,
    setHours,
    summary,
    rules,
    items,
    history,
    generatedAt,
    dependencyNotes,
    refresh,
  } = useDealEscalations();

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
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying deal escalation access...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Unauthorized</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900">Internal deal escalation access required</h1>
          <p className="mt-3 text-sm text-slate-600">This route is reserved for internal operators. Client-facing users do not have access to deal SLA or intervention queues.</p>
          <p className="mt-2 text-xs text-slate-500">Signed in role: {String(user?.role || 'unknown')}</p>
        </div>
      </div>
    );
  }

  if (loading && !summary) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading deal escalations...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#fefce8_45%,#f8fafc_100%)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Deal SLA / Escalation Engine</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Client stall and intervention queue</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">This screen turns funding-stage drift into concrete intervention work. It tracks days since last client action, days since last funding motion, overdue tasks, and stalled optional capital paths.</p>
          </div>
          <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh Queue'}
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
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">SLA Window</label>
            <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={hours} onChange={(event) => setHours(Number(event.target.value))}>
              <option value={168}>7 days</option>
              <option value={336}>14 days</option>
              <option value={504}>21 days</option>
              <option value={720}>30 days</option>
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Snapshot Time</div>
            <div className="mt-2 text-base font-semibold text-slate-900">{generatedAt ? new Date(generatedAt).toLocaleString() : 'Awaiting snapshot'}</div>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {summary ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              summaryCard('Healthy', summary.healthy, 'Clients operating within expected motion.', 'success'),
              summaryCard('Watch', summary.watch, 'Clients drifting but not yet in material risk.', 'warning'),
              summaryCard('At Risk', summary.at_risk, 'Clients that need prompt staff intervention.', 'warning'),
              summaryCard('Escalated', summary.escalated, 'Clients already in hard escalation territory.', 'danger'),
              summaryCard('Overdue Credit / Business Tasks', summary.overdue_credit_business_tasks, 'Outstanding early-stage tasks suppressing readiness.', 'danger'),
              summaryCard('Overdue Capital Tasks', summary.overdue_capital_tasks, 'Post-funding tasks holding back reserve-first discipline.', 'warning'),
            ]}
          </div>

          <TrendPanel
            title="Escalation trend"
            description="Recent snapshots show whether the intervention queue is stabilizing or accumulating pressure across this scope."
            series={[
              { key: 'escalated', label: 'Escalated', colorClass: 'bg-rose-400', points: history.escalated },
              { key: 'at-risk', label: 'At Risk', colorClass: 'bg-amber-400', points: history.atRisk },
              { key: 'watch', label: 'Watch', colorClass: 'bg-sky-400', points: history.watch },
              { key: 'pending-reviews', label: 'Pending Reviews', colorClass: 'bg-slate-500', points: history.pendingReviews },
            ]}
          />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <AtRiskClientsPanel
              items={items}
              title="Intervention queue"
              description="Each card explains the stalled stage, why the deal is at risk, and what the operator should do next."
              onOpenDocuments={openClientDocuments}
              onOpenFunding={openClientFunding}
              onOpenReviewQueue={openClientReviewQueue}
            />
            <div className="space-y-4">
              <DealEscalationRules rules={rules} />
              <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">QA / Notes</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">Current grounding and limits</h2>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  {dependencyNotes.map((note) => (
                    <div key={note} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">{note}</div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-700 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Empty Snapshot</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">No deal escalation snapshot is available yet</h2>
          <p className="mt-2 text-sm text-slate-500">Once client workflow records exist for funding, tasks, communications, and capital setup, this engine will classify risk automatically.</p>
        </div>
      )}
    </div>
  );
}