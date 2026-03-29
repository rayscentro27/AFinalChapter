import React from 'react';
import { CoachReflection } from '../../services/paperTradingJournalService';

type Props = {
  reflection: CoachReflection | null;
};

export default function CoachReflectionCard({ reflection }: Props) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Coach Reflection</p>
      <h3 className="mt-2 text-xl font-semibold text-slate-900">Safe learning recap</h3>
      {reflection ? (
        <>
          <p className="mt-4 text-sm font-semibold text-slate-900">{reflection.title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{reflection.summary}</p>
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            Next review step: {reflection.nextStep}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Save a journal entry to generate a reflection-focused recap. This stays educational and does not issue live trade instructions.</p>
      )}
    </div>
  );
}