import React from 'react';
import { AttentionRow } from '../../hooks/useExecutiveMetrics';

type Props = {
  rows: AttentionRow[];
  onOpenAnalytics: () => void;
  onOpenReviewQueue: () => void;
};

export default function ReviewWorkloadPanel({ rows, onOpenAnalytics, onOpenReviewQueue }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Review / Admin Workload</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Current internal queue pressure</h2>
          <p className="mt-1 text-sm text-slate-500">Pending reviews plus lifecycle-managed research content state.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onOpenAnalytics} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700">
            Open Review Analytics
          </button>
          <button type="button" onClick={onOpenReviewQueue} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700">
            Open Content Review
          </button>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{row.label}</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{row.count}</p>
            <p className="mt-2 text-sm text-slate-600">{row.helper}</p>
          </div>
        ))}
      </div>
    </section>
  );
}