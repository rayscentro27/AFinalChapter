import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authFetchJson, resolveInternalAccess } from './adminAccess';

export type ExpansionRecommendation = {
  id: string;
  title: string;
  summary: string;
  category: 'source' | 'domain' | 'product' | 'service';
  domain: string;
  confidence: string;
  rationale: string;
};

export type ExpansionInput = {
  id: string;
  label: string;
  category: string;
  count: number;
  helper: string;
};

type ExpansionDashboard = {
  recommendedSources: ExpansionRecommendation[];
  newDomains: ExpansionRecommendation[];
  newProducts: ExpansionRecommendation[];
  newServices: ExpansionRecommendation[];
  inputs: ExpansionInput[];
  generatedAt: string;
};

type ExpansionResponse = {
  ok?: boolean;
  error?: string;
  recommended_sources?: unknown;
  sources?: unknown;
  new_domains?: unknown;
  domains?: unknown;
  new_products?: unknown;
  products?: unknown;
  new_services?: unknown;
  services?: unknown;
  inputs?: unknown;
  input_signals?: unknown;
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

function normalizeRecommendation(input: unknown, index: number, category: ExpansionRecommendation['category']): ExpansionRecommendation | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const meta = (record.meta || record.metadata || {}) as Record<string, unknown>;
  return {
    id: asString(record.id, `${category}-${index}`),
    title: asString(record.title || record.label || record.name, 'Recommendation'),
    summary: asString(record.summary || record.description || record.notes),
    category,
    domain: asString(record.domain || record.target_domain || record.niche || meta.domain, 'unassigned'),
    confidence: asString(record.confidence_label || record.confidence_band || record.confidence || meta.confidence, 'unscored'),
    rationale: asString(record.rationale || record.reason || meta.rationale),
  };
}

function normalizeInput(input: unknown, index: number): ExpansionInput | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  return {
    id: asString(record.id, `input-${index}`),
    label: asString(record.label || record.name, 'Input'),
    category: asString(record.category || record.type, 'input'),
    count: asNumber(record.count || record.total || record.value, 0),
    helper: asString(record.helper || record.description || record.notes, ''),
  };
}

export function useAutonomousExpansion() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [hours, setHours] = useState(72);
  const [limit, setLimit] = useState(8);
  const [dashboard, setDashboard] = useState<ExpansionDashboard>({
    recommendedSources: [],
    newDomains: [],
    newProducts: [],
    newServices: [],
    inputs: [],
    generatedAt: '',
  });

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
      const body = await authFetchJson<ExpansionResponse>(`/.netlify/functions/admin-autonomous-expansion?${params.toString()}`);

      setDashboard({
        recommendedSources: asArray(body.recommended_sources || body.sources)
          .map((entry, index) => normalizeRecommendation(entry, index, 'source'))
          .filter((entry): entry is ExpansionRecommendation => Boolean(entry)),
        newDomains: asArray(body.new_domains || body.domains)
          .map((entry, index) => normalizeRecommendation(entry, index, 'domain'))
          .filter((entry): entry is ExpansionRecommendation => Boolean(entry)),
        newProducts: asArray(body.new_products || body.products)
          .map((entry, index) => normalizeRecommendation(entry, index, 'product'))
          .filter((entry): entry is ExpansionRecommendation => Boolean(entry)),
        newServices: asArray(body.new_services || body.services)
          .map((entry, index) => normalizeRecommendation(entry, index, 'service'))
          .filter((entry): entry is ExpansionRecommendation => Boolean(entry)),
        inputs: asArray(body.inputs || body.input_signals)
          .map((entry, index) => normalizeInput(entry, index))
          .filter((entry): entry is ExpansionInput => Boolean(entry)),
        generatedAt: asString(body.generated_at || body.timestamp),
      });
    } catch (refreshError: any) {
      setError(String(refreshError?.message || 'Unable to load autonomous expansion.'));
      setDashboard({ recommendedSources: [], newDomains: [], newProducts: [], newServices: [], inputs: [], generatedAt: '' });
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