import React from 'react';
import { PaperTradeJournalEntry } from '../../services/paperTradingJournalService';

type Props = {
  entries: PaperTradeJournalEntry[];
  loading: boolean;
  onCreateFirst: () => void;
};

export default function JournalEntriesList({ entries, loading, onCreateFirst }: Props) {
  if (loading) {
    return <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading paper-trading journal...</div>;
  }

  if (!entries.length) {
    return (
      <div className="rounded-[2rem] border border-dashed border-slate-300 bg-slate-50 p-8 text-center shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Journal History</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-900">No paper-trading entries yet</h3>
        <p className="mt-2 text-sm text-slate-500">Start with one simulated setup, log the plan, and capture the lesson learned before moving on to another practice run.</p>
        <button type="button" onClick={onCreateFirst} className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-white">
          Log First Practice Entry
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Journal History</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">Recent paper-trade reflections</h3>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{entries.length} entries</span>
      </div>

      <div className="mt-5 space-y-3">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{entry.strategyUsed || entry.sourceTitle || 'Practice setup'} on {entry.marketSymbol || 'simulation'}</p>
                <p className="mt-1 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">{new Date(entry.tradeDate).toLocaleDateString()} • {entry.marketType} • {entry.sourceType}</p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <div>Confidence: {entry.confidenceBefore}/5 before</div>
                <div>{entry.confidenceAfter}/5 after review</div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Setup</p>
                <p className="mt-1 text-sm text-slate-600">{entry.setupSummary || 'No setup summary recorded.'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Entry / Stop / Target</p>
                <p className="mt-1 text-sm text-slate-600">{entry.entryPlan || 'Entry plan pending.'}</p>
                <p className="mt-1 text-xs text-slate-500">Stop: {entry.stopPlan || 'Not recorded'}</p>
                <p className="mt-1 text-xs text-slate-500">Target: {entry.targetPlan || 'Not recorded'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Outcome</p>
                <p className="mt-1 text-sm text-slate-600">{entry.outcomeNotes || 'Outcome notes not recorded yet.'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Lesson Learned</p>
                <p className="mt-1 text-sm text-slate-600">{entry.lessonLearned || 'Add a lesson learned to deepen the reflection.'}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}