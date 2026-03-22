import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { fetchReviewDashboard, ReviewDashboardData } from '../services/adminReviewService';
import { buildReviewAnalyticsSnapshot } from '../services/reviewAnalyticsService';
import { useFreshnessSummary } from './useFreshnessSummary';

type Tenant = { id: string; name: string };

const INTERNAL_REVIEW_ROLES = new Set(['admin', 'supervisor']);

export function useReviewAnalytics() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [dashboard, setDashboard] = useState<ReviewDashboardData>({ tenantId: '', metrics: [], items: [] });

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      if (!user?.id) {
        if (!active) return;
        setIsAuthorized(false);
        setCheckingAccess(false);
        return;
      }

      setCheckingAccess(true);
      const accessRes = await supabase.rpc('nexus_is_master_admin_compat');
      if (!active) return;

      if (accessRes.error) {
        setIsAuthorized(INTERNAL_REVIEW_ROLES.has(String(user.role || '').toLowerCase()));
      } else {
        setIsAuthorized(Boolean(accessRes.data) || INTERNAL_REVIEW_ROLES.has(String(user.role || '').toLowerCase()));
      }

      setCheckingAccess(false);
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    let active = true;

    async function loadTenants() {
      if (!isAuthorized) {
        setTenants([]);
        setTenantId('');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const { data, error: tenantErr } = await supabase
          .from('tenants')
          .select('id,name')
          .order('name', { ascending: true });

        if (tenantErr) throw tenantErr;
        if (!active) return;

        const next = (data || []) as Tenant[];
        setTenants(next);
        setTenantId((current) => current || next[0]?.id || '');
      } catch (e: any) {
        if (!active) return;
        setError(String(e?.message || e));
      } finally {
        if (active) setLoading(false);
      }
    }

    if (!checkingAccess) {
      void loadTenants();
    }

    return () => {
      active = false;
    };
  }, [checkingAccess, isAuthorized]);

  async function refresh() {
    if (!tenantId || !isAuthorized) return;
    setRefreshing(true);
    setError('');

    try {
      const next = await fetchReviewDashboard(tenantId);
      setDashboard(next);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!tenantId || !isAuthorized) return;
    void refresh();
  }, [tenantId, isAuthorized]);

  const freshness = useFreshnessSummary(dashboard.items);
  const analytics = useMemo(() => buildReviewAnalyticsSnapshot(dashboard, freshness), [dashboard, freshness]);

  return {
    user,
    checkingAccess,
    isAuthorized,
    loading,
    refreshing,
    error,
    tenants,
    tenantId,
    setTenantId,
    dashboard,
    analytics,
    refresh,
  };
}