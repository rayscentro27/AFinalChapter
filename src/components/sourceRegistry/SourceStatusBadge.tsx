import React from 'react';

type Props = {
  status: string;
};

function toneClass(status: string) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('inactive') || normalized.includes('disabled')) return 'border-slate-300 bg-slate-100 text-slate-600';
  if (normalized.includes('warning') || normalized.includes('duplicate') || normalized.includes('review')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (normalized.includes('active') || normalized.includes('ready') || normalized.includes('scanned')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

export default function SourceStatusBadge({ status }: Props) {
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${toneClass(status)}`}>{status || 'unknown'}</span>;
}