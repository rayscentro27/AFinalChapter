import React from 'react';
import { AnalyticsMetric, ReviewDashboardQuery } from '../../services/reviewAnalyticsService';

type Props = {
  metrics: AnalyticsMetric[];
  onDrillIn: (query: ReviewDashboardQuery) => void;
};

function toneClass(tone: AnalyticsMetric['tone']) {
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (tone === 'danger') return 'border-red-200 bg-red-50 text-red-800';
  return 'border-slate-200 bg-white text-slate-900';
}

export default function MetricCardsRow({ metrics, onDrillIn }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {metrics.map((metric) => (
        <button
          key={metric.id}
          type="button"
          onClick={() => onDrillIn(metric.query)}
          className={`rounded-[1.75rem] border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${toneClass(metric.tone)}`}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">{metric.label}</p>
          <p className="mt-3 text-3xl font-black tracking-tight">{metric.value}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{metric.helper}</p>
          <p className="mt-4 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Open filtered review queue</p>
        </button>
      ))}
    </div>
  );
}