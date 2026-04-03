import React from 'react';
import { Award, CheckCircle2, LockKeyhole } from 'lucide-react';
import { JourneyBadge } from './clientJourneyState';

type AchievementBadgesProps = {
  badges: JourneyBadge[];
};

const toneClasses: Record<JourneyBadge['tone'], string> = {
  sky: 'from-[#7FD8FF] to-[#DDF5FF] text-[#1C6E98] border-[#CBEAF7]',
  violet: 'from-[#C5B4FF] to-[#F0E9FF] text-[#6952BD] border-[#DDD3FF]',
  emerald: 'from-[#A7E3B7] to-[#EEFBF1] text-[#1F8756] border-[#CBEBD4]',
  amber: 'from-[#FFD36E] to-[#FFF3CF] text-[#9E6A11] border-[#F6E3AA]',
};

export default function AchievementBadges(props: AchievementBadgesProps) {
  return (
    <section className="rounded-[2rem] border border-[#DFE7F4] bg-white p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#607CC1]">Achievement badges</p>
          <h2 className="mt-2 text-[2rem] font-black tracking-tight text-[#17233D]">What You&apos;ve Earned</h2>
          <p className="mt-2 text-sm text-[#61769D]">Milestones stay visible so progress feels earned and worth returning to.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#E6EEF9] bg-[#F9FBFF] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[#7A8EAF]">
          <Award className="h-3.5 w-3.5" />
          {props.badges.filter((badge) => badge.earned).length}/{props.badges.length} unlocked
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {props.badges.map((badge) => (
          <article
            key={badge.key}
            className={`rounded-[1.6rem] border p-5 transition-all ${
              badge.earned
                ? `bg-[linear-gradient(180deg,#FFFFFF_0%,#FAFCFF_100%)] shadow-[0_16px_34px_rgba(38,76,151,0.08)] ${toneClasses[badge.tone]}`
                : 'border-[#E4EAF5] bg-[#F8FAFD] text-[#A6B3C9]'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-[1rem] ${
                  badge.earned ? 'bg-white/80' : 'bg-white'
                }`}
              >
                {badge.earned ? <CheckCircle2 className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.18em]">
                {badge.earned ? 'Unlocked' : 'Locked'}
              </span>
            </div>
            <p className="mt-4 text-[1.1rem] font-black tracking-tight">{badge.label}</p>
            <p className="mt-2 text-sm leading-6">{badge.helper}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
