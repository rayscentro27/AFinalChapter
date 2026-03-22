import React from 'react';
import { ExecutiveMetric } from '../../hooks/useExecutiveMetrics';

type Props = {
  metrics: ExecutiveMetric[];
};

function toneClass(tone: ExecutiveMetric['tone']) {
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (tone === 'danger') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-slate-200 bg-white text-slate-900';
}

export default function MetricsOverviewRow({ metrics }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {metrics.map((metric) => (
        <div key={metric.label} className={`rounded-[1.75rem] border p-5 shadow-sm ${toneClass(metric.tone)}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">{metric.label}</p>
          <p className="mt-3 text-3xl font-black tracking-tight">{metric.value}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{metric.helper}</p>
        </div>
      ))}
    </div>
  );
}