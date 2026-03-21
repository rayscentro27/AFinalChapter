import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { resolveTenantIdForUser } from '../../utils/tenantContext';

type StrategyRow = {
  strategy_id?: string;
  symbol?: string;
  timeframe?: string;
  structure_type?: string;
  underlying_symbol?: string;
  trades_total?: number;
  win_rate?: number;
  profit_factor?: number;
  net_pnl?: number;
  rank?: number;
  status?: string;
  created_at?: string;
};

type ScorecardRow = {
  agent_name?: string;
  agent_role?: string;
  score?: number;
  decision_accuracy?: number;
  confidence_calibration_score?: number;
  throughput?: number;
  created_at?: string;
};

type HypothesisRow = {
  id?: string;
  strategy_id?: string;
  symbol?: string;
  hypothesis?: string;
  status?: string;
  confidence_band?: string;
  created_at?: string;
};

type GapRow = {
  id?: string;
  strategy_id?: string;
  symbol?: string;
  gap_type?: string;
  priority?: string;
  status?: string;
  confidence_band?: string;
  created_at?: string;
};

type FetchResearchOptions = {
  tenantId: string;
  accessToken?: string;
};

type ResearchEndpoint =
  | 'strategy-rankings'
  | 'options-rankings'
  | 'agent-scorecards'
  | 'recent-hypotheses'
  | 'coverage-gaps';

const card = 'bg-slate-900 border border-white/10 rounded-2xl p-4';

async function fetchResearch(
  endpoint: ResearchEndpoint,
  options: FetchResearchOptions,
  params: Record<string, string | number | undefined> = {}
) {
  const query = new URLSearchParams({
    endpoint,
    tenant_id: options.tenantId,
  });

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    query.set(key, String(value));
  }

  const headers: Record<string, string> = {};
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const response = await fetch(`/.netlify/functions/research-proxy?${query.toString()}`, {
    method: 'GET',
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error || `Request failed: ${response.status}`));
  }

  return payload;
}

function fmtNum(value: number | undefined | null, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '-';
  return Number(value).toFixed(digits);
}

function fmtDate(value?: string) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function ResearchDashboardPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tenantId, setTenantId] = useState('');

  const [forex, setForex] = useState<StrategyRow[]>([]);
  const [options, setOptions] = useState<StrategyRow[]>([]);
  const [scorecards, setScorecards] = useState<ScorecardRow[]>([]);
  const [hypotheses, setHypotheses] = useState<HypothesisRow[]>([]);
  const [gaps, setGaps] = useState<GapRow[]>([]);

  async function load() {
    setError('');

    if (!user?.id) {
      setTenantId('');
      setForex([]);
      setOptions([]);
      setScorecards([]);
      setHypotheses([]);
      setGaps([]);
      setError('Sign in is required to view tenant-scoped research data.');
      return;
    }

    const resolvedTenantId = await resolveTenantIdForUser(user.id);
    if (!resolvedTenantId) {
      setTenantId('');
      setForex([]);
      setOptions([]);
      setScorecards([]);
      setHypotheses([]);
      setGaps([]);
      setError('No tenant membership found for this user.');
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || '';

    if (!accessToken) {
      setTenantId(resolvedTenantId);
      setForex([]);
      setOptions([]);
      setScorecards([]);
      setHypotheses([]);
      setGaps([]);
      setError('Missing access token for research API requests. Please re-authenticate.');
      return;
    }

    setTenantId(resolvedTenantId);

    try {
      const req = { tenantId: resolvedTenantId, accessToken };
      const [forexRes, optionsRes, scoreRes, hypRes, gapRes] = await Promise.all([
        fetchResearch('strategy-rankings', req, { limit: 10 }),
        fetchResearch('options-rankings', req, { limit: 10 }),
        fetchResearch('agent-scorecards', req, { limit: 10 }),
        fetchResearch('recent-hypotheses', req, { limit: 10 }),
        fetchResearch('coverage-gaps', req, { limit: 10 }),
      ]);

      setForex(Array.isArray(forexRes?.items) ? forexRes.items : []);
      setOptions(Array.isArray(optionsRes?.items) ? optionsRes.items : []);
      setScorecards(Array.isArray(scoreRes?.items) ? scoreRes.items : []);
      setHypotheses(Array.isArray(hypRes?.items) ? hypRes.items : []);
      setGaps(Array.isArray(gapRes?.items) ? gapRes.items : []);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      await load();
      if (active) setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [user?.id]);

  if (loading) return <div className="max-w-7xl mx-auto p-6 text-slate-200">Loading research dashboard...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Research Dashboard</h1>
          <p className="text-sm text-slate-400 mt-2">Read-only strategy, options, scorecard, and hypothesis visibility.</p>
          <p className="text-xs text-slate-500 mt-1">Tenant scope: {tenantId || '-'}</p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          className="rounded-xl bg-black/30 border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-4 text-sm font-medium">{error}</div>
      ) : null}

      <section className={card}>
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-3">Top Forex Strategies</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-xs">
            <thead className="text-slate-400 uppercase tracking-wide">
              <tr>
                <th className="text-left py-2 pr-3">Rank</th>
                <th className="text-left py-2 pr-3">Strategy</th>
                <th className="text-left py-2 pr-3">Symbol</th>
                <th className="text-left py-2 pr-3">Win Rate</th>
                <th className="text-left py-2 pr-3">Profit Factor</th>
                <th className="text-left py-2 pr-3">Net PnL</th>
              </tr>
            </thead>
            <tbody>
              {forex.map((row, idx) => (
                <tr key={`fx-${row.strategy_id || idx}`} className="border-t border-white/5">
                  <td className="py-2 pr-3">{row.rank || idx + 1}</td>
                  <td className="py-2 pr-3">{row.strategy_id || '-'}</td>
                  <td className="py-2 pr-3">{row.symbol || '-'}</td>
                  <td className="py-2 pr-3">{fmtNum(row.win_rate)}</td>
                  <td className="py-2 pr-3">{fmtNum(row.profit_factor)}</td>
                  <td className="py-2 pr-3">{fmtNum(row.net_pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-3">Top Options Structures</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-xs">
            <thead className="text-slate-400 uppercase tracking-wide">
              <tr>
                <th className="text-left py-2 pr-3">Rank</th>
                <th className="text-left py-2 pr-3">Strategy</th>
                <th className="text-left py-2 pr-3">Underlying</th>
                <th className="text-left py-2 pr-3">Structure</th>
                <th className="text-left py-2 pr-3">Win Rate</th>
                <th className="text-left py-2 pr-3">Profit Factor</th>
              </tr>
            </thead>
            <tbody>
              {options.map((row, idx) => (
                <tr key={`opt-${row.strategy_id || idx}`} className="border-t border-white/5">
                  <td className="py-2 pr-3">{row.rank || idx + 1}</td>
                  <td className="py-2 pr-3">{row.strategy_id || '-'}</td>
                  <td className="py-2 pr-3">{row.underlying_symbol || '-'}</td>
                  <td className="py-2 pr-3">{row.structure_type || '-'}</td>
                  <td className="py-2 pr-3">{fmtNum(row.win_rate)}</td>
                  <td className="py-2 pr-3">{fmtNum(row.profit_factor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-3">Agent Scorecards</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-xs">
            <thead className="text-slate-400 uppercase tracking-wide">
              <tr>
                <th className="text-left py-2 pr-3">Agent</th>
                <th className="text-left py-2 pr-3">Role</th>
                <th className="text-left py-2 pr-3">Score</th>
                <th className="text-left py-2 pr-3">Decision Accuracy</th>
                <th className="text-left py-2 pr-3">Calibration</th>
                <th className="text-left py-2 pr-3">Throughput</th>
              </tr>
            </thead>
            <tbody>
              {scorecards.map((row, idx) => (
                <tr key={`score-${row.agent_name || idx}`} className="border-t border-white/5">
                  <td className="py-2 pr-3">{row.agent_name || '-'}</td>
                  <td className="py-2 pr-3">{row.agent_role || '-'}</td>
                  <td className="py-2 pr-3">{fmtNum(row.score)}</td>
                  <td className="py-2 pr-3">{fmtNum(row.decision_accuracy)}</td>
                  <td className="py-2 pr-3">{fmtNum(row.confidence_calibration_score)}</td>
                  <td className="py-2 pr-3">{fmtNum(row.throughput)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className={card}>
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-3">Recent Hypotheses</h2>
          <div className="space-y-2">
            {hypotheses.map((row, idx) => (
              <div key={`hyp-${row.id || idx}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-slate-300 font-bold">{row.symbol || row.strategy_id || 'Untitled'}</div>
                <div className="text-xs text-slate-400 mt-1">{row.hypothesis || '-'}</div>
                <div className="text-[10px] text-slate-500 mt-2">{row.status || '-'} • {row.confidence_band || '-'} • {fmtDate(row.created_at)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-3">Coverage Gaps</h2>
          <div className="space-y-2">
            {gaps.map((row, idx) => (
              <div key={`gap-${row.id || idx}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-slate-300 font-bold">{row.symbol || row.strategy_id || 'Untitled'} • {row.gap_type || '-'}</div>
                <div className="text-[10px] text-slate-500 mt-2">priority {row.priority || '-'} • {row.status || '-'} • {row.confidence_band || '-'} • {fmtDate(row.created_at)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
=======
import React from 'react';
import FundingResearchPage from './FundingResearchPage';

export default function ResearchDashboardPage() {
  return <FundingResearchPage />;
>>>>>>> 3568bd0 (chore: sync local changes and sanitize repo)
}
