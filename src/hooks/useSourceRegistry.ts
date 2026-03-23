import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authFetchJson, resolveInternalAccess } from './adminAccess';

export type SourceRegistryRecord = {
  id: string;
  sourceType: string;
  url: string;
  label: string;
  domain: string;
  status: string;
  priority: number;
  createdAt: string;
  warnings: string[];
  active: boolean;
  scheduleStatus: string;
  lastRunAt: string;
  nextRunAt: string;
  lastRunStatus: string;
  paused: boolean;
  schedulePaused: boolean;
};

type SourceRegistryResponse = {
  ok?: boolean;
  error?: string;
  items?: unknown;
  sources?: unknown;
};

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeWarnings(value: unknown) {
  return asArray(value).map((entry) => asString(entry)).filter(Boolean);
}

export function normalizeSource(input: unknown, index: number): SourceRegistryRecord | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const url = asString(record.url || record.source_url);
  return {
    id: asString(record.id, `source-${index}`),
    sourceType: asString(record.source_type || record.type, 'unknown'),
    url,
    label: asString(record.label || record.name || record.title, url || 'Unnamed source'),
    domain: asString(record.domain || (() => {
      try {
        return url ? new URL(url).hostname : '';
      } catch {
        return '';
      }
    })()),
    status: asString(record.status, 'unknown'),
    priority: asNumber(record.priority, 0),
    createdAt: asString(record.created_at || record.createdAt),
    warnings: normalizeWarnings(record.warnings || record.validation_warnings || record.duplicate_warnings),
    active: Boolean(record.active ?? record.is_active ?? (asString(record.status).toLowerCase() !== 'inactive')),
    scheduleStatus: asString(record.schedule_status || record.scheduler_status || record.schedule?.status, 'unknown'),
    lastRunAt: asString(record.last_run_at || record.last_scanned_at || record.last_job_at),
    nextRunAt: asString(record.next_run_at || record.next_scheduled_at),
    lastRunStatus: asString(record.last_run_status || record.last_job_status || record.last_scan_status, 'unknown'),
    paused: Boolean(record.paused ?? record.is_paused ?? (asString(record.status).toLowerCase() === 'paused')),
    schedulePaused: Boolean(record.schedule_paused ?? record.scheduler_paused ?? (asString(record.schedule_status).toLowerCase() === 'paused')),
  };
}

export function useSourceRegistry() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => new URLSearchParams(window.location.search).get('status') || 'all');
  const [typeFilter, setTypeFilter] = useState(() => new URLSearchParams(window.location.search).get('type') || 'all');
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('query') || '');
  const [selectedSourceId, setSelectedSourceId] = useState(() => new URLSearchParams(window.location.search).get('source_id') || '');
  const [items, setItems] = useState<SourceRegistryRecord[]>([]);

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
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (search.trim()) params.set('query', search.trim());
      if (selectedSourceId) params.set('source_id', selectedSourceId);
      const body = await authFetchJson<SourceRegistryResponse>(`/.netlify/functions/admin-source-registry?${params.toString()}`);
      const nextItems = asArray(body.items || body.sources)
        .map((entry, index) => normalizeSource(entry, index))
        .filter((entry): entry is SourceRegistryRecord => Boolean(entry));
      setItems(nextItems);
      setSelectedSourceId((current) => (current && nextItems.some((item) => item.id === current) ? current : current ? '' : ''));
    } catch (refreshError: any) {
      setError(String(refreshError?.message || 'Unable to load source registry.'));
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const nextUrl = new URL(window.location.href);
    if (statusFilter !== 'all') nextUrl.searchParams.set('status', statusFilter);
    else nextUrl.searchParams.delete('status');
    if (typeFilter !== 'all') nextUrl.searchParams.set('type', typeFilter);
    else nextUrl.searchParams.delete('type');
    if (search.trim()) nextUrl.searchParams.set('query', search.trim());
    else nextUrl.searchParams.delete('query');
    if (selectedSourceId) nextUrl.searchParams.set('source_id', selectedSourceId);
    else nextUrl.searchParams.delete('source_id');
    window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`);
  }, [statusFilter, typeFilter, search, selectedSourceId]);

  async function addSource(payload: { source_type: string; url: string; label: string; priority: number }) {
    try {
      setSubmitting(true);
      setError('');
      await authFetchJson('/.netlify/functions/admin-source-registry', { method: 'POST', body: payload });
      await refresh();
      return true;
    } catch (actionError: any) {
      setError(String(actionError?.message || 'Unable to add source.'));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function runSourceAction(payload: { source_id: string; action: 'activate' | 'deactivate' | 'scan_now' | 'set_priority' | 'pause' | 'resume' | 'pause_schedule' | 'resume_schedule'; priority?: number }) {
    try {
      setSubmitting(true);
      setError('');
      await authFetchJson('/.netlify/functions/admin-source-registry', { method: 'PATCH', body: payload });
      await refresh();
      return true;
    } catch (actionError: any) {
      setError(String(actionError?.message || 'Unable to update source.'));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!checkingAccess && isAuthorized) {
      void refresh();
    }
  }, [checkingAccess, isAuthorized, statusFilter, typeFilter, search, selectedSourceId]);

  return useMemo(() => ({
    user,
    checkingAccess,
    isAuthorized,
    loading,
    refreshing,
    submitting,
    error,
    items,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    search,
    setSearch,
    selectedSourceId,
    setSelectedSourceId,
    refresh,
    addSource,
    runSourceAction,
  }), [user, checkingAccess, isAuthorized, loading, refreshing, submitting, error, items, statusFilter, typeFilter, search, selectedSourceId]);
}