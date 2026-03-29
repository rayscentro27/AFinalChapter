import React from 'react';
import { TradingProgressSnapshot } from '../../services/paperTradingJournalService';

type Props = {
  progress: TradingProgressSnapshot;
};

export default function PracticeMilestonesCard({ progress }: Props) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Practice Milestones</p>
      <h3 className="mt-2 text-xl font-semibold text-slate-900">Progress without gamified noise</h3>
      <div className="mt-5 space-y-3">
        {progress.milestones.map((milestone) => (
          <div key={milestone.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{milestone.label}</p>
                <p className="mt-1 text-sm text-slate-500">{milestone.description}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${milestone.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                {milestone.current}/{milestone.target}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}