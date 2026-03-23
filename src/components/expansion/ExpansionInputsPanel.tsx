import React from 'react';
import type { ExpansionInput } from '../../hooks/useAutonomousExpansion';

type Props = {
  items: ExpansionInput[];
};

export default function ExpansionInputsPanel({ items }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Expansion Inputs</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-900">What the system used to suggest growth</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500 xl:col-span-3">No expansion inputs are available yet.</div> : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{item.category}</div>
            <div className="mt-3 text-2xl font-black tracking-tight text-slate-900">{item.count}</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{item.label}</div>
            <div className="mt-2 text-sm leading-6 text-slate-600">{item.helper || 'This input contributes to autonomous expansion ranking.'}</div>
          </div>
        ))}
      </div>
    </section>
  );
}