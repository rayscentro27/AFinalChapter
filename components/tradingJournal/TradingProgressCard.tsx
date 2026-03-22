import React from 'react';
import { TradingProgressSnapshot } from '../../services/paperTradingJournalService';

type Props = {
  progress: TradingProgressSnapshot;
};

export default function TradingProgressCard({ progress }: Props) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Progress Summary</p>
      <h3 className="mt-2 text-xl font-semibold text-slate-900">Practice-first momentum</h3>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Journal Entries</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{progress.totalEntries}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reflective Entries</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{progress.reflectiveEntries}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Learning Streak</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{progress.streakDays}d</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Milestones</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{progress.completedMilestones}/{progress.totalMilestones}</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-500">Latest practice day: {progress.latestEntryLabel}. Keep paper trading secondary to the main funding and business path.</p>
    </div>
  );
}