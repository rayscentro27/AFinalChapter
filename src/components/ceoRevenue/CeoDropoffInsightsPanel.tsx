import React from 'react';
import type { CeoRevenueDashboardSnapshot } from '../../hooks/useCeoRevenueDashboard';

type Props = {
  items: CeoRevenueDashboardSnapshot['dropOffInsights'];
  notes: string[];
  onOpenCommissions: () => void;
  onOpenFunnel: () => void;
};

export default function CeoDropoffInsightsPanel(props: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Drop-off Insights</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Where founder attention is most needed</h2>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={props.onOpenCommissions} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-700">
            Open Commissions
          </button>
          <button type="button" onClick={props.onOpenFunnel} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-700">
            Open Funnel Metrics
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_0.95fr]">
        <div className="space-y-3">
          {props.items.map((item) => (
            <article key={item.label} className="rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-black tracking-tight text-slate-900">{item.label}</p>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">
                  {item.dropPercent}% drop
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {item.fromCount} to {item.toCount}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.helper}</p>
            </article>
          ))}
        </div>

        <div className="rounded-[1.35rem] border border-slate-200 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Data source notes</p>
          <div className="mt-3 space-y-2">
            {props.notes.map((note) => (
              <div key={note} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
                {note}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
