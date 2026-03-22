import React from 'react';
import { AttentionRow } from '../../hooks/useExecutiveMetrics';

type Props = {
  rows: AttentionRow[];
  onOpenGrants: () => void;
  onOpenTracking: () => void;
};

export default function GrantEngagementPanel({ rows, onOpenGrants, onOpenTracking }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Grant Workflow Engagement</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Shortlist, prep, and submissions</h2>
          <p className="mt-1 text-sm text-slate-500">Counts reflect persisted shortlist, draft, and submission workflow state.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onOpenGrants} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700">
            Open Grants Workflow
          </button>
          <button type="button" onClick={onOpenTracking} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700">
            Open Grants Tracking
          </button>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{row.label}</p>
              <p className="text-2xl font-black tracking-tight text-slate-900">{row.count}</p>
            </div>
            <p className="mt-2 text-sm text-slate-600">{row.helper}</p>
          </div>
        ))}
      </div>
    </section>
  );
}