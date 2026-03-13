import React, { useMemo } from 'react';

type SlaConversation = {
  created_at?: string | null;
  updated_at?: string | null;
  last_message_at?: string | null;
  priority?: number | null;
  status?: string | null;
};

type SlaBadgesProps = {
  conversation: SlaConversation;
  staleMinutes?: number;
  breachMinutes?: number;
  breachPriorityThreshold?: number;
  newMinutes?: number;
  emphasizePending?: boolean;
};

function minutesSince(timestamp?: string | null): number | null {
  if (!timestamp) return null;
  const value = new Date(timestamp).getTime();
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.floor((Date.now() - value) / 60000));
}

function formatAge(minutes: number | null): string {
  if (minutes == null) return '';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function Badge({
  label,
  title,
  className,
}: {
  label: string;
  title: string;
  className: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${className}`}
    >
      {label}
    </span>
  );
}

export default function SlaBadges({
  conversation,
  staleMinutes = 120,
  breachMinutes = 240,
  breachPriorityThreshold = 10,
  newMinutes = 10,
  emphasizePending = true,
}: SlaBadgesProps) {
  const createdMinutes = minutesSince(conversation.created_at);
  const activityMinutes = minutesSince(conversation.last_message_at || conversation.updated_at);
  const priority = Number(conversation.priority ?? 9999);
  const status = String(conversation.status || '').toLowerCase();

  const { showNew, showStale, showBreach, showPending, ageLabel } = useMemo(() => {
    const isNew = createdMinutes != null && createdMinutes <= newMinutes;
    const isBreach = activityMinutes != null && activityMinutes >= breachMinutes && priority <= breachPriorityThreshold;
    const isStale = activityMinutes != null && activityMinutes >= staleMinutes && !isBreach;
    const isPending = emphasizePending && status === 'pending';

    return {
      showNew: isNew,
      showStale: isStale,
      showBreach: isBreach,
      showPending: isPending,
      ageLabel: formatAge(activityMinutes),
    };
  }, [activityMinutes, breachMinutes, breachPriorityThreshold, createdMinutes, emphasizePending, newMinutes, priority, staleMinutes, status]);

  if (!showNew && !showStale && !showBreach && !showPending && !ageLabel) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
      {showNew ? (
        <Badge
          label="New"
          title="Recently created conversation"
          className="border-emerald-200 bg-emerald-50 text-emerald-700"
        />
      ) : null}

      {showPending ? (
        <Badge
          label="Pending"
          title="Conversation currently pending"
          className="border-amber-200 bg-amber-50 text-amber-700"
        />
      ) : null}

      {showBreach ? (
        <Badge
          label={`Breach ${ageLabel}`}
          title={`No activity for ${ageLabel} with priority ${priority}`}
          className="border-red-300 bg-red-50 text-red-700"
        />
      ) : null}

      {showStale ? (
        <Badge
          label={`Stale ${ageLabel}`}
          title={`No activity for ${ageLabel}`}
          className="border-slate-300 bg-slate-100 text-slate-700"
        />
      ) : null}

      {!showBreach && !showStale && ageLabel ? (
        <Badge
          label={`${ageLabel}`}
          title={`Last activity ${ageLabel} ago`}
          className="border-slate-200 bg-white text-slate-500"
        />
      ) : null}
    </div>
  );
}
