import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';

const INTERNAL_ROLES = new Set(['admin', 'supervisor']);

export type ExecutiveMetric = {
  label: string;
  value: number;
  helper: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

export type DistributionRow = {
  label: string;
  count: number;
  helper: string;
};

export type AttentionRow = {
  label: string;
  count: number;
  helper: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

export type DealEscalationLevel = 'healthy' | 'watch' | 'at_risk' | 'escalated';

export type DealEscalationItem = {
  tenant_id: string;
  tenant_name: string;
  current_stage: string;
  readiness_status: string;
  escalation_level: DealEscalationLevel;
  stalled_stage: string;
  why_at_risk: string[];
  recommended_intervention: string;
  days_since_client_action: number | null;
  days_since_funding_step: number | null;
  overdue_credit_business_tasks: number;
  overdue_capital_tasks: number;
  overdue_optional_flow_tasks: number;
  ignored_conversations: number;
  pending_reviews: number;
  approved_outcome_cents: number;
  selected_path: string | null;
  last_client_action_at: string | null;
  last_funding_step_at: string | null;
};

export type DealEscalationRule = {
  key: string;
  label: string;
  watch_threshold: string;
  escalated_threshold: string;
  intervention: string;
};

export type OperationalPanel = {
  label: string;
  count: number;
  helper: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

export type SnapshotHistoryPoint = {
  bucketStartAt: string;
  label: string;
  value: number;
};

export type ExecutiveSnapshot = {
  overview: ExecutiveMetric[];
  stageDistribution: DistributionRow[];
  bottlenecks: AttentionRow[];
  commonBlockers: Array<{ label: string; count: number }>;
  capitalPath: AttentionRow[];
  tradingEngagement: AttentionRow[];
  grantEngagement: AttentionRow[];
  reviewWorkload: AttentionRow[];
  dependencyNotes: string[];
  totalClients: number;
  escalationSummary: {
    total_clients: number;
    healthy: number;
    watch: number;
    at_risk: number;
    escalated: number;
    overdue_credit_business_tasks: number;
    overdue_capital_tasks: number;
    stalled_optional_flows: number;
    pending_reviews: number;
  };
  atRiskClients: DealEscalationItem[];
  dealRules: DealEscalationRule[];
  systemHealth: OperationalPanel[];
  workerHealth: OperationalPanel[];
  businessImpact: OperationalPanel[];
  history: {
    escalated: SnapshotHistoryPoint[];
    atRisk: SnapshotHistoryPoint[];
    pendingReviews: SnapshotHistoryPoint[];
    openSystemIssues: SnapshotHistoryPoint[];
  };
  generatedAt: string;
};

type TenantOption = {
  id: string;
  name: string;
};

type CommandCenterResponse = {
  ok?: boolean;
  error?: string;
  snapshot?: ExecutiveSnapshot;
};

async function resolveInternalAccess(userId?: string, role?: string) {
  if (!userId) return false;
  const accessRes = await supabase.rpc('nexus_is_master_admin_compat');
  if (accessRes.error) {
    return INTERNAL_ROLES.has(String(role || '').toLowerCase());
  }
  return Boolean(accessRes.data) || INTERNAL_ROLES.has(String(role || '').toLowerCase());
}

async function authToken() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in required');
  return token;
}

async function loadTenants(): Promise<TenantOption[]> {
  const { data, error } = await supabase.from('tenants').select('id,name').order('name', { ascending: true });
  if (error) throw error;
  return [{ id: 'all', name: 'All clients' }, ...((data || []) as TenantOption[])];
}

export function useExecutiveMetrics() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<ExecutiveSnapshot | null>(null);
  const [tenants, setTenants] = useState<TenantOption[]>([{ id: 'all', name: 'All clients' }]);
  const [tenantId, setTenantId] = useState('all');
  const [hours, setHours] = useState(72);

  useEffect(() => {
    let active = true;

    async function boot() {
      const authorized = await resolveInternalAccess(user?.id, user?.role);
      if (!active) return;

      setIsAuthorized(authorized);
      setCheckingAccess(false);

      if (!authorized) {
        setLoading(false);
        return;
      }

      try {
        const tenantOptions = await loadTenants();
        if (!active) return;
        setTenants(tenantOptions);
      } catch (tenantError: any) {
        if (!active) return;
        setError(String(tenantError?.message || 'Unable to load tenants.'));
      }
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

      const token = await authToken();
      const params = new URLSearchParams();
      params.set('hours', String(hours));
      params.set('limit', '8');
      if (tenantId && tenantId !== 'all') params.set('tenant_id', tenantId);

      const response = await fetch(`/.netlify/functions/admin-command-center?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json().catch(() => ({}))) as CommandCenterResponse;
      if (!response.ok || !body?.snapshot) {
        throw new Error(String(body?.error || `Command center failed (${response.status})`));
      }

      setSnapshot(body.snapshot);
    } catch (refreshError: any) {
      setError(String(refreshError?.message || 'Unable to load executive command center.'));
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
  }, [checkingAccess, isAuthorized, tenantId, hours]);

  return useMemo(
    () => ({
      user,
      checkingAccess,
      isAuthorized,
      loading,
      refreshing,
      error,
      snapshot,
      tenants,
      tenantId,
      setTenantId,
      hours,
      setHours,
      refresh,
    }),
    [user, checkingAccess, isAuthorized, loading, refreshing, error, snapshot, tenants, tenantId, hours]
  );
}