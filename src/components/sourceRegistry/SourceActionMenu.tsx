import React from 'react';
import type { SourceRegistryRecord } from '../../hooks/useSourceRegistry';
import PauseResumeToggle from './PauseResumeToggle';
import RunNowButton from './RunNowButton';

type Props = {
  item: SourceRegistryRecord;
  onAction: (payload: { source_id: string; action: 'activate' | 'deactivate' | 'scan_now' | 'set_priority' | 'pause' | 'resume' | 'pause_schedule' | 'resume_schedule'; priority?: number }) => void;
  disabled?: boolean;
};

export default function SourceActionMenu({ item, onAction, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <RunNowButton disabled={disabled} onClick={() => onAction({ source_id: item.id, action: 'scan_now' })} />
      <PauseResumeToggle
        paused={item.paused}
        disabled={disabled}
        pausedLabel="Pause Source"
        resumedLabel="Resume Source"
        onPause={() => onAction({ source_id: item.id, action: 'pause' })}
        onResume={() => onAction({ source_id: item.id, action: 'resume' })}
      />
      <PauseResumeToggle
        paused={item.schedulePaused}
        disabled={disabled}
        pausedLabel="Pause Schedule"
        resumedLabel="Resume Schedule"
        onPause={() => onAction({ source_id: item.id, action: 'pause_schedule' })}
        onResume={() => onAction({ source_id: item.id, action: 'resume_schedule' })}
      />
      <button type="button" disabled={disabled} onClick={() => onAction({ source_id: item.id, action: 'set_priority', priority: Math.min(item.priority + 1, 100) })} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700 disabled:opacity-50">
        Raise Priority
      </button>
    </div>
  );
}