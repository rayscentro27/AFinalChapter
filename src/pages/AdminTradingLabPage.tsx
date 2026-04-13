import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

type TabKey = 'strategies' | 'backtests' | 'demo_runs' | 'lessons' | 'demo_accounts' | 'client_progress';

type StrategyCandidateRow = {
  id: string;
  candidate_name: string;
  asset_class: string;
  timeframe: string | null;
  status: string | null;
  created_at: string | null;
};

type StrategyScoreRow = {
  id: string;
  candidate_id: string;
  total_score: number | null;
  recommendation: string | null;
  created_at: string | null;
};

type BacktestRunRow = {
  id: string;
  strategy_version_id: string;
  asset_class: string;
  symbol: string | null;
  timeframe: string | null;
  run_status: string | null;
  created_at: string | null;
};

type BacktestMetricRow = {
  id: string;
  run_id: string;
  net_pnl: number | null;
  win_rate: number | null;
  max_drawdown: number | null;
  robustness_score: number | null;
  created_at: string | null;
};

type DemoRunRow = {
  id: string;
  run_name: string;
  strategy_version_id: string;
  demo_account_id: string | null;
  asset_class: string;
  run_status: string | null;
  created_at: string | null;
};

type DemoMetricRow = {
  id: string;
  run_id: string;
  net_pnl: number | null;
  win_rate: number | null;
  max_drawdown: number | null;
  stability_score: number | null;
  recommendation: string | null;
};

type DemoAccountRow = {
  id: string;
  provider: string;
  account_label: string;
  connection_status: string;
  owner_user_id: string | null;
  last_sync_at: string | null;
  tenant_id: string;
};

type LessonRow = {
  id: string;
  lesson_type: string;
  title: string;
  confidence_score: number | null;
  status: string | null;
  created_at: string | null;
};

type TradingAccessRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  trading_access_tier: string | null;
  trading_stage: string | null;
  trading_level: number | null;
  access_status: string | null;
  updated_at: string | null;
};

type TenantRow = { id: string; name: string | null };

const INTERNAL_ROLES = new Set(['admin', 'supervisor']);

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '—';
  return date.toLocaleString();
}

const TABS: Array<{ key: TabKey; label: string; description: string }> = [
  { key: 'strategies', label: 'Strategies', description: 'Hermes candidate library and scores.' },
  { key: 'backtests', label: 'Backtests', description: 'Latest backtest runs and performance metrics.' },
  { key: 'demo_runs', label: 'Demo Runs', description: 'Demo broker runs and metrics.' },
  { key: 'lessons', label: 'Lessons', description: 'Derived trading lessons and signals.' },
  { key: 'demo_accounts', label: 'Demo Accounts', description: 'Broker demo account inventory.' },
  { key: 'client_progress', label: 'Client Progress', description: 'Trading access tiers and readiness.' },
];

export default function AdminTradingLabPage() {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('strategies');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [strategyRows, setStrategyRows] = useState<StrategyCandidateRow[]>([]);
  const [strategyScores, setStrategyScores] = useState<StrategyScoreRow[]>([]);
  const [backtestRuns, setBacktestRuns] = useState<BacktestRunRow[]>([]);
  const [backtestMetrics, setBacktestMetrics] = useState<BacktestMetricRow[]>([]);
  const [demoRuns, setDemoRuns] = useState<DemoRunRow[]>([]);
  const [demoMetrics, setDemoMetrics] = useState<DemoMetricRow[]>([]);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccountRow[]>([]);
  const [lessonRows, setLessonRows] = useState<LessonRow[]>([]);
  const [accessRows, setAccessRows] = useState<TradingAccessRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      const { data, error: accessError } = await supabase.rpc('nexus_is_master_admin_compat');
      if (!active) return;
      if (accessError) {
        setAuthorized(INTERNAL_ROLES.has(String(user?.role || '').toLowerCase()));
      } else {
        setAuthorized(Boolean(data) || INTERNAL_ROLES.has(String(user?.role || '').toLowerCase()));
      }
      setChecking(false);
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [user?.role]);

  useEffect(() => {
    let active = true;

    async function loadTab() {
      if (!authorized) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        if (activeTab === 'strategies') {
          const [candidateRes, scoreRes] = await Promise.all([
            supabase
              .from('strategy_candidates')
              .select('id,candidate_name,asset_class,timeframe,status,created_at')
              .order('created_at', { ascending: false })
              .limit(80),
            supabase
              .from('strategy_scores')
              .select('id,candidate_id,total_score,recommendation,created_at')
              .order('created_at', { ascending: false })
              .limit(200),
          ]);
          if (candidateRes.error) throw new Error(candidateRes.error.message);
          if (scoreRes.error) throw new Error(scoreRes.error.message);
          if (!active) return;
          setStrategyRows((candidateRes.data || []) as StrategyCandidateRow[]);
          setStrategyScores((scoreRes.data || []) as StrategyScoreRow[]);
        }

        if (activeTab === 'backtests') {
          const [runRes, metricRes] = await Promise.all([
            supabase
              .from('strategy_backtest_runs')
              .select('id,strategy_version_id,asset_class,symbol,timeframe,run_status,created_at')
              .order('created_at', { ascending: false })
              .limit(80),
            supabase
              .from('strategy_backtest_metrics')
              .select('id,run_id,net_pnl,win_rate,max_drawdown,robustness_score,created_at')
              .order('created_at', { ascending: false })
              .limit(200),
          ]);
          if (runRes.error) throw new Error(runRes.error.message);
          if (metricRes.error) throw new Error(metricRes.error.message);
          if (!active) return;
          setBacktestRuns((runRes.data || []) as BacktestRunRow[]);
          setBacktestMetrics((metricRes.data || []) as BacktestMetricRow[]);
        }

        if (activeTab === 'demo_runs') {
          const [runRes, metricRes] = await Promise.all([
            supabase
              .from('demo_trade_runs')
              .select('id,run_name,strategy_version_id,demo_account_id,asset_class,run_status,created_at')
              .order('created_at', { ascending: false })
              .limit(80),
            supabase
              .from('demo_trade_metrics')
              .select('id,run_id,net_pnl,win_rate,max_drawdown,stability_score,recommendation')
              .order('created_at', { ascending: false })
              .limit(200),
          ]);
          if (runRes.error) throw new Error(runRes.error.message);
          if (metricRes.error) throw new Error(metricRes.error.message);
          if (!active) return;
          setDemoRuns((runRes.data || []) as DemoRunRow[]);
          setDemoMetrics((metricRes.data || []) as DemoMetricRow[]);
        }

        if (activeTab === 'lessons') {
          const lessonRes = await supabase
            .from('trading_lessons')
            .select('id,lesson_type,title,confidence_score,status,created_at')
            .order('created_at', { ascending: false })
            .limit(80);
          if (lessonRes.error) throw new Error(lessonRes.error.message);
          if (!active) return;
          setLessonRows((lessonRes.data || []) as LessonRow[]);
        }

        if (activeTab === 'demo_accounts') {
          const accountRes = await supabase
            .from('demo_accounts')
            .select('id,provider,account_label,connection_status,owner_user_id,last_sync_at,tenant_id')
            .order('created_at', { ascending: false })
            .limit(80);
          if (accountRes.error) throw new Error(accountRes.error.message);
          if (!active) return;
          setDemoAccounts((accountRes.data || []) as DemoAccountRow[]);
        }

        if (activeTab === 'client_progress') {
          const [accessRes, tenantRes] = await Promise.all([
            supabase
              .from('user_advanced_access')
              .select('id,tenant_id,user_id,trading_access_tier,trading_stage,trading_level,access_status,updated_at')
              .eq('feature_key', 'advanced_trading')
              .order('updated_at', { ascending: false })
              .limit(120),
            supabase
              .from('tenants')
              .select('id,name')
              .order('name', { ascending: true }),
          ]);
          if (accessRes.error) throw new Error(accessRes.error.message);
          if (tenantRes.error) throw new Error(tenantRes.error.message);
          if (!active) return;
          setAccessRows((accessRes.data || []) as TradingAccessRow[]);
          setTenants((tenantRes.data || []) as TenantRow[]);
        }
      } catch (e: any) {
        if (active) setError(String(e?.message || 'Unable to load trading lab data.'));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadTab();
    return () => {
      active = false;
    };
  }, [activeTab, authorized]);

  const scoreByCandidate = useMemo(() => {
    const map = new Map<string, StrategyScoreRow>();
    strategyScores.forEach((row) => {
      if (!map.has(row.candidate_id)) {
        map.set(row.candidate_id, row);
      }
    });
    return map;
  }, [strategyScores]);

  const metricByRun = useMemo(() => {
    const map = new Map<string, BacktestMetricRow>();
    backtestMetrics.forEach((row) => {
      if (!map.has(row.run_id)) {
        map.set(row.run_id, row);
      }
    });
    return map;
  }, [backtestMetrics]);

  const demoMetricByRun = useMemo(() => {
    const map = new Map<string, DemoMetricRow>();
    demoMetrics.forEach((row) => {
      if (!map.has(row.run_id)) {
        map.set(row.run_id, row);
      }
    });
    return map;
  }, [demoMetrics]);

  const tenantMap = useMemo(() => {
    const map = new Map<string, string>();
    tenants.forEach((row) => map.set(row.id, row.name || row.id));
    return map;
  }, [tenants]);

  if (checking) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-400">Verifying trading lab access...</div>;
  }

  if (!authorized) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-6 text-slate-700">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Restricted</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Internal trading lab access required</h1>
          <p className="mt-2 text-sm text-slate-600">This surface is reserved for super admins and internal operators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <header className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Trading Lab</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Internal trading lab</h1>
        <p className="mt-2 text-sm text-slate-600">Read-only operational view for Hermes strategy flow, backtests, demo runs, and client readiness.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              activeTab === tab.key
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 border border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{TABS.find((t) => t.key === activeTab)?.label}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">{TABS.find((t) => t.key === activeTab)?.description}</h2>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        {loading ? (
          <div className="min-h-[30vh] flex items-center justify-center text-slate-400">Loading lab data...</div>
        ) : (
          <div className="mt-4">
            {activeTab === 'strategies' && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left">Candidate</th>
                      <th className="px-3 py-2 text-left">Asset</th>
                      <th className="px-3 py-2 text-left">Timeframe</th>
                      <th className="px-3 py-2 text-left">Score</th>
                      <th className="px-3 py-2 text-left">Recommendation</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strategyRows.length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-4 text-slate-500">No strategy candidates yet.</td></tr>
                    ) : (
                      strategyRows.map((row) => {
                        const score = scoreByCandidate.get(row.id);
                        return (
                          <tr key={row.id} className="border-b border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-900">{row.candidate_name}</td>
                            <td className="px-3 py-2 text-slate-600">{row.asset_class}</td>
                            <td className="px-3 py-2 text-slate-600">{row.timeframe || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{score?.total_score ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{score?.recommendation || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{row.status || '—'}</td>
                            <td className="px-3 py-2 text-slate-500">{formatDate(row.created_at)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'backtests' && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left">Strategy Version</th>
                      <th className="px-3 py-2 text-left">Asset</th>
                      <th className="px-3 py-2 text-left">Symbol</th>
                      <th className="px-3 py-2 text-left">Timeframe</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Net PnL</th>
                      <th className="px-3 py-2 text-left">Win Rate</th>
                      <th className="px-3 py-2 text-left">Max DD</th>
                      <th className="px-3 py-2 text-left">Robustness</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtestRuns.length === 0 ? (
                      <tr><td colSpan={9} className="px-3 py-4 text-slate-500">No backtest runs yet.</td></tr>
                    ) : (
                      backtestRuns.map((row) => {
                        const metric = metricByRun.get(row.id);
                        return (
                          <tr key={row.id} className="border-b border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-900">{row.strategy_version_id}</td>
                            <td className="px-3 py-2 text-slate-600">{row.asset_class}</td>
                            <td className="px-3 py-2 text-slate-600">{row.symbol || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{row.timeframe || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{row.run_status || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{metric?.net_pnl ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{metric?.win_rate ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{metric?.max_drawdown ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{metric?.robustness_score ?? '—'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'demo_runs' && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left">Run</th>
                      <th className="px-3 py-2 text-left">Strategy Version</th>
                      <th className="px-3 py-2 text-left">Asset</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Net PnL</th>
                      <th className="px-3 py-2 text-left">Win Rate</th>
                      <th className="px-3 py-2 text-left">Stability</th>
                      <th className="px-3 py-2 text-left">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demoRuns.length === 0 ? (
                      <tr><td colSpan={8} className="px-3 py-4 text-slate-500">No demo runs yet.</td></tr>
                    ) : (
                      demoRuns.map((row) => {
                        const metric = demoMetricByRun.get(row.id);
                        return (
                          <tr key={row.id} className="border-b border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-900">{row.run_name}</td>
                            <td className="px-3 py-2 text-slate-600">{row.strategy_version_id}</td>
                            <td className="px-3 py-2 text-slate-600">{row.asset_class}</td>
                            <td className="px-3 py-2 text-slate-600">{row.run_status || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{metric?.net_pnl ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{metric?.win_rate ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{metric?.stability_score ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{metric?.recommendation || '—'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'lessons' && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Title</th>
                      <th className="px-3 py-2 text-left">Confidence</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lessonRows.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-4 text-slate-500">No trading lessons yet.</td></tr>
                    ) : (
                      lessonRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-600">{row.lesson_type}</td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{row.title}</td>
                          <td className="px-3 py-2 text-slate-600">{row.confidence_score ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{row.status || '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{formatDate(row.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'demo_accounts' && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left">Provider</th>
                      <th className="px-3 py-2 text-left">Account</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Owner</th>
                      <th className="px-3 py-2 text-left">Tenant</th>
                      <th className="px-3 py-2 text-left">Last Sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demoAccounts.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-4 text-slate-500">No demo accounts yet.</td></tr>
                    ) : (
                      demoAccounts.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-600">{row.provider}</td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{row.account_label}</td>
                          <td className="px-3 py-2 text-slate-600">{row.connection_status}</td>
                          <td className="px-3 py-2 text-slate-600">{row.owner_user_id || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{row.tenant_id}</td>
                          <td className="px-3 py-2 text-slate-500">{formatDate(row.last_sync_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'client_progress' && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left">Tenant</th>
                      <th className="px-3 py-2 text-left">User</th>
                      <th className="px-3 py-2 text-left">Tier</th>
                      <th className="px-3 py-2 text-left">Stage</th>
                      <th className="px-3 py-2 text-left">Level</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessRows.length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-4 text-slate-500">No trading access data yet.</td></tr>
                    ) : (
                      accessRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-600">{tenantMap.get(row.tenant_id) || row.tenant_id}</td>
                          <td className="px-3 py-2 text-slate-600">{row.user_id}</td>
                          <td className="px-3 py-2 text-slate-600">{row.trading_access_tier || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{row.trading_stage || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{row.trading_level ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{row.access_status || '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{formatDate(row.updated_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
