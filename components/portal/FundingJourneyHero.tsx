import React from 'react';
import { ArrowRight, Rocket, Sparkles } from 'lucide-react';
import JourneyInteractionBar from './JourneyInteractionBar';

type FundingJourneyHeroProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  supportText: string;
  onAction: () => void;
  onSecondaryAction: () => void;
};

export default function FundingJourneyHero(props: FundingJourneyHeroProps) {
  return (
    <section className="overflow-hidden rounded-[2.2rem] border border-[#DBE6FA] bg-[radial-gradient(circle_at_top_left,_rgba(97,173,255,0.22),_transparent_38%),linear-gradient(135deg,#F8FBFF_0%,#FFFFFF_48%,#F4F8FF_100%)] p-6 shadow-[0_24px_60px_rgba(55,89,164,0.10)] sm:p-8">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#D7E5FF] bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#5A73B9]">
            <Sparkles className="h-3.5 w-3.5" />
            {props.eyebrow}
          </div>
          <h1 className="mt-4 max-w-3xl text-[2.2rem] font-black tracking-tight text-[#1B2C61] sm:text-[3rem]">{props.title}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[#5D7297] sm:text-lg">{props.subtitle}</p>
          <button
            type="button"
            onClick={props.onAction}
            className="mt-6 inline-flex items-center gap-2 rounded-[1.3rem] bg-[linear-gradient(135deg,#2955D9_0%,#59B8FF_100%)] px-5 py-4 text-sm font-black tracking-tight text-white shadow-[0_18px_36px_rgba(41,85,217,0.28)] transition-transform hover:-translate-y-0.5"
          >
            <Rocket className="h-4 w-4" />
            {props.ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-4 text-sm font-medium text-[#6480AA]">{props.supportText}</p>

          <JourneyInteractionBar
            statusLabel={props.title}
            whyItMatters={props.subtitle}
            nextStepPreview="Next step preview: complete this milestone to unlock the next funding action"
            primaryLabel={props.ctaLabel}
            onPrimaryAction={props.onAction}
            secondaryLabel="Open Messages"
            onSecondaryAction={props.onSecondaryAction}
          />
        </div>

        <div className="rounded-[1.9rem] border border-white/70 bg-white/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur">
          <div className="rounded-[1.6rem] bg-[linear-gradient(135deg,#2448C9_0%,#58B8FF_100%)] p-5 text-white">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">Next unlock</p>
            <p className="mt-3 text-[1.3rem] font-black tracking-tight">Your progress drives what opens next.</p>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-[1.4rem] border border-[#E3ECFB] bg-[#FBFDFF] px-4 py-3 text-sm text-[#4E648D]">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EAF6FB] text-[#1E98C8]">
              <Sparkles className="h-4 w-4" />
            </span>
            Complete each milestone to unlock stronger funding guidance and educational tools.
          </div>
        </div>
      </div>
    </section>
  );
}
