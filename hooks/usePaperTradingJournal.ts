import { useEffect, useMemo, useState } from 'react';
import {
  buildCoachReflection,
  buildTradingProgressSnapshot,
  createEmptyJournalDraft,
  PaperTradeJournalDraft,
  PaperTradePracticeContext,
  readTradingJournalState,
  recordStrategyReview,
  savePaperTradeEntry,
} from '../services/paperTradingJournalService';

export type UsePaperTradingJournalResult = {
  loading: boolean;
  error: string;
  success: string;
  draft: PaperTradeJournalDraft;
  entries: ReturnType<typeof readTradingJournalState>['entries'];
  reviewedStrategies: ReturnType<typeof readTradingJournalState>['reviewedStrategies'];
  progress: ReturnType<typeof buildTradingProgressSnapshot>;
  latestReflection: ReturnType<typeof buildCoachReflection>;
  isComposerOpen: boolean;
  openComposer: (context?: Partial<PaperTradePracticeContext>) => void;
  closeComposer: () => void;
  updateDraft: (next: PaperTradeJournalDraft) => void;
  submitDraft: () => boolean;
  markStrategyReviewed: (input: { strategyId: string; title: string }) => void;
};

export default function usePaperTradingJournal(scopeId?: string, enabled = true): UsePaperTradingJournalResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [draft, setDraft] = useState<PaperTradeJournalDraft>(createEmptyJournalDraft());
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [entriesState, setEntriesState] = useState(() => readTradingJournalState(scopeId));

  useEffect(() => {
    if (!enabled || !scopeId) {
      setEntriesState(readTradingJournalState(undefined));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      setEntriesState(readTradingJournalState(scopeId));
    } catch (err: any) {
      setError(String(err?.message || 'Unable to load paper-trading journal.'));
    } finally {
      setLoading(false);
    }
  }, [enabled, scopeId]);

  const progress = useMemo(() => buildTradingProgressSnapshot(entriesState), [entriesState]);
  const latestReflection = useMemo(() => buildCoachReflection(entriesState.entries[0] || null), [entriesState.entries]);

  function openComposer(context?: Partial<PaperTradePracticeContext>) {
    setDraft(createEmptyJournalDraft(context));
    setIsComposerOpen(true);
    setSuccess('');
  }

  function closeComposer() {
    setIsComposerOpen(false);
  }

  function updateDraft(next: PaperTradeJournalDraft) {
    setDraft(next);
  }

  function submitDraft() {
    if (!scopeId) {
      setError('Trading access context is missing for this journal.');
      return false;
    }

    setError('');
    try {
      const next = savePaperTradeEntry(scopeId, draft);
      setEntriesState(next);
      setSuccess('Paper-trading journal entry saved. Review the reflection before starting another simulation.');
      setIsComposerOpen(false);
      return true;
    } catch (err: any) {
      setError(String(err?.message || 'Unable to save paper-trading journal entry.'));
      return false;
    }
  }

  function markStrategyReviewed(input: { strategyId: string; title: string }) {
    if (!scopeId) return;
    try {
      const next = recordStrategyReview(scopeId, input);
      setEntriesState(next);
    } catch (err: any) {
      setError(String(err?.message || 'Unable to record strategy review.'));
    }
  }

  return {
    loading,
    error,
    success,
    draft,
    entries: entriesState.entries,
    reviewedStrategies: entriesState.reviewedStrategies,
    progress,
    latestReflection,
    isComposerOpen,
    openComposer,
    closeComposer,
    updateDraft,
    submitDraft,
    markStrategyReviewed,
  };
}