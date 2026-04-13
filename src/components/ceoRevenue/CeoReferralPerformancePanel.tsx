import React from 'react';
import type { CeoRevenueDashboardSnapshot } from '../../hooks/useCeoRevenueDashboard';

function formatMoney(centsValue: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format((Number(centsValue || 0) || 0) / 100);
}

export default function CeoReferralPerformancePanel({ referral }: { referral: CeoRevenueDashboardSnapshot['referral'] }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Referral Performance</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">Invite loop visibility</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Prompts shown</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{referral.promptsShown}</p>
        </div>
        <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Links copied</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{referral.linksCopied}</p>
        </div>
        <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Projected referral commission</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatMoney(referral.projectedCommissionCents)}</p>
        </div>
        <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Copy-through rate</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{referral.copyThroughRate}%</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{referral.helper}</p>
    </section>
  );
}
