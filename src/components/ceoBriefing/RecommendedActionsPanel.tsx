import React from 'react';

type Props = {
  items: string[];
};

export default function RecommendedActionsPanel({ items }: Props) {
  return (
    <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-600">Recommended Actions</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? <div className="rounded-xl border border-dashed border-emerald-200 bg-white px-4 py-5 text-sm text-emerald-700">No recommended actions were returned yet.</div> : null}
        {items.map((item) => (
          <div key={item} className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700">{item}</div>
        ))}
      </div>
    </section>
  );
}