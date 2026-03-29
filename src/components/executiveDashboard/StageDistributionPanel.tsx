import React from 'react';
import { DistributionRow } from '../../hooks/useExecutiveMetrics';

type Props = {
  rows: DistributionRow[];
  onOpenFunding: () => void;
};

export default function StageDistributionPanel({ rows, onOpenFunding }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Funding Progression</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Stage distribution</h2>
          <p className="mt-1 text-sm text-slate-500">Where clients currently sit across the funding-first lifecycle.</p>
        </div>
        <button type="button" onClick={onOpenFunding} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700">
          Open Funding Outcomes
        </button>
      </div>
      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                <p className="mt-1 text-sm text-slate-500">{row.helper}</p>
              </div>
              <div className="text-2xl font-black tracking-tight text-slate-900">{row.count}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}