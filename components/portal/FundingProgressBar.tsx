import React from 'react';
import { Check, Circle } from 'lucide-react';
import { JourneyStep } from './clientJourneyState';
import JourneyInteractionBar from './JourneyInteractionBar';

type FundingProgressBarProps = {
  percent: number;
  activeStepLabel: string;
  steps: JourneyStep[];
  onStepAction: (step: JourneyStep) => void;
  onOverviewAction: () => void;
};

export default function FundingProgressBar(props: FundingProgressBarProps) {
  const activeStep = props.steps.find((step) => step.active) || props.steps[0];
  return (
    <section className="rounded-[2rem] border border-[#DFE7F4] bg-white p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Funding journey progress</p>
          <h2 className="mt-2 text-[2rem] font-black tracking-tight text-[#17233D]">Your Funding Journey</h2>
          <p className="mt-2 text-sm text-[#61769D]">Current focus: {props.activeStepLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-[2rem] font-black tracking-tight text-[#17233D]">{props.percent}%</p>
          <p className="text-sm text-[#61769D]">Complete</p>
        </div>
      </div>

      <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#E9EEF8]">
        <div
          className="h-full rounded-full bg-[linear-gradient(135deg,#2E63E5_0%,#58C5FF_100%)] transition-all"
          style={{ width: `${props.percent}%` }}
        />
      </div>

      <div className="mt-6 grid gap-3 xl:grid-cols-5">
        {props.steps.map((step, index) => (
          <article
            key={step.key}
            className={`rounded-[1.45rem] border p-4 transition-all ${
              step.active
                ? 'border-[#A9C9FF] bg-[linear-gradient(180deg,#F7FBFF_0%,#EFF5FF_100%)] shadow-[0_14px_30px_rgba(70,119,230,0.12)]'
                : step.complete
                  ? 'border-[#D4EAE0] bg-[linear-gradient(180deg,#FBFFFD_0%,#F2FBF6_100%)]'
                  : 'border-[#E2E9F5] bg-[#FAFCFF]'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${
                  step.complete
                    ? 'bg-[#E5F8EE] text-[#17A36B]'
                    : step.active
                      ? 'bg-[#E7F1FF] text-[#356AE6]'
                      : 'bg-[#F0F4FA] text-[#A2B0C8]'
                }`}
              >
                {step.complete ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#91A1BC]">Step {index + 1}</span>
            </div>
            <p className="mt-4 text-[1.02rem] font-black tracking-tight text-[#17233D]">{step.label}</p>
            <p className="mt-2 text-sm leading-6 text-[#61769D]">{step.helper}</p>
            <p
              className={`mt-4 text-[11px] font-black uppercase tracking-[0.18em] ${
                step.complete ? 'text-[#17A36B]' : step.active ? 'text-[#356AE6]' : 'text-[#A2B0C8]'
              }`}
            >
              {step.complete ? 'Completed' : step.active ? 'Active now' : 'Locked ahead'}
            </p>
            <button
              type="button"
              onClick={() => props.onStepAction(step)}
              className="mt-4 inline-flex items-center rounded-full border border-[#D5E4FF] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#4677E6]"
            >
              {step.ctaLabel}
            </button>
          </article>
        ))}
      </div>

      {activeStep ? (
        <JourneyInteractionBar
          statusLabel={`Current focus: ${activeStep.label}`}
          whyItMatters={activeStep.helper}
          nextStepPreview={activeStep.nextStepPreview}
          primaryLabel={activeStep.ctaLabel}
          onPrimaryAction={() => props.onStepAction(activeStep)}
          secondaryLabel="View Full Funding Path"
          onSecondaryAction={props.onOverviewAction}
        />
      ) : null}
    </section>
  );
}
