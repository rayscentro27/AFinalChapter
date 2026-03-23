import React from 'react';
import BlockersPanel from '../components/ceoBriefing/BlockersPanel';
import ExecutiveBriefingCard from '../components/ceoBriefing/ExecutiveBriefingCard';
import ExecutiveOperationsRollup from '../components/ceoBriefing/ExecutiveOperationsRollup';
import RecentAgentHighlights from '../components/ceoBriefing/RecentAgentHighlights';
import RecommendedActionsPanel from '../components/ceoBriefing/RecommendedActionsPanel';
import TopUpdatesList from '../components/ceoBriefing/TopUpdatesList';
import { useCeoBriefingDashboard } from '../hooks/useCeoBriefingDashboard';
import { useExecutiveOperationsRollup } from '../hooks/useExecutiveOperationsRollup';

function alertTone(items: string[]) {
  if (items.length === 0) return 'border-slate-200 bg-white';
  return 'border-amber-200 bg-amber-50';
}

function openCommandInbox() {
  window.history.pushState({}, '', '/admin/command-inbox');
  window.location.hash = 'admin_command_inbox';
}

function openSourceRegistry() {
  window.history.pushState({}, '', '/admin/source-registry');
  window.location.hash = 'admin_source_registry';
}

export default function AdminCeoBriefingPage() {
  const { user, checkingAccess, isAuthorized, loading, refreshing, error, hours, setHours, limit, setLimit, briefing, recentHighlights, generatedAt, refresh } = useCeoBriefingDashboard();
  const operations = useExecutiveOperationsRollup();

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying CEO briefing access...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Unauthorized</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900">Internal executive briefing access required</h1>
          <p className="mt-3 text-sm text-slate-600">This route is reserved for internal/admin users only.</p>
          <p className="mt-2 text-xs text-slate-500">Signed in role: {String(user?.role || 'unknown')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f6fdf9_46%,#f8fafc_100%)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">CEO Briefing Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Executive summary view</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">A calm super-admin surface for the latest executive briefing, critical alerts, blockers, actions, and recent agent-level highlights.</p>
          </div>
          <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh Briefing'}
          </button>
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
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Highlight Count</label>
            <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
              <option value={4}>4 highlights</option>
              <option value={8}>8 highlights</option>
              <option value={12}>12 highlights</option>
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Snapshot Time</div>
            <div className="mt-2 text-base font-semibold text-slate-900">{generatedAt ? new Date(generatedAt).toLocaleString() : 'Awaiting snapshot'}</div>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {loading && !briefing ? <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Loading CEO briefing dashboard...</div> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <ExecutiveBriefingCard briefing={briefing} />
        <section className={`rounded-[2rem] border p-5 shadow-sm ${alertTone(briefing?.criticalAlerts || [])}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Critical Alerts</p>
          <div className="mt-4 space-y-3">
            {(briefing?.criticalAlerts || []).length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No critical alerts were included in the latest briefing.</div> : null}
            {(briefing?.criticalAlerts || []).map((alert) => (
              <div key={alert} className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-700">{alert}</div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <TopUpdatesList items={briefing?.topUpdates || []} />
        <BlockersPanel items={briefing?.blockers || []} />
        <RecommendedActionsPanel items={briefing?.recommendedActions || []} />
      </div>

      <ExecutiveOperationsRollup
        loading={operations.loading || operations.checkingAccess}
        refreshing={operations.refreshing}
        error={operations.error}
        counts={operations.rollup.counts}
        pendingApprovals={operations.rollup.pendingApprovals}
        failedCommands={operations.rollup.failedCommands}
        pausedSources={operations.rollup.pausedSources}
        pausedSchedules={operations.rollup.pausedSchedules}
        sourcesNeedingReview={operations.rollup.sourcesNeedingReview}
        onRefresh={() => { void operations.refresh(); }}
        onOpenCommandInbox={openCommandInbox}
        onOpenSourceRegistry={openSourceRegistry}
      />

      <RecentAgentHighlights items={recentHighlights} />
    </div>
  );
}