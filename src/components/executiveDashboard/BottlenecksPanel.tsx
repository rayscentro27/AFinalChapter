import React from 'react';
import { AttentionRow } from '../../hooks/useExecutiveMetrics';

type Props = {
  rows: AttentionRow[];
  commonBlockers: Array<{ label: string; count: number }>;
  onOpenDocuments: () => void;
};

function toneClass(tone: AttentionRow['tone']) {
  if (tone === 'danger') return 'border-rose-200 bg-rose-50';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50';
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50';
  return 'border-slate-200 bg-slate-50';
}

export default function BottlenecksPanel({ rows, commonBlockers, onOpenDocuments }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Readiness Bottlenecks</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Where clients are getting stuck</h2>
          <p className="mt-1 text-sm text-slate-500">Focused on missing credit inputs, unresolved readiness work, and urgent task pressure.</p>
        </div>
        <button type="button" onClick={onOpenDocuments} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700">
          Open Documents
        </button>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className={`rounded-2xl border p-4 ${toneClass(row.tone)}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{row.label}</p>
              <div className="text-2xl font-black tracking-tight text-slate-900">{row.count}</div>
            </div>
            <p className="mt-2 text-sm text-slate-600">{row.helper}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Common Blockers</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {commonBlockers.length ? commonBlockers.map((item) => (
            <span key={item.label} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-slate-600">
              {item.label} ({item.count})
            </span>
          )) : <span className="text-sm text-slate-500">No common blockers detected from current urgent task data.</span>}
        </div>
      </div>
    </section>
  );
}