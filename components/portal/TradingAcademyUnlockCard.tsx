import React from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole, TrendingUp } from 'lucide-react';

type TradingAcademyUnlockCardProps = {
  unlocked: boolean;
  statusLabel: string;
  title: string;
  subtitle: string;
  helper: string;
  ctaLabel: string;
  checklist: Array<{ label: string; complete: boolean }>;
  onAction: () => void;
};

export default function TradingAcademyUnlockCard(props: TradingAcademyUnlockCardProps) {
  return (
    <article className="rounded-[2rem] border border-[#DFE7F4] bg-[linear-gradient(180deg,#FFFFFF_0%,#FAFBFF_100%)] p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Trading progression</p>
          <h3 className="mt-2 text-[1.65rem] font-black tracking-tight text-[#17233D]">{props.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[#61769D]">{props.subtitle}</p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
            props.unlocked
              ? 'border-[#D6E9FD] bg-[#EEF6FF] text-[#356AE6]'
              : 'border-[#E4EAF5] bg-[#F7F9FD] text-[#8D9CB7]'
          }`}
        >
          {props.unlocked ? <TrendingUp className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
          {props.statusLabel}
        </span>
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-[#E5ECF7] bg-white p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8A9BBC]">Unlock by</p>
        <div className="mt-4 space-y-3">
          {props.checklist.map((item) => (
            <div key={item.label} className="flex items-center gap-3 text-sm text-[#4F658E]">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  item.complete ? 'bg-[#E5F8EE] text-[#169E68]' : 'bg-[#F1F5FA] text-[#A0ADC4]'
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <span className={item.complete ? 'font-semibold text-[#1E8555]' : ''}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-[#61769D]">{props.helper}</p>

      <button
        type="button"
        onClick={props.onAction}
        className={`mt-5 inline-flex items-center gap-2 rounded-[1.2rem] px-4 py-3 text-sm font-black tracking-tight transition-transform hover:-translate-y-0.5 ${
          props.unlocked
            ? 'bg-[#17233D] text-white shadow-[0_14px_28px_rgba(23,35,61,0.18)]'
            : 'border border-[#D5E4FF] bg-[#EEF4FF] text-[#4677E6]'
        }`}
      >
        {props.ctaLabel}
        <ArrowRight className="h-4 w-4" />
      </button>
    </article>
  );
}
