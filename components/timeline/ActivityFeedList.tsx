import React from 'react';
import { DealTimelineEvent } from '../../services/dealTimelineService';
import TimelineEventCard from './TimelineEventCard';

type Props = {
  events: DealTimelineEvent[];
  onOpenDestination?: (target: string) => void;
};

export default function ActivityFeedList({ events, onOpenDestination }: Props) {
  if (!events.length) {
    return (
      <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 p-8 text-center shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">No Matching Activity</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-900">No timeline entries matched the current filters</h3>
        <p className="mt-2 text-sm text-slate-500">Try broadening the search or category filters to see more lifecycle events.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <TimelineEventCard key={event.id} event={event} onOpenDestination={onOpenDestination} />
      ))}
    </div>
  );
}