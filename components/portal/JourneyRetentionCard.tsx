import React from 'react';
import { Activity, TrendingDown, TrendingUp } from 'lucide-react';
import { JourneyRetentionSummary } from '../../src/services/journeyRetentionService';

type JourneyRetentionCardProps = {
  summary: JourneyRetentionSummary | null;
  loading?: boolean;
  error?: string;
};

function prettifyStage(value: string) {
  return value
    .split(/[_-]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function JourneyRetentionCard(props: JourneyRetentionCardProps) {
  return (
    <article className="rounded-[1.7rem] border border-[#DFE7F4] bg-white p-5 shadow-[0_16px_44px_rgba(36,58,114,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Journey health</p>
          <h3 className="mt-2 text-[1.15rem] font-black tracking-tight text-[#17233D]">Retention Snapshot</h3>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-[#EEF4FF] text-[#4677E6]">
          <Activity className="h-4 w-4" />
        </span>
      </div>

      {props.loading ? <p className="mt-4 text-sm text-[#61769D]">Loading retention summary…</p> : null}
      {props.error ? <p className="mt-4 text-sm text-[#C75873]">{props.error}</p> : null}

      {!props.loading && !props.error ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.2rem] border border-[#E4ECF8] bg-[#FBFDFF] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Completion rate</p>
              <p className="mt-2 text-[1.8rem] font-black tracking-tight text-[#17233D]">{props.summary?.completionRate || 0}%</p>
            </div>
            <div className="rounded-[1.2rem] border border-[#E4ECF8] bg-[#FBFDFF] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Likely drop-off</p>
              <p className="mt-2 text-sm font-black text-[#17233D]">{prettifyStage(props.summary?.dropOffStage || 'account_created')}</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-3 rounded-[1.2rem] border border-[#E4ECF8] bg-[#FBFDFF] px-4 py-3">
              <TrendingUp className="mt-0.5 h-4 w-4 text-[#17A36B]" />
              <div>
                <p className="text-sm font-black tracking-tight text-[#17233D]">Events captured</p>
                <p className="mt-1 text-sm text-[#61769D]">{props.summary?.totalEvents || 0} journey events have been recorded for this client path.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-[1.2rem] border border-[#FFE7C4] bg-[#FFF9EE] px-4 py-3">
              <TrendingDown className="mt-0.5 h-4 w-4 text-[#C27A24]" />
              <div>
                <p className="text-sm font-black tracking-tight text-[#17233D]">Next admin use</p>
                <p className="mt-1 text-sm text-[#61769D]">This summary is now ready to feed founder/admin funnel and drop-off reporting in later phases.</p>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </article>
  );
}
