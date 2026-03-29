import React from 'react';
import { DealTimelineActor, DealTimelineCategory, formatTimelineActor, formatTimelineCategory } from '../../services/dealTimelineService';

export type TimelineFilterState = {
  category: 'all' | DealTimelineCategory;
  actor: 'all' | DealTimelineActor;
  search: string;
};

type Props = {
  filters: TimelineFilterState;
  categories: DealTimelineCategory[];
  actors: DealTimelineActor[];
  onChange: (next: TimelineFilterState) => void;
};

export default function TimelineFilters({ filters, categories, actors, onChange }: Props) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Search</span>
          <input
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            placeholder="Search event title, summary, or source"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
          />
        </label>

        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Category</span>
          <select
            value={filters.category}
            onChange={(event) => onChange({ ...filters, category: event.target.value as TimelineFilterState['category'] })}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{formatTimelineCategory(category)}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Actor</span>
          <select
            value={filters.actor}
            onChange={(event) => onChange({ ...filters, actor: event.target.value as TimelineFilterState['actor'] })}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
          >
            <option value="all">All actors</option>
            {actors.map((actor) => (
              <option key={actor} value={actor}>{formatTimelineActor(actor)}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}