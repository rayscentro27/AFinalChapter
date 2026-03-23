import React from 'react';

type Props = {
  paused: boolean;
  disabled?: boolean;
  pausedLabel: string;
  resumedLabel: string;
  onPause: () => void;
  onResume: () => void;
};

export default function PauseResumeToggle({ paused, disabled, pausedLabel, resumedLabel, onPause, onResume }: Props) {
  return (
    <button type="button" disabled={disabled} onClick={paused ? onResume : onPause} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700 disabled:opacity-50">
      {paused ? resumedLabel : pausedLabel}
    </button>
  );
}