import React from 'react';
import { LifecycleReminder } from '../../services/lifecycleReminderService';
import ReminderReasonBadge from './ReminderReasonBadge';
import ReminderStatusControls from './ReminderStatusControls';

type Props = {
  reminders: LifecycleReminder[];
  onAction: (reminderId: string, action: 'mark_sent' | 'dismiss' | 'complete' | 'suppress_7d' | 'reactivate') => void;
};

export default function ReminderQueuePanel({ reminders, onAction }: Props) {
  if (!reminders.length) {
    return <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">No internal communication candidates matched the current filters.</div>;
  }

  return (
    <div className="space-y-3">
      {reminders.map((reminder) => (
        <section key={reminder.id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <ReminderReasonBadge reminder={reminder} />
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">{reminder.status}</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">{reminder.channel}</span>
              </div>
              <h2 className="mt-3 text-lg font-semibold text-slate-900">{reminder.clientLabel}: {reminder.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{reminder.summary}</p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>Stage: {reminder.currentStage.replace(/_/g, ' ')}</div>
              <div className="mt-1">Thread Target: {reminder.target}</div>
              <div className="mt-1">Post Count: {reminder.sendCount}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Why This Message Exists</p>
              <p className="mt-2 text-sm text-slate-700">{reminder.internalReason}</p>
              <p className="mt-2 text-xs text-slate-500">Trigger: {reminder.trigger} • Source: {reminder.source} • Channel: {reminder.channel}</p>
              {reminder.dependencyNote ? <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500">{reminder.dependencyNote}</p> : null}
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Communication Controls</p>
              <div className="mt-3">
                <ReminderStatusControls reminder={reminder} onAction={onAction} />
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}