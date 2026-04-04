import React from 'react';
import { Landmark, LockKeyhole, Sparkles } from 'lucide-react';
import JourneyInteractionBar from './JourneyInteractionBar';

type EstimatedFundingRangeCardProps = {
  unlocked: boolean;
  min: number | null;
  max: number | null;
  helper: string;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
};

function formatCurrency(value: number) {
  return `$${value.toLocaleString()}`;
}

export default function EstimatedFundingRangeCard(props: EstimatedFundingRangeCardProps) {
  return (
    <article className="rounded-[2rem] border border-[#DFE7F4] bg-[linear-gradient(180deg,#FFFFFF_0%,#F6FBFF_100%)] p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Estimated funding range</p>
          <h3 className="mt-2 text-[1.65rem] font-black tracking-tight text-[#17233D]">Funding Potential</h3>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-[#EEF6FF] text-[#4677E6]">
          {props.unlocked ? <Landmark className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
        </span>
      </div>

      <div className="mt-6 rounded-[1.6rem] border border-[#E4ECF8] bg-white p-5">
        {props.unlocked && props.min !== null && props.max !== null ? (
          <>
            <p className="text-[2rem] font-black tracking-tight text-[#17233D]">
              {formatCurrency(props.min)} - {formatCurrency(props.max)}
            </p>
            <p className="mt-2 text-sm font-black uppercase tracking-[0.16em] text-[#5D7DAB]">Estimated Funding Range</p>
          </>
        ) : (
          <p className="text-[1.1rem] font-black tracking-tight text-[#17233D]">{props.helper}</p>
        )}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-[1.3rem] border border-[#E7EFFA] bg-[#FBFDFF] px-4 py-3">
        <Sparkles className="mt-0.5 h-4 w-4 text-[#46A2E7]" />
        <p className="text-sm leading-6 text-[#61769D]">{props.helper}</p>
      </div>

      <JourneyInteractionBar
        statusLabel={props.unlocked && props.min !== null && props.max !== null ? 'Educational funding estimate unlocked' : 'Funding estimate still gated'}
        whyItMatters="This estimate helps clients understand realistic funding direction before applications begin. It is motivational guidance, not an approval."
        nextStepPreview={props.unlocked ? 'Next step: improve approval odds in Funding Engine' : 'Next step: complete credit upload and analysis'}
        primaryLabel={props.unlocked ? 'Improve Approval Odds' : 'Unlock Estimate'}
        onPrimaryAction={props.onPrimaryAction}
        secondaryLabel="Review Funding Strategy"
        onSecondaryAction={props.onSecondaryAction}
      />
    </article>
  );
}
