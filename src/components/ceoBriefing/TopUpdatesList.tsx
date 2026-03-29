import React from 'react';

type Props = {
  items: string[];
};

export default function TopUpdatesList({ items }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Top Updates</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No update bullets are available for this briefing yet.</div> : null}
        {items.map((item) => (
          <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{item}</div>
        ))}
      </div>
    </section>
  );
}