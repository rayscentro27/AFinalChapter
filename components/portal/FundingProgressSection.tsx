import React from 'react';
import { ArrowRight, Download, FileCheck, Mail, ShieldCheck, Wand2 } from 'lucide-react';

type FundingProgressSectionProps = {
  title: string;
  subtitle: string;
  readinessPercent: number;
  rangeLabel: string;
  rangeHelper: string;
  highlights: string[];
  primaryActionLabel: string;
  secondaryActionLabel?: string;
  tertiaryActionLabel?: string;
  onPrimaryAction: () => void;
  onSecondaryAction?: () => void;
  onTertiaryAction?: () => void;
};

export default function FundingProgressSection(props: FundingProgressSectionProps) {
  return (
    <section className="rounded-[2.2rem] border border-[#DFE7F4] bg-[linear-gradient(180deg,#FFFFFF_0%,#F7FBFF_100%)] p-6 shadow-[0_20px_50px_rgba(36,58,114,0.08)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Funding progress</p>
          <h3 className="mt-2 text-[2rem] font-black tracking-tight text-[#17233D]">{props.title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#61769D]">{props.subtitle}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#DCE5F4] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#607CC1]">
          <ShieldCheck className="h-3.5 w-3.5" />
          Educational estimate only
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.8rem] border border-[#E0E9F7] bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Funding readiness</p>
              <p className="mt-3 text-[2.2rem] font-black tracking-tight text-[#17233D]">{props.rangeLabel}</p>
              <p className="mt-2 text-sm text-[#61769D]">{props.rangeHelper}</p>
            </div>
            <div className="rounded-[1.2rem] border border-[#E3ECFB] bg-[#F1F6FF] px-4 py-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#5F7DB0]">Readiness</p>
              <p className="mt-2 text-xl font-black text-[#1B2C61]">{props.readinessPercent}%</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {props.highlights.map((item) => (
              <div key={item} className="rounded-[1.1rem] border border-[#E6EDF8] bg-[#FBFDFF] px-4 py-3 text-sm text-[#17233D]">
                <FileCheck className="mr-2 inline-block h-4 w-4 text-[#4B7BE5]" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.8rem] border border-[#E0E9F7] bg-white p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Primary actions</p>
          <button
            type="button"
            onClick={props.onPrimaryAction}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-[linear-gradient(135deg,#2E63E5_0%,#59B8FF_100%)] px-4 py-4 text-sm font-black text-white shadow-[0_16px_34px_rgba(41,85,217,0.24)]"
          >
            <Wand2 className="h-4 w-4" />
            {props.primaryActionLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
          {props.secondaryActionLabel ? (
            <button
              type="button"
              onClick={props.onSecondaryAction}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[1.1rem] border border-[#D8E4F8] bg-white px-4 py-3 text-sm font-black text-[#356AE6]"
            >
              <Download className="h-4 w-4" />
              {props.secondaryActionLabel}
            </button>
          ) : null}
          {props.tertiaryActionLabel ? (
            <button
              type="button"
              onClick={props.onTertiaryAction}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[1.1rem] border border-[#D8E4F8] bg-white px-4 py-3 text-sm font-black text-[#356AE6]"
            >
              <Mail className="h-4 w-4" />
              {props.tertiaryActionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
