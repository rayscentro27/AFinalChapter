import React, { useMemo, useState } from 'react';
import ActivityFeedList from './ActivityFeedList';
import TimelineFilters, { TimelineFilterState } from './TimelineFilters';
import { DealTimelineActor, DealTimelineCategory, DealTimelineEvent } from '../../services/dealTimelineService';

type Props = {
  currentStageLabel: string;
  nextStepLabel: string;
  events: DealTimelineEvent[];
  categories: DealTimelineCategory[];
  actors: DealTimelineActor[];
  loading: boolean;
  error: string;
  onOpenDestination?: (target: string) => void;
};

const INITIAL_FILTERS: TimelineFilterState = {
  category: 'all',
  actor: 'all',
  search: '',
};

export default function DealTimelinePage({ currentStageLabel, nextStepLabel, events, categories, actors, loading, error, onOpenDestination }: Props) {
  const [filters, setFilters] = useState<TimelineFilterState>(INITIAL_FILTERS);

  const filteredEvents = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return events.filter((event) => {
      if (filters.category !== 'all' && event.category !== filters.category) return false;
      if (filters.actor !== 'all' && event.actor !== filters.actor) return false;
      if (!query) return true;
      return [event.title, event.summary, event.source, event.relatedStage || ''].join(' ').toLowerCase().includes(query);
    });
  }, [events, filters]);

  const recentEvents = events.filter((event) => Date.now() - event.sortAt <= 7 * 24 * 60 * 60 * 1000).length;

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Deal Timeline</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Unified client activity feed</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">A funding-first lifecycle view of tasks, communications, milestones, and funding activity in one calm timeline.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Current Stage</p>
            <p className="mt-2 text-lg font-black text-slate-900">{currentStageLabel}</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Recent Activity</p>
            <p className="mt-2 text-lg font-black text-slate-900">{recentEvents} in the last 7 days</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Next Focus</p>
            <p className="mt-2 text-lg font-black text-slate-900">{nextStepLabel}</p>
          </div>
        </div>
      </section>

      <TimelineFilters filters={filters} categories={categories} actors={actors} onChange={setFilters} />

      {loading ? <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading unified activity feed...</div> : null}
      {error ? <div className="rounded-[1.75rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">{error}</div> : null}
      {!loading ? <ActivityFeedList events={filteredEvents} onOpenDestination={onOpenDestination} /> : null}
    </div>
  );
}