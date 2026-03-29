import React from 'react';
import type { RelatedAgentSummary } from '../../hooks/useCommandInbox';

type Props = {
  items: RelatedAgentSummary[];
};

export default function RelatedAgentSummaries({ items }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Related Agent Summaries</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No follow-up agent summaries are linked yet.</div> : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">{item.agentName}</div>
              <div className="text-xs text-slate-500">{item.completedAt ? new Date(item.completedAt).toLocaleString() : 'Pending'}</div>
            </div>
            <div className="mt-2 text-sm text-slate-700">{item.headline}</div>
            <div className="mt-2 text-xs text-slate-500">Status: {item.status}</div>
          </div>
        ))}
      </div>
    </section>
  );
}