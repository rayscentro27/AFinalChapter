import React from 'react';
import type { AdminCommandRecord } from '../../hooks/useSuperAdminCommandCenter';
import type { SourceRegistryRecord } from '../../hooks/useSourceRegistry';

type RollupCounts = {
  pendingApprovals: number;
  failedCommands: number;
  pausedSources: number;
  pausedSchedules: number;
  sourcesNeedingReview: number;
};

type Props = {
  loading: boolean;
  refreshing: boolean;
  error: string;
  counts: RollupCounts;
  pendingApprovals: AdminCommandRecord[];
  failedCommands: AdminCommandRecord[];
  pausedSources: SourceRegistryRecord[];
  pausedSchedules: SourceRegistryRecord[];
  sourcesNeedingReview: SourceRegistryRecord[];
  onRefresh: () => void;
  onOpenCommandInbox: () => void;
  onOpenSourceRegistry: () => void;
};

function tone(value: number) {
  return value > 0 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600';
}

function listTone(kind: 'risk' | 'neutral') {
  return kind === 'risk' ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50';
}

function commandTimestamp(item: AdminCommandRecord) {
  return item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Timestamp unavailable';
}

function sourceTimestamp(value: string) {
  return value ? new Date(value).toLocaleString() : 'Not scheduled';
}

export default function ExecutiveOperationsRollup({
  loading,
  refreshing,
  error,
  counts,
  pendingApprovals,
  failedCommands,
  pausedSources,
  pausedSchedules,
  sourcesNeedingReview,
  onRefresh,
  onOpenCommandInbox,
  onOpenSourceRegistry,
}: Props) {
  const hasSignals = counts.pendingApprovals + counts.failedCommands + counts.pausedSources + counts.pausedSchedules + counts.sourcesNeedingReview > 0;

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Executive Operations Rollup</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Approvals, pauses, and failures at a glance</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">This rollup pulls directly from the command center and source registry so the executive briefing includes current operator-facing risk signals.</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-700" onClick={onOpenCommandInbox}>Open Command Inbox</button>
          <button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-700" onClick={onOpenSourceRegistry}>Open Source Registry</button>
          <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Refreshing...' : 'Refresh Rollup'}</button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className={`rounded-[1.5rem] border px-4 py-4 ${tone(counts.pendingApprovals)}`}>
          <div className="text-[10px] font-black uppercase tracking-[0.22em]">Pending Approvals</div>
          <div className="mt-3 text-3xl font-black tracking-tight">{counts.pendingApprovals}</div>
        </div>
        <div className={`rounded-[1.5rem] border px-4 py-4 ${tone(counts.failedCommands)}`}>
          <div className="text-[10px] font-black uppercase tracking-[0.22em]">Failed Commands</div>
          <div className="mt-3 text-3xl font-black tracking-tight">{counts.failedCommands}</div>
        </div>
        <div className={`rounded-[1.5rem] border px-4 py-4 ${tone(counts.pausedSources)}`}>
          <div className="text-[10px] font-black uppercase tracking-[0.22em]">Paused Sources</div>
          <div className="mt-3 text-3xl font-black tracking-tight">{counts.pausedSources}</div>
        </div>
        <div className={`rounded-[1.5rem] border px-4 py-4 ${tone(counts.pausedSchedules)}`}>
          <div className="text-[10px] font-black uppercase tracking-[0.22em]">Schedules Paused</div>
          <div className="mt-3 text-3xl font-black tracking-tight">{counts.pausedSchedules}</div>
        </div>
        <div className={`rounded-[1.5rem] border px-4 py-4 ${tone(counts.sourcesNeedingReview)}`}>
          <div className="text-[10px] font-black uppercase tracking-[0.22em]">Sources Needing Review</div>
          <div className="mt-3 text-3xl font-black tracking-tight">{counts.sourcesNeedingReview}</div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {loading ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">Loading executive operations signals...</div> : null}
      {!loading && !hasSignals ? <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No active approval, execution, or source-pause risks are visible right now.</div> : null}

      {hasSignals ? (
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <div className={`rounded-[1.5rem] border p-4 ${listTone('risk')}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Pending Command Approvals</p>
                <button type="button" className="text-xs font-black uppercase tracking-[0.18em] text-slate-700" onClick={onOpenCommandInbox}>Review</button>
              </div>
              <div className="mt-3 space-y-3">
                {pendingApprovals.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">No commands are waiting for approval.</div> : null}
                {pendingApprovals.map((item) => (
                  <div key={item.id} className="rounded-xl border border-white bg-white px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{item.rawCommand}</div>
                    <div className="mt-2 text-xs text-slate-500">{commandTimestamp(item)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`rounded-[1.5rem] border p-4 ${listTone('risk')}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Failed Command Outcomes</p>
                <button type="button" className="text-xs font-black uppercase tracking-[0.18em] text-slate-700" onClick={onOpenCommandInbox}>Inspect</button>
              </div>
              <div className="mt-3 space-y-3">
                {failedCommands.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">No failed commands are visible.</div> : null}
                {failedCommands.map((item) => (
                  <div key={item.id} className="rounded-xl border border-white bg-white px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{item.rawCommand}</div>
                    <div className="mt-1 text-sm text-slate-600">{item.executionSummary || `Handoff: ${item.queueHandoffState}`}</div>
                    <div className="mt-2 text-xs text-slate-500">{commandTimestamp(item)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className={`rounded-[1.5rem] border p-4 ${listTone('neutral')}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Paused Sources</p>
                <button type="button" className="text-xs font-black uppercase tracking-[0.18em] text-slate-700" onClick={onOpenSourceRegistry}>Open</button>
              </div>
              <div className="mt-3 space-y-3">
                {pausedSources.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">No sources are manually paused.</div> : null}
                {pausedSources.map((item) => (
                  <div key={item.id} className="rounded-xl border border-white bg-white px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                    <div className="mt-1 text-sm text-slate-600">{item.domain || item.url}</div>
                    <div className="mt-2 text-xs text-slate-500">Last run: {sourceTimestamp(item.lastRunAt)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`rounded-[1.5rem] border p-4 ${listTone('neutral')}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Source Review Queue</p>
                <button type="button" className="text-xs font-black uppercase tracking-[0.18em] text-slate-700" onClick={onOpenSourceRegistry}>Review</button>
              </div>
              <div className="mt-3 space-y-3">
                {pausedSchedules.length === 0 && sourcesNeedingReview.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">No paused schedules or flagged sources are visible.</div> : null}
                {pausedSchedules.map((item) => (
                  <div key={`schedule-${item.id}`} className="rounded-xl border border-white bg-white px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                    <div className="mt-1 text-sm text-slate-600">Schedule paused. Next run: {sourceTimestamp(item.nextRunAt)}</div>
                  </div>
                ))}
                {sourcesNeedingReview.map((item) => (
                  <div key={`review-${item.id}`} className="rounded-xl border border-white bg-white px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                    <div className="mt-1 text-sm text-slate-600">{item.warnings[0] || `Last run status: ${item.lastRunStatus}`}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}