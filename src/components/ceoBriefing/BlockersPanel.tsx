import React from 'react';

type Props = {
  items: string[];
};

export default function BlockersPanel({ items }: Props) {
  return (
    <section className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-500">Blockers</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? <div className="rounded-xl border border-dashed border-rose-200 bg-white px-4 py-5 text-sm text-rose-700">No blockers were included in the latest briefing.</div> : null}
        {items.map((item) => (
          <div key={item} className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm text-slate-700">{item}</div>
        ))}
      </div>
    </section>
  );
}