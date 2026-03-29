import React from 'react';
import { BellRing, Bot, BriefcaseBusiness, Building2, CircleCheckBig, CreditCard, Landmark, MessageSquare, Sparkles } from 'lucide-react';
import { DealTimelineEvent, formatTimelineActor, formatTimelineCategory } from '../../services/dealTimelineService';
import TimelineStageBadge from './TimelineStageBadge';

type Props = {
  event: DealTimelineEvent;
  onOpenDestination?: (target: string) => void;
};

function categoryIcon(category: DealTimelineEvent['category']) {
  if (category === 'credit') return <CreditCard size={16} />;
  if (category === 'business_foundation') return <Building2 size={16} />;
  if (category === 'funding') return <BriefcaseBusiness size={16} />;
  if (category === 'capital') return <Landmark size={16} />;
  if (category === 'communication') return <MessageSquare size={16} />;
  if (category === 'ai_guidance') return <Bot size={16} />;
  if (category === 'system_update') return <Sparkles size={16} />;
  return <BellRing size={16} />;
}

function categoryTone(category: DealTimelineEvent['category']) {
  if (category === 'credit') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (category === 'business_foundation') return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  if (category === 'funding') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (category === 'capital') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (category === 'ai_guidance') return 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function priorityTone(priority: DealTimelineEvent['priority']) {
  if (priority === 'urgent') return 'border-red-200 bg-red-50 text-red-700';
  if (priority === 'high') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-500';
}

export default function TimelineEventCard({ event, onOpenDestination }: Props) {
  return (
    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className={`rounded-2xl border p-3 ${categoryTone(event.category)}`}>{categoryIcon(event.category)}</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${categoryTone(event.category)}`}>
                {formatTimelineCategory(event.category)}
              </span>
              <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${priorityTone(event.priority)}`}>
                {event.priority}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                {formatTimelineActor(event.actor)}
              </span>
              {event.upcoming ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                  Upcoming
                </span>
              ) : null}
            </div>
            <h3 className="mt-3 text-base font-black tracking-tight text-slate-900">{event.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{event.summary}</p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>{new Date(event.timestamp).toLocaleString()}</div>
          <div className="mt-1">{event.source}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TimelineStageBadge stage={event.relatedStage} />
          {event.relatedTaskId ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
              Task Linked
            </span>
          ) : null}
        </div>
        {event.destination ? (
          <button
            type="button"
            onClick={() => onOpenDestination?.(event.destination || '')}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700"
          >
            <span className="inline-flex items-center gap-2">
              <CircleCheckBig size={12} /> Open Related Area
            </span>
          </button>
        ) : null}
      </div>
    </article>
  );
}