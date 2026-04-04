import React from 'react';

type ReferralProgressProps = {
  level: string;
  progressPercent: number;
  nextTierLabel: string;
};

export default function ReferralProgress(props: ReferralProgressProps) {
  return (
    <div className="rounded-[1.35rem] border border-[#E4ECF8] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Referral level</p>
          <p className="mt-2 text-lg font-black tracking-tight text-[#17233D]">{props.level}</p>
        </div>
        <p className="text-sm font-black text-[#4677E6]">{props.progressPercent}%</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E9EEF8]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#3A67E6_0%,#4EC2F3_100%)]"
          style={{ width: `${props.progressPercent}%` }}
        />
      </div>
      <p className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] text-[#5C77BD]">{props.nextTierLabel}</p>
    </div>
  );
}
