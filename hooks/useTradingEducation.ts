import { useMemo } from 'react';
import type { TradingAccessSnapshot } from '../services/tradingAccessService';

export type TradingToolRecommendation = {
  key: string;
  name: string;
  description: string;
  usefulness: string;
  fit: string;
};

export type ApprovedStrategyCard = {
  id: string;
  title: string;
  category: 'forex' | 'options' | 'futures' | 'equities';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  summary: string;
  when_it_works: string;
  when_it_fails: string;
  risk_note: string;
  confidence_score: number;
  approval_status: 'approved';
};

export type TradingChecklistItem = {
  key: string;
  title: string;
  done: boolean;
  required: boolean;
};

export type TradingJourneyStep = {
  key: string;
  title: string;
  description: string;
  status: 'locked' | 'ready' | 'active' | 'done';
};

const TOOL_RECOMMENDATIONS: TradingToolRecommendation[] = [
  {
    key: 'tradingview',
    name: 'TradingView',
    description: 'Charting and replay environment useful for structured strategy review and simulation planning.',
    usefulness: 'Clear visual charting, watchlists, and scenario walkthroughs.',
    fit: 'Best when learning setup identification and journaling decisions.',
  },
  {
    key: 'webull',
    name: 'Webull',
    description: 'Platform with paper trading support and market data access for simulation-first practice.',
    usefulness: 'Simple paper account workflow and order simulation.',
    fit: 'Best when practicing basic execution mechanics without real capital.',
  },
];

const APPROVED_STRATEGIES: ApprovedStrategyCard[] = [
  {
    id: 'approved_fx_london_breakout',
    title: 'London Session Breakout (Paper First)',
    category: 'forex',
    difficulty: 'beginner',
    summary: 'Focuses on a breakout around a pre-defined range during active session liquidity windows.',
    when_it_works: 'Higher-liquidity sessions with clear range compression and directional participation.',
    when_it_fails: 'Choppy low-conviction sessions with repeated fake breakouts.',
    risk_note: 'Use fixed risk per trade and stop simulation when two invalid breakouts occur in sequence.',
    confidence_score: 68,
    approval_status: 'approved',
  },
  {
    id: 'approved_options_credit_spread',
    title: 'Defined-Risk Credit Spread Framework',
    category: 'options',
    difficulty: 'intermediate',
    summary: 'Teaches defined-risk structures using position sizing and preplanned exits.',
    when_it_works: 'Range-bound conditions with stable implied volatility assumptions.',
    when_it_fails: 'Fast trend expansion or volatility regime shifts against spread bias.',
    risk_note: 'Avoid oversized positions and only simulate with strict max-loss limits.',
    confidence_score: 64,
    approval_status: 'approved',
  },
  {
    id: 'approved_equity_trend_pullback',
    title: 'Trend Pullback Continuation',
    category: 'equities',
    difficulty: 'beginner',
    summary: 'Practice identifying dominant trend direction, then simulating pullback continuation entries.',
    when_it_works: 'Persistent trend markets with disciplined entry confirmation.',
    when_it_fails: 'Range-bound environments where trend structure repeatedly breaks.',
    risk_note: 'Never chase entries; keep stop placement and size consistent across simulations.',
    confidence_score: 61,
    approval_status: 'approved',
  },
];

export default function useTradingEducation(snapshot: TradingAccessSnapshot | null) {
  return useMemo(() => {
    const ready = Boolean(snapshot?.access_ready);
    const optedIn = Boolean(snapshot?.opted_in);
    const videoDone = Boolean(snapshot?.video_complete);
    const disclaimerDone = Boolean(snapshot?.disclaimer_complete);
    const selectedTool = snapshot?.selected_tool || null;
    const startedPaperTrading = Boolean(snapshot?.started_paper_trading);
    const firstSimulationCompleted = Boolean(snapshot?.first_simulation_completed);

    const checklist: TradingChecklistItem[] = [
      { key: 'opt_in', title: 'Enable advanced trading education', done: optedIn, required: true },
      { key: 'video', title: 'Watch the overview video', done: videoDone, required: true },
      { key: 'disclaimer', title: 'Accept educational disclaimer', done: disclaimerDone, required: true },
      { key: 'tool', title: 'Choose a simulation platform', done: Boolean(selectedTool), required: true },
      { key: 'start', title: 'Start paper trading', done: startedPaperTrading, required: true },
      { key: 'first_sim', title: 'Complete first simulation cycle', done: firstSimulationCompleted, required: true },
    ];

    const journey: TradingJourneyStep[] = [
      {
        key: 'welcome',
        title: 'Welcome to Trading Education',
        description: 'Optional educational path with risk-first guardrails.',
        status: ready ? 'done' : 'active',
      },
      {
        key: 'paper',
        title: 'Start Paper Trading',
        description: 'Practice setup selection and execution in simulation mode first.',
        status: !ready ? 'locked' : firstSimulationCompleted ? 'done' : startedPaperTrading ? 'active' : 'ready',
      },
      {
        key: 'strategy',
        title: 'Learn First Strategy',
        description: 'Review approved strategy cards and risk notes.',
        status: !ready ? 'locked' : selectedTool ? 'active' : 'ready',
      },
      {
        key: 'coach',
        title: 'Ask AI Coach',
        description: 'Get plain-language explanations and next simulation actions.',
        status: !ready ? 'locked' : 'ready',
      },
      {
        key: 'continue',
        title: 'Continue Learning',
        description: 'Repeat simulation, reflect, then progress to the next approved module.',
        status: !ready ? 'locked' : firstSimulationCompleted ? 'ready' : 'locked',
      },
    ];

    const topChecklistItem = checklist.find((item) => !item.done) || null;

    return {
      tools: TOOL_RECOMMENDATIONS,
      strategies: APPROVED_STRATEGIES,
      checklist,
      journey,
      topChecklistItem,
      selectedTool,
      startedPaperTrading,
      firstSimulationCompleted,
      ready,
    };
  }, [snapshot]);
}
