import React from 'react';
import { formatTimelineStage } from '../../services/dealTimelineService';

type Props = {
  stage?: string | null;
};

export default function TimelineStageBadge({ stage }: Props) {
  return (
    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
      {formatTimelineStage(stage)}
    </span>
  );
}