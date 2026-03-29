import React from 'react';
import { getReminderTone, getReminderTypeLabel, LifecycleReminder } from '../../services/lifecycleReminderService';

type Props = {
  reminder: LifecycleReminder;
};

function toneClass(reminder: LifecycleReminder) {
  const tone = getReminderTone(reminder.priority);
  if (tone === 'danger') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function ReminderReasonBadge({ reminder }: Props) {
  return (
    <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${toneClass(reminder)}`}>
      {getReminderTypeLabel(reminder.type)}
    </span>
  );
}