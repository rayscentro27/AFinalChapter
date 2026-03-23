import React from 'react';
import type { SnapshotHistoryPoint } from '../../hooks/useExecutiveMetrics';

type TrendSeries = {
  key: string;
  label: string;
  colorClass: string;
  points: SnapshotHistoryPoint[];
};

type Props = {
  title: string;
  description: string;
  series: TrendSeries[];
};

function maxValue(series: TrendSeries[]) {
  return Math.max(1, ...series.flatMap((item) => item.points.map((point) => point.value)));
}

function trendDelta(points: SnapshotHistoryPoint[]) {
  const latest = points[points.length - 1]?.value ?? 0;
  const previous = points[points.length - 2]?.value;

  if (previous === undefined) {
    return {
      label: 'No prior bucket',
      valueLabel: 'n/a',
      toneClass: 'text-slate-500',
    };
  }

  const delta = latest - previous;
  if (delta > 0) {
    return {
      label: 'Rising vs previous bucket',
      valueLabel: `+${delta}`,
      toneClass: 'text-rose-600',
    };
  }

  if (delta < 0) {
    return {
      label: 'Falling vs previous bucket',
      valueLabel: String(delta),
      toneClass: 'text-emerald-600',
    };
  }

  return {
    label: 'Flat vs previous bucket',
    valueLabel: '0',
    toneClass: 'text-slate-500',
  };
}

export default function TrendPanel({ title, description, series }: Props) {
  const labels = series.find((item) => item.points.length > 0)?.points.map((point) => point.label) || [];
  const scaleMax = maxValue(series);

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Operational Trends</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>

      <div className="mt-5 space-y-4">
        {series.map((item) => {
          const delta = trendDelta(item.points);

          return (
            <div key={item.key} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${item.colorClass}`} />
                    <span className="text-sm font-semibold text-slate-900">{item.label}</span>
                  </div>
                  <div className={`mt-1 text-[11px] font-semibold ${delta.toneClass}`}>
                    {delta.label} ({delta.valueLabel})
                  </div>
                </div>
                <span className="text-xs text-slate-500">Latest: {item.points[item.points.length - 1]?.value ?? 0}</span>
              </div>

              <div className="mt-4 flex min-h-[140px] items-end gap-2">
                {item.points.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-6 text-sm text-slate-500">
                    Trend history will populate after more snapshots are captured.
                  </div>
                ) : (
                  item.points.map((point) => {
                    const height = Math.max(10, Math.round((point.value / scaleMax) * 120));
                    return (
                      <div key={`${item.key}-${point.bucketStartAt}`} className="flex flex-1 flex-col items-center gap-2">
                        <div className="text-[11px] font-semibold text-slate-600">{point.value}</div>
                        <div className="flex w-full items-end justify-center rounded-t-xl bg-white px-1 pt-2">
                          <div className={`w-full rounded-t-xl ${item.colorClass}`} style={{ height }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {labels.length > 0 ? (
        <div className="mt-4 grid gap-2 text-[11px] text-slate-500" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
          {labels.map((label) => (
            <div key={label} className="text-center">{label}</div>
          ))}
        </div>
      ) : null}
    </section>
  );
}