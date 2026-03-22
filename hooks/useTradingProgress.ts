import { useMemo } from 'react';
import { buildTradingProgressSnapshot, PaperTradeJournalEntry, TradingProgressSnapshot } from '../services/paperTradingJournalService';

type ProgressInput = {
  entries: PaperTradeJournalEntry[];
  reviewedStrategies: Array<{ id: string; title: string; reviewedAt: string }>;
};

export default function useTradingProgress(input: ProgressInput): TradingProgressSnapshot {
  return useMemo(() => buildTradingProgressSnapshot({ entries: input.entries, reviewedStrategies: input.reviewedStrategies }), [input.entries, input.reviewedStrategies]);
}