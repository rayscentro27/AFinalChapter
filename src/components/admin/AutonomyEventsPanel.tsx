import React from 'react';
import { AutonomyEvent } from '../../hooks/useAutonomyDashboard';

type Props = {
  events: AutonomyEvent[];
};

function badgeTone(status: string) {
  const normalized = String(status || '').toLowerCase();
  if (['processed', 'completed', 'success'].includes(normalized)) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (['failed', 'error'].includes(normalized)) return 'border-red-500/30 bg-red-500/10 text-red-200';
  return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
}

export default function AutonomyEventsPanel({ events }: Props) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900 overflow-hidden">
      <div className="border-b border-white/10 px-6 py-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Events Panel</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm text-slate-100">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-widest text-slate-400">
              <th className="px-6 py-3">Event</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Client</th>
              <th className="px-6 py-3">Processed By</th>
              <th className="px-6 py-3">Payload</th>
              <th className="px-6 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td className="px-6 py-8 text-slate-400" colSpan={6}>No system events recorded in this window.</td>
              </tr>
            ) : events.map((event) => (
              <tr key={event.id} className="border-t border-white/5 align-top">
                <td className="px-6 py-4">
                  <div className="font-semibold text-slate-100">{event.event_type}</div>
                  {event.error_msg ? <div className="mt-1 text-xs text-red-300">{event.error_msg}</div> : null}
                </td>
                <td className="px-6 py-4">
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${badgeTone(event.status)}`}>
                    {event.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-300">{event.client_id || '-'}</td>
                <td className="px-6 py-4 text-slate-300">{event.processed_by || '-'}</td>
                <td className="px-6 py-4 text-xs text-slate-400">{event.payload_preview || '-'}</td>
                <td className="px-6 py-4 text-slate-400">{new Date(event.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}