import React from 'react';

type Props = {
  disabled?: boolean;
  onClick: () => void;
};

export default function RunNowButton({ disabled, onClick }: Props) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700 disabled:opacity-50">
      Run Now
    </button>
  );
}