import React from 'react';
import { PriorityAttentionItem, ReviewDashboardQuery } from '../../services/reviewAnalyticsService';

type Props = {
  items: PriorityAttentionItem[];
  onDrillIn: (query: ReviewDashboardQuery) => void;
};

function toneAccent(tone: PriorityAttentionItem['tone']) {
  if (tone === 'danger') return 'border-red-200 bg-red-50';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50';
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50';
  return 'border-slate-200 bg-slate-50';
}

export default function PriorityAttentionList({ items, onDrillIn }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Priority Attention</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">What should be reviewed first</h2>
          <p className="mt-1 text-sm text-slate-500">Highest-pressure items are ranked by expiration risk, long-pending age, and approved-but-unpublished status.</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {items.length ? items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onDrillIn(item.query)}
            className={`flex w-full items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white ${toneAccent(item.tone)}`}
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{item.subtitle}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.reason}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Age signal</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{item.ageLabel}</p>
            </div>
          </button>
        )) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No urgent freshness pressure detected in the current live review snapshot.
          </div>
        )}
      </div>
    </section>
  );
}