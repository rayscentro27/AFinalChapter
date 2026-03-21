import React, { useMemo, useState } from 'react';
import { Contact } from '../types';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Lock,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import useTradingAccess from '../hooks/useTradingAccess';
import useTradingEducation from '../hooks/useTradingEducation';
import usePortalAI from '../hooks/usePortalAI';
import useTradingSignals from '../hooks/useTradingSignals';

interface InvestmentLabProps {
  contact: Contact;
}

function statusTone(status: 'locked' | 'ready' | 'active' | 'done'): string {
  if (status === 'done') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'active') return 'border-blue-200 bg-blue-50 text-blue-800';
  if (status === 'ready') return 'border-slate-200 bg-white text-slate-800';
  return 'border-slate-200 bg-slate-50 text-slate-500';
}

const InvestmentLab: React.FC<InvestmentLabProps> = ({ contact }) => {
  const [coachPrompt, setCoachPrompt] = useState('Explain the safest next simulation step for me.');
  const [signalSymbolFilter, setSignalSymbolFilter] = useState('');
  const [signalTimeframeFilter, setSignalTimeframeFilter] = useState('');

  const tradingAccess = useTradingAccess(contact.id, { reconcileOnFetch: true });
  const coach = usePortalAI(contact.id, 'trading_coach');
  const education = useTradingEducation(tradingAccess.snapshot);
  const liveSignals = useTradingSignals(Boolean(tradingAccess.snapshot?.access_ready), { limit: 20, offset: 0 });

  const funded = useMemo(
    () => contact.status === 'Closed' || (contact.fundedDeals?.length || 0) > 0,
    [contact.fundedDeals?.length, contact.status]
  );

  const lockReason =
    !funded
      ? 'This module is available only after funding is logged and post-funding stage is active.'
      : !tradingAccess.snapshot?.eligible
      ? 'Complete post-funding and capital-protection prerequisites to unlock this optional module.'
      : !tradingAccess.snapshot?.access_ready
      ? 'Finish opt-in, overview video, and disclaimer to unlock educational content.'
      : null;

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <section className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Optional Post-Funding Module</div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Trading Education</h2>
            <p className="mt-2 max-w-3xl text-sm font-medium text-slate-600">
              Educational-only environment. No live execution. No guarantees. Practice-first progression with gated access.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                tradingAccess.snapshot?.eligible
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}
            >
              {tradingAccess.snapshot?.eligible ? 'Eligible' : 'Locked'}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                tradingAccess.snapshot?.access_ready
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-slate-100 text-slate-600'
              }`}
            >
              {tradingAccess.snapshot?.access_ready ? 'Unlocked' : 'Setup Required'}
            </span>
          </div>
        </div>

        {tradingAccess.loading && !tradingAccess.snapshot ? (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
            <RefreshCw size={16} className="animate-spin text-slate-500" /> Loading trading education access...
          </div>
        ) : null}

        {tradingAccess.error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {tradingAccess.error}
          </div>
        ) : null}

        {lockReason ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700 flex items-start gap-2">
            <Lock size={15} className="mt-0.5 text-slate-500" />
            <span>{lockReason}</span>
          </div>
        ) : null}

        {tradingAccess.snapshot ? (
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
            <button
              type="button"
              disabled={!tradingAccess.snapshot.eligible || tradingAccess.snapshot.opted_in || tradingAccess.busyAction !== null}
              onClick={() => void tradingAccess.optIn()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 disabled:opacity-50"
            >
              {tradingAccess.snapshot.opted_in ? '1) Opt-In Complete' : tradingAccess.busyAction === 'opt_in' ? 'Saving...' : '1) Opt In'}
            </button>

            <button
              type="button"
              disabled={!tradingAccess.snapshot.opted_in || tradingAccess.snapshot.video_complete || tradingAccess.busyAction !== null}
              onClick={() => void tradingAccess.completeVideo()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 disabled:opacity-50"
            >
              {tradingAccess.snapshot.video_complete
                ? '2) Video Complete'
                : tradingAccess.busyAction === 'video'
                ? 'Saving...'
                : '2) Mark Overview Complete'}
            </button>

            <button
              type="button"
              disabled={!tradingAccess.snapshot.video_complete || tradingAccess.snapshot.disclaimer_complete || tradingAccess.busyAction !== null}
              onClick={() => void tradingAccess.acceptDisclaimer()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 disabled:opacity-50"
            >
              {tradingAccess.snapshot.disclaimer_complete
                ? '3) Disclaimer Accepted'
                : tradingAccess.busyAction === 'disclaimer'
                ? 'Saving...'
                : '3) Accept Disclaimer'}
            </button>
          </div>
        ) : null}
      </section>

      {tradingAccess.snapshot?.access_ready ? (
        <>
          <section className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Start Here</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Practice Before Real Capital</h3>
            <p className="mt-2 text-sm text-slate-600">
              Use this checklist to complete the first simulation cycle before exploring deeper strategy education.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
              {education.checklist.map((item) => (
                <div key={item.key} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.required ? 'Required' : 'Optional'}</p>
                  </div>
                  {item.done ? <CheckCircle2 size={18} className="text-emerald-600" /> : <Circle size={18} className="text-slate-400" />}
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {!education.selectedTool
                ? education.tools.map((tool) => (
                    <button
                      key={tool.key}
                      type="button"
                      onClick={() =>
                        void tradingAccess.updateLearningProgress({
                          selected_tool: tool.key,
                        })
                      }
                      disabled={tradingAccess.busyAction !== null}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50"
                    >
                      {tradingAccess.busyAction === 'learning' ? 'Saving...' : `Select ${tool.name}`}
                    </button>
                  ))
                : null}

              {!education.startedPaperTrading ? (
                <button
                  type="button"
                  onClick={() =>
                    void tradingAccess.updateLearningProgress({
                      started_paper_trading: true,
                    })
                  }
                  disabled={tradingAccess.busyAction !== null}
                  className="rounded-xl bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
                >
                  {tradingAccess.busyAction === 'learning' ? 'Saving...' : 'Mark Paper Trading Started'}
                </button>
              ) : null}

              {education.startedPaperTrading && !education.firstSimulationCompleted ? (
                <button
                  type="button"
                  onClick={() =>
                    void tradingAccess.updateLearningProgress({
                      first_simulation_completed: true,
                    })
                  }
                  disabled={tradingAccess.busyAction !== null}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
                >
                  {tradingAccess.busyAction === 'learning' ? 'Saving...' : 'Mark First Simulation Complete'}
                </button>
              ) : null}
            </div>

            <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              Simulation-first guidance: document setup, entry, risk, and exit rationale before moving to another strategy.
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Tools Layer</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Simulation Platforms</h3>
              <div className="mt-4 space-y-3">
                {education.tools.map((tool) => (
                  <div key={tool.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-slate-900">{tool.name}</p>
                      {education.selectedTool === tool.key ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                          Selected
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-slate-600">{tool.description}</p>
                    <p className="mt-2 text-xs text-slate-700 font-medium">Why useful: {tool.usefulness}</p>
                    <p className="mt-1 text-xs text-slate-700 font-medium">Learning fit: {tool.fit}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Trading Journey</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Guided Progression</h3>
              <div className="mt-4 space-y-3">
                {education.journey.map((step) => (
                  <div key={step.key} className={`rounded-2xl border p-4 ${statusTone(step.status)}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-black">{step.title}</p>
                      <span className="rounded-full border border-current/20 bg-white/60 px-2 py-1 text-[10px] font-black uppercase tracking-widest">
                        {step.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs opacity-80">{step.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Approved Strategy Library</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Educational Strategy Cards</h3>
            <p className="mt-2 text-sm text-slate-600">Only approved strategy summaries are shown here. Raw research remains outside the portal UI.</p>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {education.strategies.map((strategy) => (
                <article key={strategy.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
                      {strategy.category}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
                      {strategy.difficulty}
                    </span>
                  </div>
                  <h4 className="mt-3 text-lg font-black tracking-tight text-slate-900">{strategy.title}</h4>
                  <p className="mt-2 text-xs text-slate-600">{strategy.summary}</p>

                  <div className="mt-3 space-y-2 text-xs">
                    <p className="text-slate-700"><span className="font-black">When it works:</span> {strategy.when_it_works}</p>
                    <p className="text-slate-700"><span className="font-black">When it fails:</span> {strategy.when_it_fails}</p>
                    <p className="text-amber-800"><span className="font-black">Risk note:</span> {strategy.risk_note}</p>
                    <p className="text-slate-700"><span className="font-black">Confidence:</span> {strategy.confidence_score}%</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Live Approved Signals</p>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Portal Consumption Contract</h3>
                <p className="mt-2 text-sm text-slate-600">Reads from `/api/trading/signals` with client-safe fields only.</p>
              </div>
              <button
                type="button"
                onClick={() => void liveSignals.refresh()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700"
              >
                <RefreshCw size={14} className={liveSignals.loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="text-xs font-bold text-slate-700">
                Symbol
                <input
                  value={signalSymbolFilter}
                  onChange={(event) => setSignalSymbolFilter(event.target.value.toUpperCase())}
                  placeholder="EURUSD"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Timeframe
                <select
                  value={signalTimeframeFilter}
                  onChange={(event) => setSignalTimeframeFilter(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">All</option>
                  <option value="15m">15m</option>
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                  <option value="1d">1d</option>
                </select>
              </label>

              <div className="md:col-span-2 flex items-end">
                <button
                  type="button"
                  onClick={() =>
                    liveSignals.setFilters((prev) => ({
                      ...prev,
                      symbol: signalSymbolFilter.trim() || undefined,
                      timeframe: signalTimeframeFilter || undefined,
                      market_type: 'forex',
                      offset: 0,
                    }))
                  }
                  className="w-full rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white"
                >
                  Apply Signal Filters
                </button>
              </div>
            </div>

            {liveSignals.error ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {liveSignals.error}
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {liveSignals.loading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Loading approved signals...</div>
              ) : liveSignals.signals.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No approved/published signals matched this filter.
                </div>
              ) : (
                liveSignals.signals.slice(0, 12).map((signal) => (
                  <article key={signal.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-black text-slate-900">
                        {signal.symbol} · {signal.direction} · {signal.timeframe}
                      </p>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
                        {signal.review_status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-900">{signal.headline || 'Signal setup'}</p>
                    <p className="mt-1 text-xs text-slate-700">{signal.client_summary || signal.why_it_matters || 'No summary available.'}</p>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-4">
                      <p><span className="font-black">Confidence:</span> {signal.confidence_label || 'n/a'}</p>
                      <p><span className="font-black">Risk:</span> {signal.risk_label || 'n/a'}</p>
                      <p><span className="font-black">Score:</span> {signal.score_total ?? 'n/a'}</p>
                      <p><span className="font-black">Expires:</span> {signal.expires_at ? new Date(signal.expires_at).toLocaleString() : 'n/a'}</p>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Trading Coach</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">AI-Guided Explanation Layer</h3>
            <p className="mt-2 text-sm text-slate-600">Ask for concept explanations and practical simulation steps. Educational guidance only.</p>

            <div className="mt-4 space-y-3">
              <textarea
                value={coachPrompt}
                onChange={(event) => setCoachPrompt(event.target.value)}
                className="min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
                placeholder="Ask the Trading Coach to explain risk and your next simulation step."
              />

              <button
                type="button"
                onClick={() =>
                  void coach.ask({
                    coaching_goal: 'Explain my next simulation-first action and the key risk controls.',
                    user_message: coachPrompt,
                  })
                }
                disabled={coach.loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50"
              >
                <Sparkles size={14} /> {coach.loading ? 'Loading Guidance...' : 'Ask Trading Coach'}
              </button>

              {coach.error ? <p className="text-sm font-medium text-red-600">{coach.error}</p> : null}

              {coach.data?.answer ? (
                <pre className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  {coach.data.answer}
                </pre>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 font-medium flex items-start gap-2">
              <ShieldAlert size={15} className="mt-0.5" />
              Educational content only. No financial advice. No buy/sell directives. No performance guarantees.
            </div>
          </section>
        </>
      ) : tradingAccess.snapshot ? (
        <section className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
          <h3 className="text-2xl font-black tracking-tight text-slate-900">Trading Education Not Yet Unlocked</h3>
          {(tradingAccess.snapshot.blockers || []).length ? (
            <div className="mt-4 space-y-2">
              {tradingAccess.snapshot.blockers.map((blocker) => (
                <p key={blocker} className="flex items-start gap-2 text-sm font-medium text-amber-700">
                  <AlertTriangle size={15} className="mt-0.5" /> {blocker}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">Complete the setup sequence above to continue.</p>
          )}
        </section>
      ) : null}
    </div>
  );
};

export default InvestmentLab;
