import React from 'react';
import { PaperTradeJournalDraft } from '../../services/paperTradingJournalService';

type Props = {
  draft: PaperTradeJournalDraft;
  busy: boolean;
  onChange: (next: PaperTradeJournalDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

function updateField<T extends keyof PaperTradeJournalDraft>(draft: PaperTradeJournalDraft, key: T, value: PaperTradeJournalDraft[T], onChange: Props['onChange']) {
  onChange({ ...draft, [key]: value });
}

export default function JournalEntryForm({ draft, busy, onChange, onSubmit, onCancel }: Props) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Paper-Trade Journal</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">Log a simulated setup</h3>
          <p className="mt-1 text-sm text-slate-500">Educational journaling only. This does not place or suggest a live trade.</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-700">
          Close
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Date</span>
          <input type="date" value={draft.tradeDate} onChange={(event) => updateField(draft, 'tradeDate', event.target.value, onChange)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Market / Symbol</span>
          <input value={draft.marketSymbol} onChange={(event) => updateField(draft, 'marketSymbol', event.target.value, onChange)} placeholder="EURUSD, SPY, or setup name" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Market Type</span>
          <select value={draft.marketType} onChange={(event) => updateField(draft, 'marketType', event.target.value as PaperTradeJournalDraft['marketType'], onChange)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
            {['forex', 'options', 'equities', 'futures', 'crypto', 'other'].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Strategy Used</span>
          <input value={draft.strategyUsed} onChange={(event) => updateField(draft, 'strategyUsed', event.target.value, onChange)} placeholder="Approved strategy, reviewed signal, or manual practice theme" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Setup Summary</span>
          <input value={draft.setupSummary} onChange={(event) => updateField(draft, 'setupSummary', event.target.value, onChange)} placeholder="What setup were you simulating?" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900" />
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Entry Plan</span>
          <textarea value={draft.entryPlan} onChange={(event) => updateField(draft, 'entryPlan', event.target.value, onChange)} className="min-h-[6rem] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900" placeholder="Describe the hypothetical entry conditions." />
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stop Plan</span>
          <textarea value={draft.stopPlan} onChange={(event) => updateField(draft, 'stopPlan', event.target.value, onChange)} className="min-h-[6rem] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900" placeholder="Write the invalidation plan for the simulation." />
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Plan</span>
          <textarea value={draft.targetPlan} onChange={(event) => updateField(draft, 'targetPlan', event.target.value, onChange)} className="min-h-[6rem] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900" placeholder="Write the planned exit or target conditions." />
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="space-y-2 md:col-span-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rationale</span>
          <textarea value={draft.rationale} onChange={(event) => updateField(draft, 'rationale', event.target.value, onChange)} className="min-h-[7rem] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900" placeholder="Why did this setup make sense as a paper-trade exercise?" />
        </label>
        <label className="space-y-2 md:col-span-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Outcome / Result Notes</span>
          <textarea value={draft.outcomeNotes} onChange={(event) => updateField(draft, 'outcomeNotes', event.target.value, onChange)} className="min-h-[7rem] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900" placeholder="What happened during the simulation?" />
        </label>
        <label className="space-y-2 md:col-span-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lesson Learned</span>
          <textarea value={draft.lessonLearned} onChange={(event) => updateField(draft, 'lessonLearned', event.target.value, onChange)} className="min-h-[7rem] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900" placeholder="What should you repeat, refine, or avoid next time?" />
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Confidence Before Trade</span>
          <input type="range" min="1" max="5" step="1" value={draft.confidenceBefore} onChange={(event) => updateField(draft, 'confidenceBefore', Number(event.target.value), onChange)} className="w-full" />
          <div className="text-xs text-slate-500">{draft.confidenceBefore}/5 before the simulation</div>
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Confidence After Review</span>
          <input type="range" min="1" max="5" step="1" value={draft.confidenceAfter} onChange={(event) => updateField(draft, 'confidenceAfter', Number(event.target.value), onChange)} className="w-full" />
          <div className="text-xs text-slate-500">{draft.confidenceAfter}/5 after reviewing the outcome</div>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
        <span>Paper-trading only. No live execution, no broker linkage, and no financial advice.</span>
        <button type="button" onClick={onSubmit} disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-50">
          {busy ? 'Saving...' : 'Save Journal Entry'}
        </button>
      </div>
    </div>
  );
}