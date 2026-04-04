import React from 'react';
import { ArrowRight } from 'lucide-react';

type JourneyInteractionBarProps = {
  statusLabel: string;
  whyItMatters: string;
  nextStepPreview: string;
  primaryLabel: string;
  onPrimaryAction: () => void;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
};

export default function JourneyInteractionBar(props: JourneyInteractionBarProps) {
  return (
    <div className="mt-5 rounded-[1.35rem] border border-[#E4ECF8] bg-[#FBFDFF] p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Current status</p>
          <p className="text-sm font-black tracking-tight text-[#17233D]">{props.statusLabel}</p>
          <p className="text-sm leading-6 text-[#61769D]">{props.whyItMatters}</p>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#5C77BD]">{props.nextStepPreview}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={props.onPrimaryAction}
            className="inline-flex items-center justify-center gap-2 rounded-[1rem] bg-[linear-gradient(90deg,#3A67E6_0%,#4EC2F3_100%)] px-4 py-3 text-sm font-black text-white shadow-[0_12px_30px_rgba(70,119,230,0.22)]"
          >
            {props.primaryLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
          {props.secondaryLabel && props.onSecondaryAction ? (
            <button
              type="button"
              onClick={props.onSecondaryAction}
              className="inline-flex items-center justify-center rounded-[1rem] border border-[#D5E4FF] bg-white px-4 py-3 text-sm font-black text-[#4677E6]"
            >
              {props.secondaryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
