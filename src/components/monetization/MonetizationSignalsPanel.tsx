import React from 'react';
import type { MonetizationInputSignal } from '../../hooks/useMonetizationOpportunities';

type Props = {
  items: MonetizationInputSignal[];
  onOpenSignal: (item: MonetizationInputSignal) => void;
};

export default function MonetizationSignalsPanel({ items, onOpenSignal }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Source Inputs</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-900">Cross-domain insights feeding revenue suggestions</h2>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No monetization source signals are available yet.</div> : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{item.category}</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="text-2xl font-black tracking-tight text-slate-900">{item.count}</div>
                <button
                  type="button"
                  onClick={() => onOpenSignal(item)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700 hover:bg-slate-100"
                >
                  Open
                </button>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{item.helper || 'This source family contributes signal volume to monetization ranking.'}</p>
          </div>
        ))}
      </div>
    </section>
  );
}