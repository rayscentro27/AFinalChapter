import React from 'react';
import { LifecycleReminder, ReminderAction } from '../../services/lifecycleReminderService';

type Props = {
  reminder: LifecycleReminder;
  onAction: (reminderId: string, action: ReminderAction) => void;
};

export default function ReminderStatusControls({ reminder, onAction }: Props) {
  if (['completed', 'dismissed', 'suppressed'].includes(reminder.status)) {
    return (
      <button
        type="button"
        onClick={() => onAction(reminder.id, 'reactivate')}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700"
      >
        Reactivate Thread
      </button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onAction(reminder.id, 'mark_sent')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700">
        Mark Posted
      </button>
      <button type="button" onClick={() => onAction(reminder.id, 'suppress_7d')} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700">
        Snooze 7d
      </button>
      <button type="button" onClick={() => onAction(reminder.id, 'dismiss')} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700">
        Dismiss
      </button>
      <button type="button" onClick={() => onAction(reminder.id, 'complete')} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">
        Mark Resolved
      </button>
    </div>
  );
}