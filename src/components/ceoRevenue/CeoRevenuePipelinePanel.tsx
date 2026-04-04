import React from 'react';
import type { CeoRevenueDashboardSnapshot } from '../../hooks/useCeoRevenueDashboard';

function formatMoney(centsValue: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format((Number(centsValue || 0) || 0) / 100);
}

export default function CeoRevenuePipelinePanel({ pipeline }: { pipeline: CeoRevenueDashboardSnapshot['pipeline'] }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Revenue Pipeline</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">Stage-by-stage commission and approved volume</h2>
      <div className="mt-4 grid gap-3 xl:grid-cols-4">
        {pipeline.map((stage) => (
          <article key={stage.label} className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-black tracking-tight text-slate-900">{stage.label}</p>
            <p className="mt-3 text-[1.7rem] font-semibold text-slate-950">{formatMoney(stage.commissionCents)}</p>
            <p className="mt-1 text-sm text-slate-600">{stage.count} rows</p>
            <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Approved volume</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{formatMoney(stage.approvedCents)}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{stage.helper}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
