import React from 'react';
import { LifecycleReminder } from '../../services/lifecycleReminderService';
import ReminderReasonBadge from './ReminderReasonBadge';

type Props = {
  reminders: LifecycleReminder[];
  loading: boolean;
  error: string;
  onOpenTarget: (reminder: LifecycleReminder) => void;
  onDismiss: (reminderId: string) => void;
};

export default function ReminderPreviewCard({ reminders, loading, error, onOpenTarget, onDismiss }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Calm Reminder Panel</p>
          <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">Helpful next-step reminders</h3>
          <p className="mt-2 text-sm text-slate-500">These reminders follow the current funding stage and task state. They are meant to guide, not pressure.</p>
        </div>
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-500">Loading reminders...</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {!loading && !error && reminders.length === 0 ? <p className="mt-4 text-sm text-slate-500">No active reminders right now. Keep following the action center and stage guide.</p> : null}

      <div className="mt-5 space-y-3">
        {reminders.slice(0, 3).map((reminder) => (
          <div key={reminder.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <ReminderReasonBadge reminder={reminder} />
                <p className="mt-3 text-sm font-black text-slate-900">{reminder.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{reminder.summary}</p>
              </div>
              <div className="text-xs text-slate-500">Stage: {reminder.currentStage.replace(/_/g, ' ')}</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => onOpenTarget(reminder)} className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white">
                Open Step
              </button>
              <button type="button" onClick={() => onDismiss(reminder.id)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700">
                Not Now
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}