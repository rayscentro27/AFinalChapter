import React from 'react';
import { AttentionRow } from '../../hooks/useExecutiveMetrics';

type Props = {
  rows: AttentionRow[];
};

export default function TradingEngagementPanel({ rows }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Trading Engagement</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-900">Access-state summary</h2>
      <p className="mt-1 text-sm text-slate-500">This slice is grounded in persisted gating milestones, not client-side content view events.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{row.label}</p>
              <p className="text-2xl font-black tracking-tight text-slate-900">{row.count}</p>
            </div>
            <p className="mt-2 text-sm text-slate-600">{row.helper}</p>
          </div>
        ))}
      </div>
    </section>
  );
}