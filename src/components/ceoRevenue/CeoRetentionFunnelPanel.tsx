import React from 'react';
import type { CeoRevenueDashboardSnapshot } from '../../hooks/useCeoRevenueDashboard';

export default function CeoRetentionFunnelPanel({ funnel }: { funnel: CeoRevenueDashboardSnapshot['retentionFunnel'] }) {
  const max = Math.max(...funnel.map((item) => item.count), 1);

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Retention Funnel</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">Journey stage carry-through</h2>
      <div className="mt-5 space-y-3">
        {funnel.map((stage) => (
          <div key={stage.key} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black tracking-tight text-slate-900">{stage.label}</p>
                <p className="mt-1 text-sm text-slate-600">{stage.count} distinct users reached this stage.</p>
              </div>
              <p className="text-base font-semibold text-slate-900">{stage.count}</p>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-[linear-gradient(90deg,#2563EB_0%,#22C3EE_100%)]"
                style={{ width: `${Math.max(8, Math.round((stage.count / max) * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
