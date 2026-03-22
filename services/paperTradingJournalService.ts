export type PaperTradeSourceType = 'manual' | 'strategy' | 'signal';

export type PaperTradeMarketType = 'forex' | 'options' | 'equities' | 'futures' | 'crypto' | 'other';

export type PaperTradePracticeContext = {
  sourceType: PaperTradeSourceType;
  sourceId?: string;
  sourceTitle?: string;
  marketSymbol?: string;
  marketType?: PaperTradeMarketType;
  strategyUsed?: string;
  setupSummary?: string;
  rationale?: string;
  timeframeLabel?: string;
  sideLabel?: string;
};

export type PaperTradeJournalDraft = {
  tradeDate: string;
  marketSymbol: string;
  marketType: PaperTradeMarketType;
  strategyUsed: string;
  setupSummary: string;
  entryPlan: string;
  stopPlan: string;
  targetPlan: string;
  rationale: string;
  outcomeNotes: string;
  lessonLearned: string;
  confidenceBefore: number;
  confidenceAfter: number;
  sourceType: PaperTradeSourceType;
  sourceId: string | null;
  sourceTitle: string;
};

export type PaperTradeJournalEntry = PaperTradeJournalDraft & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

type ReviewedStrategyRecord = {
  id: string;
  title: string;
  reviewedAt: string;
};

type TradingJournalState = {
  entries: PaperTradeJournalEntry[];
  reviewedStrategies: ReviewedStrategyRecord[];
};

export type PracticeMilestone = {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  current: number;
  target: number;
};

export type TradingProgressSnapshot = {
  totalEntries: number;
  reflectiveEntries: number;
  reviewedStrategies: number;
  practicedSignals: number;
  streakDays: number;
  completedMilestones: number;
  totalMilestones: number;
  latestEntryLabel: string;
  milestones: PracticeMilestone[];
};

export type CoachReflection = {
  title: string;
  summary: string;
  nextStep: string;
};

const STORAGE_PREFIX = 'nexus_paper_trading_journal';

function storageKey(scopeId: string) {
  return `${STORAGE_PREFIX}:${scopeId}`;
}

function initialState(): TradingJournalState {
  return {
    entries: [],
    reviewedStrategies: [],
  };
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function parseState(raw: string | null): TradingJournalState {
  if (!raw) return initialState();

  try {
    const parsed = JSON.parse(raw);
    return {
      entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
      reviewedStrategies: Array.isArray(parsed?.reviewedStrategies) ? parsed.reviewedStrategies : [],
    };
  } catch {
    return initialState();
  }
}

function persistState(scopeId: string, state: TradingJournalState) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(storageKey(scopeId), JSON.stringify(state));
}

export function readTradingJournalState(scopeId?: string): TradingJournalState {
  if (!scopeId || !canUseStorage()) return initialState();
  return parseState(window.localStorage.getItem(storageKey(scopeId)));
}

export function createEmptyJournalDraft(context?: Partial<PaperTradePracticeContext>): PaperTradeJournalDraft {
  const today = new Date().toISOString().slice(0, 10);
  const sourceType = context?.sourceType || 'manual';
  const symbol = String(context?.marketSymbol || '').trim();
  const timeframe = String(context?.timeframeLabel || '').trim();
  const side = String(context?.sideLabel || '').trim();

  return {
    tradeDate: today,
    marketSymbol: symbol,
    marketType: context?.marketType || 'forex',
    strategyUsed: String(context?.strategyUsed || context?.sourceTitle || '').trim(),
    setupSummary: String(context?.setupSummary || [side, symbol, timeframe].filter(Boolean).join(' • ')).trim(),
    entryPlan: '',
    stopPlan: '',
    targetPlan: '',
    rationale: String(context?.rationale || '').trim(),
    outcomeNotes: '',
    lessonLearned: '',
    confidenceBefore: 3,
    confidenceAfter: 3,
    sourceType,
    sourceId: context?.sourceId ? String(context.sourceId) : null,
    sourceTitle: String(context?.sourceTitle || context?.strategyUsed || '').trim(),
  };
}

export function savePaperTradeEntry(scopeId: string, draft: PaperTradeJournalDraft): TradingJournalState {
  const current = readTradingJournalState(scopeId);
  const now = new Date().toISOString();
  const entry: PaperTradeJournalEntry = {
    ...draft,
    id: `${now}:${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now,
    updatedAt: now,
  };

  const next = {
    ...current,
    entries: [entry, ...current.entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };

  persistState(scopeId, next);
  return next;
}

export function recordStrategyReview(scopeId: string, input: { strategyId: string; title: string }): TradingJournalState {
  const current = readTradingJournalState(scopeId);
  if (current.reviewedStrategies.some((item) => item.id === input.strategyId)) {
    return current;
  }

  const next = {
    ...current,
    reviewedStrategies: [
      {
        id: input.strategyId,
        title: input.title,
        reviewedAt: new Date().toISOString(),
      },
      ...current.reviewedStrategies,
    ],
  };

  persistState(scopeId, next);
  return next;
}

function entryDay(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
}

function calculateStreak(entries: PaperTradeJournalEntry[]) {
  const uniqueDays = Array.from(new Set(entries.map((entry) => entryDay(entry.tradeDate || entry.createdAt)).filter((value): value is number => value !== null))).sort((left, right) => right - left);
  if (!uniqueDays.length) return 0;

  let streak = 1;
  for (let index = 1; index < uniqueDays.length; index += 1) {
    const diffDays = (uniqueDays[index - 1] - uniqueDays[index]) / (1000 * 60 * 60 * 24);
    if (diffDays <= 1) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}

export function buildTradingProgressSnapshot(state: TradingJournalState): TradingProgressSnapshot {
  const entries = state.entries;
  const reflectiveEntries = entries.filter((entry) => String(entry.lessonLearned || '').trim().length > 0 && String(entry.outcomeNotes || '').trim().length > 0).length;
  const practicedSignals = entries.filter((entry) => entry.sourceType === 'signal').length;
  const milestones: PracticeMilestone[] = [
    {
      id: 'first-paper-trade',
      label: 'Completed first paper trade',
      description: 'Log one simulated setup from start to finish.',
      completed: entries.length >= 1,
      current: Math.min(entries.length, 1),
      target: 1,
    },
    {
      id: 'first-strategy-review',
      label: 'Reviewed first strategy',
      description: 'Open at least one approved strategy brief before journaling.',
      completed: state.reviewedStrategies.length >= 1,
      current: Math.min(state.reviewedStrategies.length, 1),
      target: 1,
    },
    {
      id: 'first-reflection',
      label: 'Completed first setup reflection',
      description: 'Capture both the outcome and the lesson learned.',
      completed: reflectiveEntries >= 1,
      current: Math.min(reflectiveEntries, 1),
      target: 1,
    },
    {
      id: 'three-entries',
      label: 'Completed 3 practice journal entries',
      description: 'Build repetition before increasing complexity.',
      completed: entries.length >= 3,
      current: Math.min(entries.length, 3),
      target: 3,
    },
    {
      id: 'consistency-streak',
      label: 'Maintained a 3-day learning streak',
      description: 'Stay consistent with simulation-first repetition.',
      completed: calculateStreak(entries) >= 3,
      current: Math.min(calculateStreak(entries), 3),
      target: 3,
    },
  ];

  return {
    totalEntries: entries.length,
    reflectiveEntries,
    reviewedStrategies: state.reviewedStrategies.length,
    practicedSignals,
    streakDays: calculateStreak(entries),
    completedMilestones: milestones.filter((item) => item.completed).length,
    totalMilestones: milestones.length,
    latestEntryLabel: entries[0]?.tradeDate ? new Date(entries[0].tradeDate).toLocaleDateString() : 'No journal entries yet',
    milestones,
  };
}

export function buildCoachReflection(entry: PaperTradeJournalEntry | null): CoachReflection | null {
  if (!entry) return null;

  const before = Number(entry.confidenceBefore || 0);
  const after = Number(entry.confidenceAfter || 0);
  const confidenceShift = after - before;
  const confidenceLine = confidenceShift > 0
    ? 'Confidence improved after review, which suggests the replay clarified your process.'
    : confidenceShift < 0
    ? 'Confidence dropped after review, which is useful because it usually means the journal exposed weak assumptions.'
    : 'Confidence stayed stable after review, which can indicate the setup matched expectations.';

  return {
    title: entry.sourceType === 'signal' ? 'Signal Reflection' : entry.sourceType === 'strategy' ? 'Strategy Reflection' : 'Practice Reflection',
    summary: `${confidenceLine} Focus on whether the entry plan, stop plan, and rationale stayed aligned throughout the simulated setup. ${String(entry.lessonLearned || 'Capture one clean lesson before the next replay.').trim()}`,
    nextStep: entry.sourceType === 'signal'
      ? 'Review the linked signal again, then compare your rationale with the post-review lesson before logging another simulation.'
      : 'Study one approved strategy brief, then log another paper trade only after defining invalidation and target conditions in writing.',
  };
}