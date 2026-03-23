import React from 'react';

type Props = {
  status: string;
};

function toneClass(status: string) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('paused')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (normalized.includes('active') || normalized.includes('scheduled') || normalized.includes('ready')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized.includes('error') || normalized.includes('blocked')) return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

export default function ScheduleStatusBadge({ status }: Props) {
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${toneClass(status)}`}>{status || 'unknown'}</span>;
}