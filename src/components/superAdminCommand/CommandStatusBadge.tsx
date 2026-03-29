import React from 'react';

type Props = {
  label: string;
};

function toneClass(label: string) {
  const normalized = String(label || '').toLowerCase();
  if (normalized.includes('reject') || normalized.includes('failed') || normalized.includes('error')) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (normalized.includes('pending') || normalized.includes('queued') || normalized.includes('review')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (normalized.includes('complete') || normalized.includes('accepted') || normalized.includes('valid')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

export default function CommandStatusBadge({ label }: Props) {
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${toneClass(label)}`}>{label || 'unknown'}</span>;
}