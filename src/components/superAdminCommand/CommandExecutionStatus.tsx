import React from 'react';

type Props = {
  queueHandoffState: string;
  executionOutcome: string;
};

function toneClass(value: string) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('failed') || normalized.includes('rejected') || normalized.includes('error')) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (normalized.includes('pending') || normalized.includes('queued') || normalized.includes('running')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (normalized.includes('completed') || normalized.includes('succeeded') || normalized.includes('confirmed')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

export default function CommandExecutionStatus({ queueHandoffState, executionOutcome }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${toneClass(queueHandoffState)}`}>Queue: {queueHandoffState || 'unknown'}</span>
      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${toneClass(executionOutcome)}`}>Execution: {executionOutcome || 'unknown'}</span>
    </div>
  );
}