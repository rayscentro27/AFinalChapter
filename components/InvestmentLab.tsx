import React, { useEffect, useState } from 'react';
import { Contact } from '../types';
import {
  TrendingUp,
  ArrowRight,
  RefreshCw,
  ListChecks,
  Layers,
  PieChart,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import useTradingAccess from '../hooks/useTradingAccess';
import {
  fintechHero,
  fintechInset,
  fintechPrimaryButton,
  fintechSecondaryButton,
  fintechShell,
  fintechState,
} from './portal/fintechStyles';
import {
  ApprovedStrategyDetail,
  ApprovedStrategySummary,
  getApprovedStrategyDetail,
  listApprovedStrategies,
} from '../services/approvedStrategyService';
import { ApprovedSignalSummary, listApprovedSignals } from '../services/approvedSignalService';
import PaperTradeJournalSection from './tradingJournal/PaperTradeJournalSection';
import usePaperTradingJournal from '../hooks/usePaperTradingJournal';
import { PaperTradePracticeContext } from '../services/paperTradingJournalService';

interface InvestmentLabProps {
  contact: Contact;
  onUpdateContact: (contact: Contact) => void;
}

const InvestmentLab: React.FC<InvestmentLabProps> = ({ contact }) => {
  const [approvedStrategies, setApprovedStrategies] = useState<ApprovedStrategySummary[]>([]);
  const [approvedSignals, setApprovedSignals] = useState<ApprovedSignalSummary[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [selectedStrategyDetail, setSelectedStrategyDetail] = useState<ApprovedStrategyDetail | null>(null);
  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [signalError, setSignalError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const tradingAccess = useTradingAccess(contact.id, { reconcileOnFetch: true });
  const [practiceContext, setPracticeContext] = useState<Partial<PaperTradePracticeContext> | null>(null);

  const unlocked = Boolean(tradingAccess.snapshot?.access_ready);
  const journalScopeId = tradingAccess.snapshot?.tenant_id || contact.id;
  const journalTracker = usePaperTradingJournal(journalScopeId, unlocked);
  const approvedCount = approvedStrategies.length;
  const signalCount = approvedSignals.length;
  const optionsCount = approvedStrategies.filter((strategy) => strategy.assetType === 'options').length;
  const forexCount = approvedStrategies.filter((strategy) => strategy.assetType === 'forex').length;

  const loadStrategies = async () => {
    setLoadingStrategies(true);
    setStrategyError(null);
    try {
      const items = await listApprovedStrategies(12);
      setApprovedStrategies(items);
    } catch (error: any) {
      setStrategyError(String(error?.message || 'Unable to load approved strategies.'));
    } finally {
      setLoadingStrategies(false);
    }
  };

  const loadSignals = async () => {
    setLoadingSignals(true);
    setSignalError(null);
    try {
      const items = await listApprovedSignals(8);
      setApprovedSignals(items);
    } catch (error: any) {
      setSignalError(String(error?.message || 'Unable to load approved signals.'));
    } finally {
      setLoadingSignals(false);
    }
  };

  useEffect(() => {
    if (!unlocked) {
      setApprovedStrategies([]);
      setApprovedSignals([]);
      setSelectedStrategyId(null);
      setSelectedSignalId(null);
      setSelectedStrategyDetail(null);
      setStrategyError(null);
      setSignalError(null);
      setDetailError(null);
      return;
    }

    void loadStrategies();
    void loadSignals();
  }, [unlocked]);

  const handleSelectStrategy = async (strategy: ApprovedStrategySummary) => {
    if (selectedStrategyId === strategy.id) {
      setSelectedStrategyId(null);
      setSelectedStrategyDetail(null);
      setDetailError(null);
      return;
    }

    setSelectedStrategyId(strategy.id);
    setSelectedStrategyDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    journalTracker.markStrategyReviewed({ strategyId: strategy.id, title: strategy.title });

    try {
      const detail = await getApprovedStrategyDetail({
        recordId: strategy.recordId,
        assetType: strategy.assetType,
      });
      setSelectedStrategyDetail(detail);
    } catch (error: any) {
      setDetailError(String(error?.message || 'Unable to load strategy detail.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const openPracticeFromStrategy = (strategy: ApprovedStrategySummary) => {
    setPracticeContext({
      sourceType: 'strategy',
      sourceId: strategy.id,
      sourceTitle: strategy.title,
      marketSymbol: strategy.symbolLabel,
      marketType: strategy.assetType === 'options' ? 'options' : 'forex',
      strategyUsed: strategy.title,
      setupSummary: `${strategy.symbolLabel} • ${strategy.timeframeLabel}`,
      rationale: strategy.educationalFocus,
      timeframeLabel: strategy.timeframeLabel,
    });
  };

  const openPracticeFromSignal = (signal: ApprovedSignalSummary) => {
    setPracticeContext({
      sourceType: 'signal',
      sourceId: signal.id,
      sourceTitle: signal.title,
      marketSymbol: signal.symbolLabel,
      marketType: signal.assetType === 'options' ? 'options' : 'forex',
      strategyUsed: signal.title,
      setupSummary: `${signal.symbolLabel} • ${signal.timeframeLabel} • ${signal.sideLabel}`,
      rationale: signal.rationale,
      timeframeLabel: signal.timeframeLabel,
      sideLabel: signal.sideLabel,
    });
  };

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      <div className={`${fintechHero} p-10 md:p-12 text-slate-900 relative overflow-hidden`}>
        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12 text-emerald-700"><PieChart size={280} /></div>
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-8 border border-emerald-200">
            Trading Education
          </div>
          <h1 className="text-5xl md:text-6xl font-black mb-6 tracking-tighter uppercase leading-[0.92]">
            Advanced <span className="text-emerald-700">Market Education</span>
          </h1>
          <p className="text-slate-600 text-lg leading-relaxed mb-0 font-medium max-w-2xl">
            Advanced trading content is optional and educational-only. Complete the access checklist first, then start with paper trading.
          </p>
        </div>
      </div>

      {tradingAccess.loading && !tradingAccess.snapshot ? (
        <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 text-sm font-medium text-slate-700 flex items-center gap-3">
          <RefreshCw className="animate-spin text-slate-500" size={18} /> Checking trading access...
        </div>
      ) : null}

      {tradingAccess.error ? (
        <div className="rounded-[2.5rem] border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-700">
          {tradingAccess.error}
        </div>
      ) : null}

      {tradingAccess.snapshot && !unlocked ? (
        <div className={`${fintechShell} p-8 space-y-6`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xl font-black text-slate-900 tracking-tight">Advanced Trading Access Setup</div>
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border bg-amber-50 text-amber-700 border-amber-200">
              Locked
            </span>
          </div>

          {tradingAccess.snapshot.blockers.length > 0 ? (
            <div className="space-y-2">
              {tradingAccess.snapshot.blockers.map((blocker) => (
                <div key={blocker} className="text-sm text-slate-700 font-medium flex items-start gap-2">
                  <AlertTriangle size={15} className="text-amber-500 mt-0.5" />
                  <span>{blocker}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-emerald-700 font-medium flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5" />
              <span>Eligibility checks passed. Complete the setup actions below.</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => void tradingAccess.optIn()}
              disabled={!tradingAccess.snapshot.eligible || tradingAccess.snapshot.opted_in || tradingAccess.busyAction !== null}
              className={`${fintechPrimaryButton} text-xs disabled:opacity-40`}
            >
              {tradingAccess.busyAction === 'opt_in' ? 'Saving...' : tradingAccess.snapshot.opted_in ? 'Opt-In Complete' : 'Opt In'}
            </button>
            <button
              onClick={() => void tradingAccess.completeVideo()}
              disabled={!tradingAccess.snapshot.opted_in || tradingAccess.snapshot.video_complete || tradingAccess.busyAction !== null}
              className={`${fintechSecondaryButton} text-xs disabled:opacity-40`}
            >
              {tradingAccess.busyAction === 'video' ? 'Saving...' : tradingAccess.snapshot.video_complete ? 'Video Complete' : 'Mark Video Complete'}
            </button>
            <button
              onClick={() => void tradingAccess.acceptDisclaimer()}
              disabled={!tradingAccess.snapshot.video_complete || tradingAccess.snapshot.disclaimer_complete || tradingAccess.busyAction !== null}
              className={`${fintechSecondaryButton} text-xs disabled:opacity-40`}
            >
              {tradingAccess.busyAction === 'disclaimer' ? 'Saving...' : tradingAccess.snapshot.disclaimer_complete ? 'Disclaimer Accepted' : 'Accept Disclaimer'}
            </button>
          </div>

          <div className={`${fintechInset} p-4 text-xs text-slate-600 font-medium`}>
            Educational use only. No financial advice, no guarantees, and paper trading is recommended first.
          </div>
        </div>
      ) : null}

      {unlocked ? (
        <>
          <div className="rounded-[2.5rem] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700 font-medium flex items-start gap-3">
            <CheckCircle2 size={18} className="mt-0.5" />
            <div>
              Access unlocked. This library now pulls approved Oracle-backed educational strategies only. Keep simulation-first discipline before applying live capital.
            </div>
          </div>

          <PaperTradeJournalSection
            journal={journalTracker}
            practiceContext={practiceContext}
            onConsumePracticeContext={() => setPracticeContext(null)}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4 space-y-8">
              <div className={`${fintechShell} p-10`}>
                <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400 mb-6 flex items-center gap-2">
                  <ListChecks size={18} className="text-emerald-600" /> Approved Strategy Briefing
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed font-medium">
                  Review only strategies that have already cleared approval. Each brief stays educational, simulation-first, and secondary to the main business-growth workflow.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-3">
                  <div className={`${fintechInset} p-4`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Approved Library</p>
                    <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{approvedCount}</p>
                    <p className="mt-1 text-xs text-slate-500">{forexCount} forex strategy{forexCount === 1 ? '' : 'ies'} and {optionsCount} options structure{optionsCount === 1 ? '' : 's'}.</p>
                  </div>
                  <div className={`${fintechInset} p-4`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Operating Rule</p>
                    <p className="mt-2 text-sm font-medium text-slate-600">Study the logic, replay the rules, and keep sizing hypothetical until the journal evidence supports more confidence.</p>
                  </div>
                  <div className={`${fintechInset} p-4`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reviewed Signals</p>
                    <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{signalCount}</p>
                    <p className="mt-1 text-xs text-slate-500">Approved signals for educational timing review.</p>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-1 gap-3">
                  <button
                    onClick={() => void loadStrategies()}
                    disabled={loadingStrategies}
                    className={`${fintechPrimaryButton} w-full flex items-center justify-center gap-3 disabled:opacity-50`}
                  >
                    {loadingStrategies ? <RefreshCw className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                    Refresh Approved Library
                  </button>
                  <button
                    onClick={() => void loadSignals()}
                    disabled={loadingSignals}
                    className={`${fintechSecondaryButton} w-full flex items-center justify-center gap-3 disabled:opacity-50`}
                  >
                    {loadingSignals ? <RefreshCw className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                    Refresh Reviewed Signals
                  </button>
                </div>
              </div>

              <div className={`${fintechHero} p-8 relative overflow-hidden group`}>
                <div className="absolute top-0 right-0 p-4 opacity-10 text-emerald-700 group-hover:scale-110 transition-transform"><Layers size={100} /></div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Capital Pool</h3>
                <div className="text-5xl font-black tracking-tighter mb-4 text-slate-900">${(contact.revenue || 0).toLocaleString()}</div>
                <p className="text-[10px] font-black uppercase tracking-widest mt-4 text-emerald-700">Simulation First: Recommended</p>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-8">
              <div className="flex items-center justify-between gap-3 flex-wrap px-4">
                <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400">Approved Strategy Library</h3>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Oracle-backed</span>
              </div>

              {strategyError ? (
                <div className={`${fintechState} border-red-200 bg-red-50 text-red-700`}>
                  {strategyError}
                </div>
              ) : null}

              {loadingStrategies ? (
                <div className={`${fintechState} flex items-center gap-3`}>
                  <RefreshCw size={18} className="animate-spin text-slate-500" /> Loading approved strategies...
                </div>
              ) : approvedStrategies.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] p-20 text-center flex flex-col items-center justify-center">
                  <TrendingUp size={64} className="opacity-10 mb-4" />
                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No approved strategies are available yet.</p>
                  <p className="mt-3 max-w-md text-sm text-slate-500">Once Oracle-reviewed strategies are approved upstream, they will appear here as educational briefs for replay and paper-trading study.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {approvedStrategies.map((strat) => {
                    const isSelected = selectedStrategyId === strat.id;
                    const showDetail = isSelected && selectedStrategyDetail?.id === strat.id;

                    return (
                      <div key={strat.id} className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                      <div className="absolute top-0 right-0 p-8 opacity-5"><Layers size={120} /></div>
                      <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-6 relative z-10">
                        <div>
                          <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-indigo-200 mb-4 inline-block">
                            {strat.category}
                          </span>
                          <h4 className="text-3xl font-black text-slate-900 uppercase tracking-tight leading-none mb-2">{strat.title}</h4>
                          <p className="text-sm text-slate-500 font-medium">{strat.educationalSummary}</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {strat.tags.map((tag) => (
                              <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Approval Status</p>
                          <p className="text-2xl font-black text-emerald-600 tracking-tighter uppercase">{strat.statusLabel}</p>
                          <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{strat.rankLabel}</p>
                          <p className="mt-1 text-xs font-medium text-slate-500">{strat.createdAtLabel}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 border-t border-slate-100 pt-8 relative z-10">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><ListChecks size={14} /> Educational Metrics</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className={`${fintechInset} p-4`}>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Symbol</p>
                              <p className="mt-2 text-sm font-black text-slate-900">{strat.symbolLabel}</p>
                            </div>
                            <div className={`${fintechInset} p-4`}>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Timeframe</p>
                              <p className="mt-2 text-sm font-black text-slate-900">{strat.timeframeLabel}</p>
                            </div>
                            <div className={`${fintechInset} p-4`}>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Win Rate</p>
                              <p className="mt-2 text-sm font-black text-slate-900">{strat.winRateLabel}</p>
                            </div>
                            <div className={`${fintechInset} p-4`}>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Profit Factor</p>
                              <p className="mt-2 text-sm font-black text-slate-900">{strat.profitFactorLabel}</p>
                            </div>
                            <div className={`${fintechInset} p-4`}>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Max Drawdown</p>
                              <p className="mt-2 text-sm font-black text-slate-900">{strat.maxDrawdownLabel}</p>
                            </div>
                            <div className={`${fintechInset} p-4`}>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Trades Logged</p>
                              <p className="mt-2 text-sm font-black text-slate-900">{strat.tradeCountLabel}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col justify-end">
                          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 mb-6">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Educational Focus</p>
                            <p className="mt-2 text-sm font-medium text-slate-600">{strat.educationalFocus}</p>
                            <div className="mt-4 flex justify-between items-center">
                              <span className="text-[10px] font-black text-slate-400 uppercase">Risk Rating</span>
                              <span className={`text-[10px] font-black uppercase ${strat.riskLevel === 'Low' ? 'text-emerald-500' : strat.riskLevel === 'High' ? 'text-red-500' : 'text-amber-500'}`}>{strat.riskLevel}</span>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">{strat.caution}</p>
                          </div>
                          <button
                            onClick={() => void handleSelectStrategy(strat)}
                            className={`${isSelected ? fintechSecondaryButton : fintechPrimaryButton} w-full rounded-2xl flex items-center justify-center gap-2`}
                          >
                            {isSelected ? 'Hide Educational Brief' : 'View Educational Brief'} <ArrowRight size={14} />
                          </button>
                          <button
                            onClick={() => openPracticeFromStrategy(strat)}
                            className={`${fintechSecondaryButton} mt-3 w-full rounded-2xl flex items-center justify-center gap-2`}
                          >
                            Practice This Strategy <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>

                        {isSelected ? (
                          <div className="relative z-10 mt-6 rounded-[2rem] border border-slate-200 bg-slate-50/80 p-6">
                            {detailLoading ? (
                              <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
                                <RefreshCw size={16} className="animate-spin text-slate-500" /> Loading educational brief...
                              </div>
                            ) : detailError ? (
                              <div className="text-sm font-medium text-red-600">{detailError}</div>
                            ) : showDetail && selectedStrategyDetail ? (
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Study Checklist</p>
                                  <div className="mt-4 space-y-3">
                                    {selectedStrategyDetail.checklist.map((step, index) => (
                                      <div key={step} className="flex gap-3 items-start">
                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-black text-slate-700 border border-slate-200">{index + 1}</div>
                                        <p className="text-sm text-slate-600 font-medium leading-relaxed">{step}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">When To Study It</p>
                                  <div className="mt-4 space-y-3">
                                    {selectedStrategyDetail.suitability.map((item) => (
                                      <div key={item} className={`${fintechInset} p-4 text-sm text-slate-600 font-medium`}>
                                        {item}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Risk Notes</p>
                                  <div className="mt-4 space-y-3">
                                    {selectedStrategyDetail.riskNotes.map((note) => (
                                      <div key={note} className={`${fintechInset} p-4 text-sm text-slate-600 font-medium`}>
                                        {note}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 flex-wrap px-4 pt-2">
                <h3 className="font-black text-xs uppercase tracking-[0.3em] text-slate-400">Reviewed Signal Feed</h3>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Educational only</span>
              </div>

              {signalError ? (
                <div className={`${fintechState} border-red-200 bg-red-50 text-red-700`}>
                  {signalError}
                </div>
              ) : null}

              {loadingSignals ? (
                <div className={`${fintechState} flex items-center gap-3`}>
                  <RefreshCw size={18} className="animate-spin text-slate-500" /> Loading reviewed signals...
                </div>
              ) : approvedSignals.length === 0 ? (
                <div className={`${fintechState}`}>
                  No approved educational signals are available yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {approvedSignals.map((signal) => {
                    const isSelected = selectedSignalId === signal.id;

                    return (
                      <div key={signal.id} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap gap-2">
                              {signal.tags.map((tag) => (
                                <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <h4 className="mt-4 text-2xl font-black tracking-tight text-slate-900">{signal.title}</h4>
                            <p className="mt-2 text-sm font-medium text-slate-600">{signal.summary}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Confidence</p>
                            <p className="mt-1 text-xl font-black text-emerald-700">{signal.confidenceLabel}</p>
                            <p className="mt-2 text-xs font-medium text-slate-500">{signal.createdAtLabel}</p>
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className={`${fintechInset} p-4`}>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Symbol</p>
                            <p className="mt-2 text-sm font-black text-slate-900">{signal.symbolLabel}</p>
                          </div>
                          <div className={`${fintechInset} p-4`}>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Timeframe</p>
                            <p className="mt-2 text-sm font-black text-slate-900">{signal.timeframeLabel}</p>
                          </div>
                          <div className={`${fintechInset} p-4`}>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Direction</p>
                            <p className="mt-2 text-sm font-black text-slate-900">{signal.sideLabel}</p>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-col gap-4">
                          <button
                            onClick={() => setSelectedSignalId(isSelected ? null : signal.id)}
                            className={`${isSelected ? fintechSecondaryButton : fintechPrimaryButton} w-full md:w-auto flex items-center justify-center gap-2`}
                          >
                            {isSelected ? 'Hide Signal Context' : 'View Signal Context'} <ArrowRight size={14} />
                          </button>
                          <button
                            onClick={() => openPracticeFromSignal(signal)}
                            className={`${fintechSecondaryButton} w-full md:w-auto flex items-center justify-center gap-2`}
                          >
                            Practice This Setup <ArrowRight size={14} />
                          </button>
                          {isSelected ? (
                            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Signal Rationale</p>
                              <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600">{signal.rationale}</p>
                              <p className="mt-4 text-xs font-medium text-slate-500">{signal.caution}</p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {tradingAccess.snapshot && !unlocked ? (
        <div className="rounded-[2.5rem] border border-slate-200 bg-slate-50 p-5 text-xs text-slate-600 font-medium flex items-start gap-3">
          <Lock size={16} className="mt-0.5 text-slate-500" />
          Advanced trading remains secondary to business growth. Complete setup steps to unlock this optional learning module.
        </div>
      ) : null}
    </div>
  );
};

export default InvestmentLab;
