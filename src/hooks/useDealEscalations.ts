import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import type { DealEscalationItem, DealEscalationRule, SnapshotHistoryPoint } from './useExecutiveMetrics';

const INTERNAL_ROLES = new Set(['admin', 'supervisor']);

type TenantOption = {
  id: string;
  name: string;
};

type EscalationResponse = {
  ok?: boolean;
  error?: string;
  summary?: {
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
  rules?: DealEscalationRule[];
  items?: DealEscalationItem[];
  history?: {
    escalated?: SnapshotHistoryPoint[];
    atRisk?: SnapshotHistoryPoint[];
    watch?: SnapshotHistoryPoint[];
    pendingReviews?: SnapshotHistoryPoint[];
  } | null;
  generated_at?: string;
  dependency_notes?: string[];
};

type EscalationHistory = {
  escalated: SnapshotHistoryPoint[];
  atRisk: SnapshotHistoryPoint[];
  watch: SnapshotHistoryPoint[];
  pendingReviews: SnapshotHistoryPoint[];
};

const EMPTY_HISTORY: EscalationHistory = {
  escalated: [],
  atRisk: [],
  watch: [],
  pendingReviews: [],
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

export function useDealEscalations() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState<TenantOption[]>([{ id: 'all', name: 'All clients' }]);
  const [tenantId, setTenantId] = useState('all');
  const [hours, setHours] = useState(24 * 14);
  const [summary, setSummary] = useState<EscalationResponse['summary'] | null>(null);
  const [rules, setRules] = useState<DealEscalationRule[]>([]);
  const [items, setItems] = useState<DealEscalationItem[]>([]);
  const [history, setHistory] = useState<EscalationHistory>(EMPTY_HISTORY);
  const [generatedAt, setGeneratedAt] = useState('');
  const [dependencyNotes, setDependencyNotes] = useState<string[]>([]);

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
      params.set('limit', '200');
      if (tenantId && tenantId !== 'all') params.set('tenant_id', tenantId);

      const response = await fetch(`/.netlify/functions/admin-deal-escalations?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json().catch(() => ({}))) as EscalationResponse;
      if (!response.ok) {
        throw new Error(String(body?.error || `Deal escalations failed (${response.status})`));
      }

      setSummary(body.summary || null);
      setRules(Array.isArray(body.rules) ? body.rules : []);
      setItems(Array.isArray(body.items) ? body.items : []);
      setHistory({
        escalated: Array.isArray(body.history?.escalated) ? body.history!.escalated : [],
        atRisk: Array.isArray(body.history?.atRisk) ? body.history!.atRisk : [],
        watch: Array.isArray(body.history?.watch) ? body.history!.watch : [],
        pendingReviews: Array.isArray(body.history?.pendingReviews) ? body.history!.pendingReviews : [],
      });
      setGeneratedAt(String(body.generated_at || ''));
      setDependencyNotes(Array.isArray(body.dependency_notes) ? body.dependency_notes : []);
    } catch (refreshError: any) {
      setError(String(refreshError?.message || 'Unable to load deal escalations.'));
      setSummary(null);
      setRules([]);
      setItems([]);
      setHistory(EMPTY_HISTORY);
      setGeneratedAt('');
      setDependencyNotes([]);
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
      tenants,
      tenantId,
      setTenantId,
      hours,
      setHours,
      summary,
      rules,
      items,
      history,
      generatedAt,
      dependencyNotes,
      refresh,
    }),
    [user, checkingAccess, isAuthorized, loading, refreshing, error, tenants, tenantId, hours, summary, rules, items, history, generatedAt, dependencyNotes]
  );
}