import React from 'react';
import type { OperationalPanel } from '../../hooks/useExecutiveMetrics';

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  rows: OperationalPanel[];
};

function toneClass(tone: OperationalPanel['tone']) {
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50';
  if (tone === 'danger') return 'border-rose-200 bg-rose-50';
  return 'border-slate-200 bg-slate-50';
}

export default function OperationalPulsePanel({ eyebrow, title, description, rows }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className={`rounded-2xl border px-4 py-4 ${toneClass(row.tone)}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{row.label}</p>
              <div className="text-2xl font-black tracking-tight text-slate-900">{row.count}</div>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{row.helper}</p>
          </div>
        ))}
      </div>
    </section>
  );
}