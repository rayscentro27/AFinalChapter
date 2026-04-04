import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

type HermesQueueRow = {
  id: string;
  status: string | null;
  created_at: string | null;
};

type HermesReviewRow = {
  id: string;
  domain: string | null;
  entity_type: string | null;
  review_type: string | null;
  review_score: number | null;
  created_at: string | null;
};

type FounderSummaryRow = {
  id: string;
  period_start: string;
  period_end: string;
  summary_type: string;
  headline: string;
  summary: string;
  wins_json: any[];
  losses_json: any[];
  recommended_actions_json: any[];
};

type StrategyCandidateRow = {
  id: string;
  asset_class: string | null;
  status: string | null;
  created_at: string | null;
};

const INTERNAL_ROLES = new Set(['admin', 'supervisor']);

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '—';
  return date.toLocaleString();
}

export default function AdminHermesPage() {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [queueRows, setQueueRows] = useState<HermesQueueRow[]>([]);
  const [reviewRows, setReviewRows] = useState<HermesReviewRow[]>([]);
  const [summary, setSummary] = useState<FounderSummaryRow | null>(null);
  const [candidateRows, setCandidateRows] = useState<StrategyCandidateRow[]>([]);

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

    async function load() {
      if (!authorized) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const [queueRes, reviewRes, summaryRes, candidatesRes] = await Promise.all([
          supabase
            .from('hermes_review_queue')
            .select('id,status,created_at')
            .order('created_at', { ascending: false })
            .limit(120),
          supabase
            .from('hermes_reviews')
            .select('id,domain,entity_type,review_type,review_score,created_at')
            .order('created_at', { ascending: false })
            .limit(12),
          supabase
            .from('founder_trading_summaries')
            .select('id,period_start,period_end,summary_type,headline,summary,wins_json,losses_json,recommended_actions_json')
            .order('period_end', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('strategy_candidates')
            .select('id,asset_class,status,created_at')
            .order('created_at', { ascending: false })
            .limit(200),
        ]);

        if (!active) return;

        if (queueRes.error) throw new Error(queueRes.error.message);
        if (reviewRes.error) throw new Error(reviewRes.error.message);
        if (summaryRes.error) throw new Error(summaryRes.error.message);
        if (candidatesRes.error) throw new Error(candidatesRes.error.message);

        setQueueRows((queueRes.data || []) as HermesQueueRow[]);
        setReviewRows((reviewRes.data || []) as HermesReviewRow[]);
        setSummary((summaryRes.data || null) as FounderSummaryRow | null);
        setCandidateRows((candidatesRes.data || []) as StrategyCandidateRow[]);
      } catch (e: any) {
        if (active) setError(String(e?.message || 'Unable to load Hermes data.'));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [authorized]);

  const queueStats = useMemo(() => {
    const stats = { total: 0, pending: 0, processing: 0, done: 0, failed: 0 };
    queueRows.forEach((row) => {
      stats.total += 1;
      const status = String(row.status || '').toLowerCase();
      if (status === 'pending') stats.pending += 1;
      else if (status === 'processing' || status === 'in_progress') stats.processing += 1;
      else if (status === 'completed' || status === 'done') stats.done += 1;
      else if (status === 'failed') stats.failed += 1;
    });
    return stats;
  }, [queueRows]);

  const momentumByAsset = useMemo(() => {
    const counts = new Map<string, number>();
    candidateRows.forEach((row) => {
      const asset = String(row.asset_class || 'Unknown');
      counts.set(asset, (counts.get(asset) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([asset, count]) => ({ asset, count }));
  }, [candidateRows]);

  if (checking) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-400">Verifying Hermes access...</div>;
  }

  if (!authorized) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-6 text-slate-700">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Restricted</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Internal Hermes access required</h1>
          <p className="mt-2 text-sm text-slate-600">This surface is reserved for super admins and internal operators.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-400">Loading Hermes control surface...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <header className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Hermes Control</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Hermes review command</h1>
        <p className="mt-2 text-sm text-slate-600">Internal visibility into review queue health, latest Hermes outputs, and strategy momentum.</p>
      </header>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Queue Pending</p>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{queueStats.pending}</div>
          <p className="mt-1 text-xs text-slate-500">Pending Hermes reviews</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Processing</p>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{queueStats.processing}</div>
          <p className="mt-1 text-xs text-slate-500">Currently in review</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Completed</p>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{queueStats.done}</div>
          <p className="mt-1 text-xs text-slate-500">Recently completed reviews</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Queue Total</p>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{queueStats.total}</div>
          <p className="mt-1 text-xs text-slate-500">Last 120 queue events</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Founder Summary</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">{summary?.headline || 'No founder summary yet'}</h2>
          <p className="mt-2 text-sm text-slate-600">{summary?.summary || 'Hermes has not published a founder trading summary yet.'}</p>
          <div className="mt-4 grid gap-2 text-xs text-slate-500">
            <div>Period: {summary ? `${formatDate(summary.period_start)} → ${formatDate(summary.period_end)}` : '—'}</div>
            <div>Summary type: {summary?.summary_type || '—'}</div>
          </div>
        </div>
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Strategy Momentum</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Top asset focus</h2>
          <div className="mt-4 space-y-3">
            {momentumByAsset.length === 0 ? (
              <div className="text-sm text-slate-500">No strategy candidates yet.</div>
            ) : (
              momentumByAsset.map((row) => (
                <div key={row.asset} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-800">{row.asset}</span>
                  <span className="text-slate-500">{row.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Latest Hermes Reviews</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">Recent output snapshots</h2>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          {reviewRows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No Hermes reviews yet.</div>
          ) : (
            reviewRows.map((row) => (
              <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{row.review_type || 'Review'}</div>
                    <div className="text-xs text-slate-500">{row.domain || 'domain'} • {row.entity_type || 'entity'} • {formatDate(row.created_at)}</div>
                  </div>
                  <div className="text-sm font-semibold text-slate-700">{row.review_score ?? '—'}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
