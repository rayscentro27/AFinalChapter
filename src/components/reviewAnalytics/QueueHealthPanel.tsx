import React from 'react';
import { QueueHealthRow, ReviewDashboardQuery } from '../../services/reviewAnalyticsService';

type Props = {
  rows: QueueHealthRow[];
  backlogLeader: string;
  lastUpdatedLabel: string;
  onDrillIn: (query: ReviewDashboardQuery) => void;
};

function tonePill(tone: QueueHealthRow['tone']) {
  if (tone === 'success') return 'bg-emerald-100 text-emerald-700';
  if (tone === 'warning') return 'bg-amber-100 text-amber-700';
  if (tone === 'danger') return 'bg-red-100 text-red-700';
  return 'bg-slate-100 text-slate-600';
}

export default function QueueHealthPanel({ rows, backlogLeader, lastUpdatedLabel, onDrillIn }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Queue Health</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Operational backlog summary</h2>
          <p className="mt-1 text-sm text-slate-500">{backlogLeader}. Last refreshed from live review data at {lastUpdatedLabel}.</p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-slate-600">Live snapshot</div>
      </div>

      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onDrillIn(row.query)}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{row.label}</span>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${tonePill(row.tone)}`}>{row.value}</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{row.helper}</p>
            </div>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Drill in</span>
          </button>
        ))}
      </div>
    </section>
  );
}