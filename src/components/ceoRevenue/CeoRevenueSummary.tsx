import React from 'react';
import type { CeoRevenueDashboardSnapshot } from '../../hooks/useCeoRevenueDashboard';

function formatMoney(centsValue: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format((Number(centsValue || 0) || 0) / 100);
}

function toneClass(tone?: 'default' | 'success' | 'warning') {
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

export default function CeoRevenueSummary({ summary }: { summary: CeoRevenueDashboardSnapshot['summary'] }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Revenue Summary</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summary.map((item) => (
          <article key={item.label} className="rounded-[1.4rem] border border-slate-200 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-4">
            <div className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${toneClass(item.tone)}`}>
              {item.label}
            </div>
            <div className="mt-4 text-[2rem] font-semibold tracking-tight text-slate-950">{formatMoney(item.value)}</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.helper}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
