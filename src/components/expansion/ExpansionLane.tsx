import React from 'react';
import CommandStatusBadge from '../superAdminCommand/CommandStatusBadge';
import type { ExpansionRecommendation } from '../../hooks/useAutonomousExpansion';

type Props = {
  title: string;
  description: string;
  items: ExpansionRecommendation[];
  onOpenItem: (item: ExpansionRecommendation) => void;
};

export default function ExpansionLane({ title, description, items, onOpenItem }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No recommendations are available in this lane yet.</div> : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                <div className="mt-1 text-sm text-slate-600">{item.summary || item.rationale || 'Strategic recommendation available.'}</div>
              </div>
              <CommandStatusBadge label={item.confidence} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <CommandStatusBadge label={item.domain} />
              <CommandStatusBadge label={item.category} />
              <button
                type="button"
                onClick={() => onOpenItem(item)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700 hover:bg-slate-100"
              >
                Open
              </button>
            </div>
            {item.rationale ? <div className="mt-3 text-xs leading-5 text-slate-500">{item.rationale}</div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}