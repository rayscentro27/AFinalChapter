import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
  ReviewAction,
  ReviewDashboardData,
  ReviewItem,
  approveOrRejectReviewItem,
  expireReviewItem,
  fetchReviewDashboard,
  patchDashboardLifecycleItem,
  publishReviewItem,
  unpublishReviewItem,
} from '../services/adminReviewService';

type Tenant = { id: string; name: string };

const INTERNAL_REVIEW_ROLES = new Set(['admin', 'supervisor']);

function initialTenantFromQuery() {
  if (typeof window === 'undefined') return '';
  return String(new URLSearchParams(window.location.search || '').get('tenant_id') || '');
}

export function useReviewQueue() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionBusyId, setActionBusyId] = useState('');
  const [pendingAction, setPendingAction] = useState<ReviewAction | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(initialTenantFromQuery);
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
        setTenantId((current) => {
          if (current && next.some((tenant) => tenant.id === current)) return current;
          return next[0]?.id || '';
        });
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

  useEffect(() => {
    if (typeof window === 'undefined' || !tenantId) return;
    const params = new URLSearchParams(window.location.search || '');
    params.set('tenant_id', tenantId);
    const query = params.toString();
    window.history.replaceState({}, '', query ? `/admin/content-review?${query}` : '/admin/content-review');
  }, [tenantId]);

  async function decide(queueId: string, decision: 'approved' | 'rejected', notes?: string) {
    if (!tenantId || !queueId) return;
    setActionBusyId(queueId);
    setPendingAction(decision === 'approved' ? 'approve' : 'reject');
    setError('');
    setSuccess('');

    try {
      await approveOrRejectReviewItem({ tenantId, queueId, decision, notes });
      setSuccess(decision === 'approved' ? 'Review item approved.' : 'Review item rejected.');
      await refresh();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setActionBusyId('');
      setPendingAction(null);
    }
  }

  async function publish(item: ReviewItem, notes?: string) {
    if (!tenantId || !item.itemId || !item.targetType) return;
    setActionBusyId(item.id);
    setPendingAction('publish');
    setError('');
    setSuccess('');
    try {
      const mutation = await publishReviewItem({ tenantId, itemId: item.itemId, targetType: item.targetType, notes });
      setDashboard((current) => patchDashboardLifecycleItem(current, { item, mutation }));
      setSuccess(`${item.title} published.`);
      await refresh();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setActionBusyId('');
      setPendingAction(null);
    }
  }

  async function unpublish(item: ReviewItem, notes?: string) {
    if (!tenantId || !item.itemId || !item.targetType) return;
    setActionBusyId(item.id);
    setPendingAction('unpublish');
    setError('');
    setSuccess('');
    try {
      const mutation = await unpublishReviewItem({ tenantId, itemId: item.itemId, targetType: item.targetType, notes });
      setDashboard((current) => patchDashboardLifecycleItem(current, { item, mutation }));
      setSuccess(`${item.title} unpublished.`);
      await refresh();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setActionBusyId('');
      setPendingAction(null);
    }
  }

  async function expire(item: ReviewItem, notes?: string) {
    if (!tenantId || !item.itemId || !item.targetType) return;
    setActionBusyId(item.id);
    setPendingAction('expire');
    setError('');
    setSuccess('');
    try {
      const mutation = await expireReviewItem({ tenantId, itemId: item.itemId, targetType: item.targetType, notes });
      setDashboard((current) => patchDashboardLifecycleItem(current, { item, mutation }));
      setSuccess(`${item.title} expired.`);
      await refresh();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setActionBusyId('');
      setPendingAction(null);
    }
  }

  return {
    user,
    checkingAccess,
    isAuthorized,
    loading,
    refreshing,
    error,
    success,
    actionBusyId,
    pendingAction,
    tenants,
    tenantId,
    setTenantId,
    dashboard,
    refresh,
    decide,
    publish,
    unpublish,
    expire,
  };
}
