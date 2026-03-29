import React from 'react';
import { AttentionRow } from '../../hooks/useExecutiveMetrics';

type Props = {
  rows: AttentionRow[];
  onOpenFunding: () => void;
};

export default function CapitalPathPanel({ rows, onOpenFunding }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Capital Path Activity</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Post-funding path selection</h2>
          <p className="mt-1 text-sm text-slate-500">Reserve-first protection, business growth, and optional trading/grant branches.</p>
        </div>
        <button type="button" onClick={onOpenFunding} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700">
          Open Funding Outcomes
        </button>
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