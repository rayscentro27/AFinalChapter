import React from 'react';
import type { QueueStatusEvent } from '../../hooks/useCommandInbox';
import CommandStatusBadge from '../superAdminCommand/CommandStatusBadge';

type Props = {
  items: QueueStatusEvent[];
};

export default function QueueStatusTimeline({ items }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Queue Status Timeline</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No queue timeline was returned for this command yet.</div> : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                <div className="mt-1 text-xs text-slate-500">{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown time'}</div>
              </div>
              <CommandStatusBadge label={item.status} />
            </div>
            <div className="mt-2 text-sm text-slate-700">{item.detail || 'No extra detail was provided for this timeline step.'}</div>
          </div>
        ))}
      </div>
    </section>
  );
}