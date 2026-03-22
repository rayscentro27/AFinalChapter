import React from 'react';
import { UsePaperTradingJournalResult } from '../../hooks/usePaperTradingJournal';
import useTradingProgress from '../../hooks/useTradingProgress';
import { PaperTradePracticeContext } from '../../services/paperTradingJournalService';
import CoachReflectionCard from './CoachReflectionCard';
import JournalEntriesList from './JournalEntriesList';
import JournalEntryForm from './JournalEntryForm';
import PracticeMilestonesCard from './PracticeMilestonesCard';
import TradingProgressCard from './TradingProgressCard';

type Props = {
  journal: UsePaperTradingJournalResult;
  practiceContext: Partial<PaperTradePracticeContext> | null;
  onConsumePracticeContext: () => void;
};

export default function PaperTradeJournalSection({ journal, practiceContext, onConsumePracticeContext }: Props) {
  const progress = useTradingProgress({ entries: journal.entries, reviewedStrategies: journal.reviewedStrategies });

  React.useEffect(() => {
    if (!practiceContext) return;
    journal.openComposer(practiceContext);
    onConsumePracticeContext();
  }, [journal, onConsumePracticeContext, practiceContext]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Paper-Trading Journal</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Practice, reflect, and build process discipline</h2>
        <p className="mt-2 text-sm text-slate-500">This journal is simulation-first and educational-only. Use it to link approved strategies and reviewed signals to reflective practice.</p>
      </div>

      {journal.error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{journal.error}</div> : null}
      {journal.success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{journal.success}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <TradingProgressCard progress={progress} />
        <CoachReflectionCard reflection={journal.latestReflection} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <PracticeMilestonesCard progress={progress} />
        <JournalEntriesList entries={journal.entries} loading={journal.loading} onCreateFirst={() => journal.openComposer()} />
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={() => journal.openComposer()} className="rounded-xl bg-slate-900 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-white">
          New Practice Entry
        </button>
      </div>

      {journal.isComposerOpen ? (
        <JournalEntryForm draft={journal.draft} busy={false} onChange={journal.updateDraft} onSubmit={journal.submitDraft} onCancel={journal.closeComposer} />
      ) : null}
    </div>
  );
}