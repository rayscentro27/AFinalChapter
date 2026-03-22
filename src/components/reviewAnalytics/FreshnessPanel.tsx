import React from 'react';
import { FreshnessBucket, ReviewDashboardQuery } from '../../services/reviewAnalyticsService';

type Props = {
  buckets: FreshnessBucket[];
  onDrillIn: (query: ReviewDashboardQuery) => void;
};

function toneClass(tone: FreshnessBucket['tone']) {
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50';
  if (tone === 'danger') return 'border-red-200 bg-red-50';
  return 'border-slate-200 bg-slate-50';
}

export default function FreshnessPanel({ buckets, onDrillIn }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Freshness</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-900">Staleness and lifecycle watchlist</h2>
      <p className="mt-1 text-sm text-slate-500">This slice uses live review fields already exposed today: review status, publication state, expiration timestamps, and lifecycle update age.</p>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {buckets.map((bucket) => (
          <button
            key={bucket.id}
            type="button"
            onClick={() => onDrillIn(bucket.query)}
            className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${toneClass(bucket.tone)}`}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">{bucket.label}</p>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{bucket.value}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{bucket.helper}</p>
          </button>
        ))}
      </div>
    </section>
  );
}