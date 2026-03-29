import React from 'react';

type Props = {
  approvalRequired: boolean;
  approvalStatus: string;
};

function toneClass(approvalRequired: boolean, approvalStatus: string) {
  const normalized = String(approvalStatus || '').toLowerCase();
  if (!approvalRequired) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized.includes('approved')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized.includes('rejected')) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (normalized.includes('pending') || normalized.includes('requested')) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

export default function CommandApprovalStatus({ approvalRequired, approvalStatus }: Props) {
  const label = approvalRequired ? `Approval: ${approvalStatus || 'required'}` : 'Approval: not required';
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${toneClass(approvalRequired, approvalStatus)}`}>{label}</span>;
}