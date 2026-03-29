import React from 'react';
import type { AgentSummaryHighlight } from '../../hooks/useCeoBriefingDashboard';

type Props = {
  items: AgentSummaryHighlight[];
};

function riskTone(riskLevel: string) {
  const normalized = String(riskLevel || '').toLowerCase();
  if (normalized.includes('critical') || normalized.includes('high')) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (normalized.includes('moderate') || normalized.includes('warn')) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

export default function RecentAgentHighlights({ items }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Recent Agent Summary Highlights</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No recent highlights are available yet.</div> : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{item.agentName}</h3>
                <p className="mt-1 text-sm text-slate-700">{item.headline}</p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${riskTone(item.riskLevel)}`}>
                {item.riskLevel}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{item.summary || 'No detailed summary was returned for this run.'}</p>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>Status: {item.status}</span>
              <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Timestamp unavailable'}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}