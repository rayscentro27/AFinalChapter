import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authFetchJson, resolveInternalAccess } from './adminAccess';

export type MonetizationOpportunity = {
  id: string;
  title: string;
  opportunityType: string;
  domain: string;
  estimatedValue: number;
  confidence: string;
  sourceLabel: string;
  status: string;
  summary: string;
};

export type MonetizationInputSignal = {
  id: string;
  label: string;
  category: string;
  count: number;
  helper: string;
};

type MonetizationDashboard = {
  topOpportunities: MonetizationOpportunity[];
  inputSignals: MonetizationInputSignal[];
  generatedAt: string;
};

type MonetizationResponse = {
  ok?: boolean;
  error?: string;
  top_opportunities?: unknown;
  opportunities?: unknown;
  items?: unknown;
  monetization_opportunities?: unknown;
  signals?: unknown;
  input_signals?: unknown;
  inputs?: unknown;
  generated_at?: string;
  timestamp?: string;
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

function formatMoney(input: unknown) {
  const direct = asNumber(input, Number.NaN);
  if (Number.isFinite(direct)) return direct;
  if (typeof input === 'string') {
    const cleaned = Number(String(input).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(cleaned) ? cleaned : 0;
  }
  return 0;
}

function titleFromType(type: string) {
  const normalized = String(type || '').trim();
  if (!normalized) return 'Opportunity';
  return normalized.split(/[_\-\s]+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function normalizeOpportunity(input: unknown, index: number): MonetizationOpportunity | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const meta = (record.meta || record.metadata || {}) as Record<string, unknown>;
  const type = asString(record.opportunity_type || record.type || record.category || meta.opportunity_type, 'unknown');
  return {
    id: asString(record.id, `opportunity-${index}`),
    title: asString(record.title || record.name || record.opportunity_title, titleFromType(type)),
    opportunityType: type,
    domain: asString(record.domain || record.niche || record.category || meta.domain, 'unassigned'),
    estimatedValue: formatMoney(record.estimated_value || record.value || record.estimated_revenue || meta.estimated_value),
    confidence: asString(record.confidence_label || record.confidence_band || record.confidence || meta.confidence, 'unscored'),
    sourceLabel: asString(record.source_label || record.source_table || record.source || meta.source, 'cross_domain_insights'),
    status: asString(record.status || meta.status, 'open'),
    summary: asString(record.summary || record.rationale || record.notes || meta.summary),
  };
}

function normalizeSignal(input: unknown, index: number): MonetizationInputSignal | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  return {
    id: asString(record.id, `signal-${index}`),
    label: asString(record.label || record.name || record.source, 'Signal'),
    category: asString(record.category || record.type || record.signal_type, 'input'),
    count: asNumber(record.count || record.total || record.value, 0),
    helper: asString(record.helper || record.description || record.notes, ''),
  };
}

export function useMonetizationOpportunities() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [hours, setHours] = useState(72);
  const [limit, setLimit] = useState(10);
  const [dashboard, setDashboard] = useState<MonetizationDashboard>({ topOpportunities: [], inputSignals: [], generatedAt: '' });

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
      params.set('hours', String(hours));
      params.set('limit', String(limit));
      const body = await authFetchJson<MonetizationResponse>(`/.netlify/functions/admin-monetization-opportunities?${params.toString()}`);

      const topOpportunities = asArray(body.top_opportunities || body.opportunities || body.items || body.monetization_opportunities)
        .map((entry, index) => normalizeOpportunity(entry, index))
        .filter((entry): entry is MonetizationOpportunity => Boolean(entry));
      const inputSignals = asArray(body.signals || body.input_signals || body.inputs)
        .map((entry, index) => normalizeSignal(entry, index))
        .filter((entry): entry is MonetizationInputSignal => Boolean(entry));

      setDashboard({
        topOpportunities,
        inputSignals,
        generatedAt: asString(body.generated_at || body.timestamp),
      });
    } catch (refreshError: any) {
      setError(String(refreshError?.message || 'Unable to load monetization opportunities.'));
      setDashboard({ topOpportunities: [], inputSignals: [], generatedAt: '' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!checkingAccess && isAuthorized) {
      void refresh();
    }
  }, [checkingAccess, isAuthorized, hours, limit]);

  return useMemo(() => ({
    user,
    checkingAccess,
    isAuthorized,
    loading,
    refreshing,
    error,
    hours,
    setHours,
    limit,
    setLimit,
    dashboard,
    refresh,
  }), [user, checkingAccess, isAuthorized, loading, refreshing, error, hours, limit, dashboard]);
}