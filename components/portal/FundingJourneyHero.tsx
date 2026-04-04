import React from 'react';
import { ArrowRight, Rocket, Sparkles } from 'lucide-react';

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
    <section className="overflow-hidden rounded-[2.4rem] border border-[#DBE6FA] bg-[radial-gradient(circle_at_top_left,_rgba(97,173,255,0.28),_transparent_38%),linear-gradient(135deg,#F8FBFF_0%,#FFFFFF_48%,#F4F8FF_100%)] px-8 py-10 text-center shadow-[0_28px_70px_rgba(55,89,164,0.12)]">
      <div className="mx-auto max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#D7E5FF] bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#5A73B9]">
          <Sparkles className="h-3.5 w-3.5" />
          {props.eyebrow}
        </div>
        <h1 className="mt-5 text-[2.6rem] font-black tracking-tight text-[#1B2C61] sm:text-[3.2rem]">{props.title}</h1>
        <p className="mt-4 text-base leading-7 text-[#5D7297] sm:text-lg">{props.subtitle}</p>
        <button
          type="button"
          onClick={props.onAction}
          className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-[1.4rem] bg-[linear-gradient(135deg,#2955D9_0%,#59B8FF_100%)] px-6 py-5 text-base font-black tracking-tight text-white shadow-[0_20px_44px_rgba(41,85,217,0.30)] transition-transform hover:-translate-y-0.5"
        >
          <Rocket className="h-5 w-5" />
          {props.ctaLabel}
          <ArrowRight className="h-5 w-5" />
        </button>
        <p className="mt-4 text-sm font-semibold text-[#6480AA]">{props.supportText}</p>
        <button
          type="button"
          onClick={props.onSecondaryAction}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#D5E4FF] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#4677E6]"
        >
          Open Messages
        </button>
      </div>
    </section>
  );
}
