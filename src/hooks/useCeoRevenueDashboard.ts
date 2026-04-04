import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { CommissionEventRow } from '../services/commissionLedgerService';
import { resolveInternalAccess } from './adminAccess';

type FunnelMetricRow = {
  tenant_id: string;
  day: string;
  visitors: number;
  leads: number;
  optins: number;
  signups: number;
  upgrades_growth: number;
  upgrades_premium: number;
  outcomes_approved: number;
};

type FundingOutcomeAdminRow = {
  id: string;
  tenant_id: string;
  outcome_status: string | null;
  approved_amount_cents: number | null;
  created_at: string;
  approval_date: string | null;
};

type AuditEventRow = {
  actor_user_id: string | null;
  action: string | null;
  occurred_at: string;
};

type SummaryMetric = {
  label: string;
  value: number;
  helper: string;
  tone?: 'default' | 'success' | 'warning';
};

type PipelineStage = {
  label: string;
  count: number;
  commissionCents: number;
  approvedCents: number;
  helper: string;
};

type ReferralPerformance = {
  promptsShown: number;
  linksCopied: number;
  copyThroughRate: number;
  projectedCommissionCents: number;
  realizedCommissionCents: number;
  helper: string;
};

type RetentionStage = {
  key: string;
  label: string;
  count: number;
};

type DropOffInsight = {
  label: string;
  fromCount: number;
  toCount: number;
  dropPercent: number;
  helper: string;
};

export type CeoRevenueDashboardSnapshot = {
  summary: SummaryMetric[];
  pipeline: PipelineStage[];
  referral: ReferralPerformance;
  retentionFunnel: RetentionStage[];
  dropOffInsights: DropOffInsight[];
  dependencyNotes: string[];
  generatedAt: string;
};

const RETENTION_STAGES: Array<{ key: string; label: string }> = [
  { key: 'first_login', label: 'First Login' },
  { key: 'credit_report_uploaded', label: 'Credit Upload' },
  { key: 'analysis_viewed', label: 'Analysis Viewed' },
  { key: 'funding_strategy_viewed', label: 'Funding Strategy' },
  { key: 'funding_readiness_viewed', label: 'Readiness Viewed' },
  { key: 'application_started', label: 'Application Started' },
  { key: 'application_outcome_logged', label: 'Outcome Logged' },
  { key: 'trading_academy_unlocked', label: 'Trading Unlocked' },
  { key: 'referral_link_copied', label: 'Referral Link Copied' },
];

function cents(value: number | null | undefined) {
  return Number(value || 0);
}

function daysFromHours(hours: number) {
  return Math.max(1, Math.ceil(hours / 24));
}

function uniqueActors(rows: AuditEventRow[], action: string) {
  return new Set(
    rows
      .filter((row) => String(row.action || '') === action)
      .map((row) => String(row.actor_user_id || 'anon'))
  ).size;
}

export function useCeoRevenueDashboard(hours: number) {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<CeoRevenueDashboardSnapshot | null>(null);

  useEffect(() => {
    let active = true;

    async function boot() {
      const authorized = await resolveInternalAccess(user?.id, user?.role);
      if (!active) return;
      setIsAuthorized(authorized);
      setCheckingAccess(false);
      if (!authorized) setLoading(false);
    }

    void boot();
    return () => {
      active = false;
    };
  }, [user?.id, user?.role]);

  async function refresh() {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }

    try {
      setRefreshing(true);
      setLoading(true);
      setError('');

      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const sinceDay = new Date(Date.now() - daysFromHours(hours) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const [commissionRes, outcomesRes, auditRes, funnelRes] = await Promise.all([
        supabase
          .from('commission_events')
          .select('id,tenant_id,user_id,funding_outcome_id,commission_rate_bps,base_amount_cents,commission_amount_cents,status,invoice_provider,invoice_id,due_date,paid_at,created_at,updated_at,funding_outcomes(provider_name,product_type,outcome_status,approved_amount_cents,approval_date,client_file_id)')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase
          .from('funding_outcomes')
          .select('id,tenant_id,outcome_status,approved_amount_cents,created_at,approval_date')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase
          .from('audit_events')
          .select('actor_user_id,action,occurred_at')
          .eq('entity_type', 'client_journey')
          .gte('occurred_at', since)
          .in('action', RETENTION_STAGES.map((stage) => stage.key).concat(['referral_prompt_shown']))
          .order('occurred_at', { ascending: false })
          .limit(5000),
        supabase
          .from('funnel_metrics_daily')
          .select('tenant_id,day,visitors,leads,optins,signups,upgrades_growth,upgrades_premium,outcomes_approved')
          .gte('day', sinceDay)
          .order('day', { ascending: false })
          .limit(5000),
      ]);

      if (commissionRes.error) throw new Error(commissionRes.error.message || 'Unable to load commission events.');
      if (outcomesRes.error) throw new Error(outcomesRes.error.message || 'Unable to load funding outcomes.');
      if (auditRes.error) throw new Error(auditRes.error.message || 'Unable to load journey retention events.');
      if (funnelRes.error) throw new Error(funnelRes.error.message || 'Unable to load funnel metrics.');

      const commissionRows = (commissionRes.data || []) as CommissionEventRow[];
      const fundingOutcomeRows = (outcomesRes.data || []) as FundingOutcomeAdminRow[];
      const auditRows = (auditRes.data || []) as AuditEventRow[];
      const funnelRows = (funnelRes.data || []) as FunnelMetricRow[];

      const projectedFundingCommissionCents = commissionRows
        .filter((row) => row.status === 'estimated' || row.status === 'invoiced')
        .reduce((sum, row) => sum + cents(row.commission_amount_cents), 0);
      const realizedFundingCommissionCents = commissionRows
        .filter((row) => row.status === 'paid')
        .reduce((sum, row) => sum + cents(row.commission_amount_cents), 0);

      const approvedOutcomeCents = fundingOutcomeRows
        .filter((row) => String(row.outcome_status || '').toLowerCase() === 'approved')
        .reduce((sum, row) => sum + cents(row.approved_amount_cents), 0);

      const pipeline: PipelineStage[] = [
        {
          label: 'Estimated',
          count: commissionRows.filter((row) => row.status === 'estimated').length,
          commissionCents: commissionRows.filter((row) => row.status === 'estimated').reduce((sum, row) => sum + cents(row.commission_amount_cents), 0),
          approvedCents: commissionRows
            .filter((row) => row.status === 'estimated')
            .reduce((sum, row) => sum + cents(row.funding_outcomes?.approved_amount_cents), 0),
          helper: 'Projected commission from approved outcomes still in estimate stage.',
        },
        {
          label: 'Invoiced',
          count: commissionRows.filter((row) => row.status === 'invoiced').length,
          commissionCents: commissionRows.filter((row) => row.status === 'invoiced').reduce((sum, row) => sum + cents(row.commission_amount_cents), 0),
          approvedCents: commissionRows
            .filter((row) => row.status === 'invoiced')
            .reduce((sum, row) => sum + cents(row.funding_outcomes?.approved_amount_cents), 0),
          helper: 'Commission moved into billing but not yet realized.',
        },
        {
          label: 'Paid',
          count: commissionRows.filter((row) => row.status === 'paid').length,
          commissionCents: commissionRows.filter((row) => row.status === 'paid').reduce((sum, row) => sum + cents(row.commission_amount_cents), 0),
          approvedCents: commissionRows
            .filter((row) => row.status === 'paid')
            .reduce((sum, row) => sum + cents(row.funding_outcomes?.approved_amount_cents), 0),
          helper: 'Realized commission already marked paid.',
        },
        {
          label: 'Waived / Disputed',
          count: commissionRows.filter((row) => row.status === 'waived' || row.status === 'disputed').length,
          commissionCents: commissionRows
            .filter((row) => row.status === 'waived' || row.status === 'disputed')
            .reduce((sum, row) => sum + cents(row.commission_amount_cents), 0),
          approvedCents: commissionRows
            .filter((row) => row.status === 'waived' || row.status === 'disputed')
            .reduce((sum, row) => sum + cents(row.funding_outcomes?.approved_amount_cents), 0),
          helper: 'Revenue pressure that needs founder review.',
        },
      ];

      const retentionFunnel: RetentionStage[] = RETENTION_STAGES.map((stage) => ({
        key: stage.key,
        label: stage.label,
        count: uniqueActors(auditRows, stage.key),
      }));

      const dropOffInsights: DropOffInsight[] = retentionFunnel
        .slice(0, -1)
        .map((stage, index) => {
          const next = retentionFunnel[index + 1];
          const dropPercent = stage.count > 0 ? Math.round(((stage.count - next.count) / stage.count) * 100) : 0;
          return {
            label: `${stage.label} -> ${next.label}`,
            fromCount: stage.count,
            toCount: next.count,
            dropPercent: Math.max(0, dropPercent),
            helper: stage.count > 0
              ? `${Math.max(stage.count - next.count, 0)} users did not advance to ${next.label.toLowerCase()} in this window.`
              : 'No users reached the upstream stage in this window.',
          };
        })
        .sort((a, b) => b.dropPercent - a.dropPercent)
        .slice(0, 4);

      const promptsShown = uniqueActors(auditRows, 'referral_prompt_shown');
      const linksCopied = uniqueActors(auditRows, 'referral_link_copied');
      const copyThroughRate = promptsShown > 0 ? Math.round((linksCopied / promptsShown) * 100) : 0;
      const referral: ReferralPerformance = {
        promptsShown,
        linksCopied,
        copyThroughRate,
        projectedCommissionCents: 0,
        realizedCommissionCents: 0,
        helper: 'Referral prompts and copy actions are live. Commission projection stays gated until referral payouts have a first-party ledger.',
      };

      const funnelTotals = funnelRows.reduce(
        (acc, row) => {
          acc.visitors += Number(row.visitors || 0);
          acc.signups += Number(row.signups || 0);
          acc.outcomesApproved += Number(row.outcomes_approved || 0);
          return acc;
        },
        { visitors: 0, signups: 0, outcomesApproved: 0 }
      );

      const summary: SummaryMetric[] = [
        {
          label: 'Projected funding commission',
          value: projectedFundingCommissionCents,
          helper: 'Estimated + invoiced commission still moving through the revenue pipeline.',
          tone: 'warning',
        },
        {
          label: 'Realized funding commission',
          value: realizedFundingCommissionCents,
          helper: 'Commission already marked paid in the ledger.',
          tone: 'success',
        },
        {
          label: 'Projected referral commission',
          value: referral.projectedCommissionCents,
          helper: 'Placeholder until referral commissions move into a dedicated backend ledger.',
        },
        {
          label: 'Realized referral commission',
          value: referral.realizedCommissionCents,
          helper: 'Read-only placeholder until referral payout records exist.',
        },
        {
          label: 'Approved funding volume',
          value: approvedOutcomeCents,
          helper: 'Approved capital volume across recorded outcomes in this window.',
        },
        {
          label: 'Pipeline conversions',
          value: funnelTotals.outcomesApproved,
          helper: `${funnelTotals.signups} signups and ${funnelTotals.visitors} visitors were recorded in the funnel window.`,
        },
      ];

      const dependencyNotes = [
        'Funding commission values are grounded in commission_events and linked funding_outcomes.',
        'Retention funnel counts are grounded in audit_events written by the client journey milestones.',
        'Referral performance is currently grounded in referral prompt and copy events; commission values remain gated until a dedicated referral commission ledger exists.',
        'Funnel conversions are grounded in funnel_metrics_daily and shown read-only for founder visibility.',
      ];

      setSnapshot({
        summary,
        pipeline,
        referral,
        retentionFunnel,
        dropOffInsights,
        dependencyNotes,
        generatedAt: new Date().toISOString(),
      });
    } catch (refreshError: any) {
      setError(String(refreshError?.message || 'Unable to load founder revenue dashboard.'));
      setSnapshot(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!checkingAccess && isAuthorized) {
      void refresh();
    }
  }, [checkingAccess, isAuthorized, hours]);

  return useMemo(
    () => ({
      user,
      checkingAccess,
      isAuthorized,
      loading,
      refreshing,
      error,
      snapshot,
      refresh,
    }),
    [user, checkingAccess, isAuthorized, loading, refreshing, error, snapshot]
  );
}
