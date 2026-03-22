import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = { id: string; name: string };

type StrategyRow = {
  id?: string;
  strategy_id?: string;
  asset_type?: string;
  symbol?: string;
  timeframe?: string;
  underlying_symbol?: string;
  structure_type?: string;
  win_rate?: number;
  profit_factor?: number;
  net_pnl?: number;
  approval_status?: string;
  rank?: number;
  created_at?: string;
};

type SignalRow = {
  id?: string;
  strategy_id?: string;
  asset_type?: string;
  symbol?: string;
  timeframe?: string;
  side?: string;
  confidence?: number;
  confidence_band?: string;
  summary?: string;
  rationale?: string;
  created_at?: string;
};

type QueueRow = {
  id?: string;
  proposal_id?: string;
  strategy_id?: string;
  symbol?: string;
  status?: string;
  decision?: string;
  approval_status?: string;
  priority?: number;
  requested_by?: string;
  created_at?: string;
};

type RiskDecisionRow = {
  id?: string;
  strategy_id?: string;
  symbol?: string;
  decision?: string;
  approval_status?: string;
  confidence_band?: string;
  risk_score?: number;
  risk_notes?: string;
  reviewer?: string;
  created_at?: string;
};

type ReplayRow = {
  id?: string;
  strategy_id?: string;
  symbol?: string;
  status?: string;
  decision?: string;
  approval_status?: string;
  trades_total?: number;
  win_rate?: number;
  net_pnl?: number;
  created_at?: string;
};

type DashboardPayload = {
  ok?: boolean;
  error?: string;
  metrics?: {
    approved_strategies?: number;
    approved_options?: number;
    approved_signals?: number;
    queue_pending?: number;
    risk_decisions?: number;
    replay_results?: number;
  };
  strategies?: StrategyRow[];
  options?: StrategyRow[];
  signals?: SignalRow[];
  queue?: QueueRow[];
  risk_decisions?: RiskDecisionRow[];
  replay_results?: ReplayRow[];
};

type QueueStatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

function fmtNum(value: number | undefined | null, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '-';
  return Number(value).toFixed(digits);
}

function fmtPct(value: number | undefined | null) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '-';
  const numeric = Number(value);
  const normalized = numeric <= 1 && numeric >= -1 ? numeric * 100 : numeric;
  return `${normalized.toFixed(1)}%`;
}

function fmtDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function metricCard(label: string, value: number | undefined, tone = 'slate') {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-slate-200 bg-white text-slate-900';

  return (
    <div className={`rounded-[1.75rem] border p-5 shadow-sm ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight">{Number(value || 0)}</p>
    </div>
  );
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in required');
  return token;
}

export default function AdminResearchApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusyId, setActionBusyId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [queueStatusFilter, setQueueStatusFilter] = useState<QueueStatusFilter>('pending');
  const [queueNotesDrafts, setQueueNotesDrafts] = useState<Record<string, string>>({});
  const [payload, setPayload] = useState<DashboardPayload>({});

  const strategyRows = payload.strategies || [];
  const optionRows = payload.options || [];
  const signalRows = payload.signals || [];
  const queueRows = payload.queue || [];
  const riskRows = payload.risk_decisions || [];
  const replayRows = payload.replay_results || [];

  const combinedStrategies = useMemo(() => [...strategyRows, ...optionRows], [strategyRows, optionRows]);
  const filteredQueueRows = useMemo(() => {
    return queueRows.filter((row) => {
      const status = String(row.status || '').toLowerCase();
      const approval = String(row.approval_status || '').toLowerCase();

      if (queueStatusFilter === 'all') return true;
      if (queueStatusFilter === 'pending') {
        return approval !== 'approved' && approval !== 'rejected' && status !== 'approved' && status !== 'rejected' && status !== 'resolved';
      }
      if (queueStatusFilter === 'approved') {
        return approval === 'approved' || status === 'approved';
      }
      if (queueStatusFilter === 'rejected') {
        return approval === 'rejected' || status === 'rejected';
      }
      return true;
    });
  }, [queueRows, queueStatusFilter]);

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      setError('');
      try {
        const { data: tenantRows, error: tenantErr } = await supabase
          .from('tenants')
          .select('id,name')
          .order('name', { ascending: true });

        if (tenantErr) throw tenantErr;
        if (!active) return;

        const next = (tenantRows || []) as Tenant[];
        setTenants(next);
        if (next.length > 0) setTenantId(next[0].id);
      } catch (e: any) {
        if (active) setError(String(e?.message || e));
      } finally {
        if (active) setLoading(false);
      }
    }

    void boot();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    void loadDashboard();
  }, [tenantId]);

  async function loadDashboard() {
    if (!tenantId) return;
    setRefreshing(true);
    setError('');
    setSuccess('');

    try {
      const token = await accessToken();
      const params = new URLSearchParams({ tenant_id: tenantId, limit: '12' });
      const response = await fetch(`/.netlify/functions/admin-research-approvals?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      const nextPayload = (await response.json().catch(() => ({}))) as DashboardPayload;
      if (!response.ok || nextPayload?.ok === false) {
        throw new Error(String(nextPayload?.error || `Approvals request failed (${response.status})`));
      }

      setPayload(nextPayload);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRefreshing(false);
    }
  }

  async function decideQueueRow(queueId: string, decision: 'approved' | 'rejected') {
    if (!tenantId || !queueId) return;
    setActionBusyId(queueId);
    setError('');
    setSuccess('');

    try {
      const token = await accessToken();
      const notes = String(queueNotesDrafts[queueId] || '').trim();
      const response = await fetch('/.netlify/functions/admin-research-queue-decide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenant_id: tenantId, queue_id: queueId, decision, notes: notes || undefined }),
      });

      const nextPayload = await response.json().catch(() => ({}));
      if (!response.ok || nextPayload?.ok === false) {
        throw new Error(String(nextPayload?.error || `Queue decision failed (${response.status})`));
      }

      setQueueNotesDrafts((current) => {
        const next = { ...current };
        delete next[queueId];
        return next;
      });
      setSuccess(decision === 'approved' ? 'Queue item approved.' : 'Queue item rejected.');
      await loadDashboard();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setActionBusyId('');
    }
  }

  function isQueuePending(row: QueueRow) {
    const status = String(row.status || '').toLowerCase();
    const approval = String(row.approval_status || '').toLowerCase();
    return approval !== 'approved' && approval !== 'rejected' && status !== 'approved' && status !== 'rejected' && status !== 'resolved';
  }

  function queueFilterLabel(value: QueueStatusFilter) {
    if (value === 'pending') return 'Pending';
    if (value === 'approved') return 'Approved';
    if (value === 'rejected') return 'Rejected';
    return 'All';
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-slate-300">Loading research approvals...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <div>
        <h1 className="text-2xl font-semibold text-white">Research Approvals</h1>
        <p className="text-sm text-slate-400 mt-1">Admin visibility into approved strategies, approved signals, queue pressure, and recent decision artifacts.</p>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.06)] grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Tenant</label>
          <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2 flex items-end">
          <button className="w-full rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void loadDashboard()} disabled={refreshing || !tenantId}>
            {refreshing ? 'Refreshing...' : 'Refresh Dashboard'}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {metricCard('Approved Strategies', payload.metrics?.approved_strategies, 'emerald')}
        {metricCard('Approved Options', payload.metrics?.approved_options, 'emerald')}
        {metricCard('Approved Signals', payload.metrics?.approved_signals, 'emerald')}
        {metricCard('Queue Pending', payload.metrics?.queue_pending, 'amber')}
        {metricCard('Risk Decisions', payload.metrics?.risk_decisions)}
        {metricCard('Replay Results', payload.metrics?.replay_results)}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Approved Strategy Library</h2>
            <span className="text-xs text-slate-500">{combinedStrategies.length} items</span>
          </div>
          <div className="mt-4 space-y-3 max-h-[34rem] overflow-y-auto pr-1">
            {combinedStrategies.length === 0 ? (
              <p className="text-sm text-slate-500">No approved strategies found for this tenant.</p>
            ) : combinedStrategies.map((row, index) => (
              <div key={`${row.id || row.strategy_id || index}`} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">{row.strategy_id || row.structure_type || 'Strategy'}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.asset_type === 'options' ? (row.underlying_symbol || row.symbol || '-') : (row.symbol || '-')} • {row.timeframe || row.structure_type || 'Not specified'}</p>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">Rank {row.rank || '-'}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                  <div><span className="text-slate-400">Win rate</span><p className="mt-1 font-black text-slate-900">{fmtPct(row.win_rate)}</p></div>
                  <div><span className="text-slate-400">Profit factor</span><p className="mt-1 font-black text-slate-900">{fmtNum(row.profit_factor)}</p></div>
                  <div><span className="text-slate-400">Net PnL</span><p className="mt-1 font-black text-slate-900">{fmtNum(row.net_pnl)}</p></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Approved Signal Feed</h2>
            <span className="text-xs text-slate-500">{signalRows.length} items</span>
          </div>
          <div className="mt-4 space-y-3 max-h-[34rem] overflow-y-auto pr-1">
            {signalRows.length === 0 ? (
              <p className="text-sm text-slate-500">No approved signals found for this tenant.</p>
            ) : signalRows.map((row, index) => (
              <div key={`${row.id || row.strategy_id || index}`} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">{row.strategy_id || `${String(row.side || 'signal').toUpperCase()} ${row.symbol || ''}`.trim()}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.symbol || '-'} • {row.timeframe || 'Not specified'} • {String(row.side || 'directional').toUpperCase()}</p>
                  </div>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">{row.confidence_band || 'Reviewed'}</span>
                </div>
                <p className="mt-3 text-sm text-slate-600">{row.summary || 'Approved signal available for educational review.'}</p>
                <p className="mt-2 text-xs text-slate-500">{row.rationale || 'No rationale provided.'}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Approval Queue</h2>
            <span className="text-xs text-slate-500">{filteredQueueRows.length} rows</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(['pending', 'approved', 'rejected', 'all'] as QueueStatusFilter[]).map((value) => (
              <button
                key={value}
                className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${queueStatusFilter === value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
                onClick={() => setQueueStatusFilter(value)}
              >
                {queueFilterLabel(value)}
              </button>
            ))}
          </div>
          <div className="mt-4 overflow-auto">
            <table className="min-w-full text-xs text-slate-700">
              <thead className="text-slate-400 uppercase tracking-wide">
                <tr>
                  <th className="text-left py-2 pr-3">Strategy</th>
                  <th className="text-left py-2 pr-3">Symbol</th>
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="text-left py-2 pr-3">Priority</th>
                  <th className="text-left py-2 pr-3">Requested</th>
                  <th className="text-left py-2 pr-3">Reviewer Notes</th>
                  <th className="text-left py-2 pr-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueueRows.map((row, index) => (
                  <tr key={`${row.id || index}`} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-medium">{row.strategy_id || '-'}</td>
                    <td className="py-2 pr-3">{row.symbol || '-'}</td>
                    <td className="py-2 pr-3">{row.status || row.approval_status || '-'}</td>
                    <td className="py-2 pr-3">{row.priority ?? '-'}</td>
                    <td className="py-2 pr-3">{fmtDate(row.created_at)}</td>
                    <td className="py-2 pr-3 min-w-[16rem]">
                      {isQueuePending(row) && row.id ? (
                        <textarea
                          className="min-h-[4.75rem] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                          placeholder="Optional reviewer note"
                          value={queueNotesDrafts[row.id] ?? row.notes ?? ''}
                          onChange={(event) => setQueueNotesDrafts((current) => ({ ...current, [row.id || '']: event.target.value }))}
                          disabled={Boolean(actionBusyId) || refreshing}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap text-slate-500">{row.notes || '-'}</p>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {isQueuePending(row) && row.id ? (
                        <div className="flex gap-2">
                          <button
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 disabled:opacity-50"
                            onClick={() => void decideQueueRow(row.id || '', 'approved')}
                            disabled={Boolean(actionBusyId) || refreshing}
                          >
                            {actionBusyId === row.id ? 'Saving...' : 'Approve'}
                          </button>
                          <button
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 disabled:opacity-50"
                            onClick={() => void decideQueueRow(row.id || '', 'rejected')}
                            disabled={Boolean(actionBusyId) || refreshing}
                          >
                            {actionBusyId === row.id ? 'Saving...' : 'Reject'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">Resolved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Risk Decisions</h2>
            <span className="text-xs text-slate-500">{riskRows.length} rows</span>
          </div>
          <div className="mt-4 overflow-auto">
            <table className="min-w-full text-xs text-slate-700">
              <thead className="text-slate-400 uppercase tracking-wide">
                <tr>
                  <th className="text-left py-2 pr-3">Strategy</th>
                  <th className="text-left py-2 pr-3">Decision</th>
                  <th className="text-left py-2 pr-3">Band</th>
                  <th className="text-left py-2 pr-3">Risk Score</th>
                  <th className="text-left py-2 pr-3">Reviewer</th>
                </tr>
              </thead>
              <tbody>
                {riskRows.map((row, index) => (
                  <tr key={`${row.id || index}`} className="border-t border-slate-100 align-top">
                    <td className="py-2 pr-3 font-medium">{row.strategy_id || row.symbol || '-'}</td>
                    <td className="py-2 pr-3">{row.decision || '-'}</td>
                    <td className="py-2 pr-3">{row.confidence_band || '-'}</td>
                    <td className="py-2 pr-3">{fmtNum(row.risk_score)}</td>
                    <td className="py-2 pr-3">{row.reviewer || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Recent Replay Results</h2>
          <span className="text-xs text-slate-500">{replayRows.length} rows</span>
        </div>
        <div className="mt-4 overflow-auto">
          <table className="min-w-full text-xs text-slate-700">
            <thead className="text-slate-400 uppercase tracking-wide">
              <tr>
                <th className="text-left py-2 pr-3">Strategy</th>
                <th className="text-left py-2 pr-3">Symbol</th>
                <th className="text-left py-2 pr-3">Trades</th>
                <th className="text-left py-2 pr-3">Win Rate</th>
                <th className="text-left py-2 pr-3">Net PnL</th>
                <th className="text-left py-2 pr-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {replayRows.map((row, index) => (
                <tr key={`${row.id || index}`} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-medium">{row.strategy_id || '-'}</td>
                  <td className="py-2 pr-3">{row.symbol || '-'}</td>
                  <td className="py-2 pr-3">{row.trades_total ?? '-'}</td>
                  <td className="py-2 pr-3">{fmtPct(row.win_rate)}</td>
                  <td className="py-2 pr-3">{fmtNum(row.net_pnl)}</td>
                  <td className="py-2 pr-3">{fmtDate(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-slate-500">Administrative visibility only. Strategies and signals remain educational and do not imply execution approval or guaranteed outcomes.</p>
      </section>
    </div>
  );
}