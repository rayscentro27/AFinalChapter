import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authFetchJson, resolveInternalAccess } from './adminAccess';

export type ExecutiveBriefing = {
  id: string;
  title: string;
  createdAt: string;
  summary: string;
  topUpdates: string[];
  blockers: string[];
  recommendedActions: string[];
  recommendations: string[];
  criticalAlerts: string[];
  urgency: string;
};

export type AgentSummaryHighlight = {
  id: string;
  agentName: string;
  headline: string;
  summary: string;
  status: string;
  createdAt: string;
  riskLevel: string;
};

type BriefingResponse = {
  ok?: boolean;
  error?: string;
  latest_briefing?: unknown;
  briefing?: unknown;
  executive_briefing?: unknown;
  briefings?: unknown;
  recent_agent_highlights?: unknown;
  agent_summary_highlights?: unknown;
  generated_at?: string;
};

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeStringList(value: unknown) {
  return asArray(value).map((entry) => {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      return asString(record.summary || record.label || record.title || record.message);
    }
    return '';
  }).filter(Boolean);
}

function normalizeBriefing(input: unknown): ExecutiveBriefing | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  return {
    id: asString(record.id, 'latest-briefing'),
    title: asString(record.title || record.headline, 'Latest executive briefing'),
    createdAt: asString(record.created_at || record.generated_at || record.createdAt),
    summary: asString(record.summary || record.brief || record.body),
    topUpdates: normalizeStringList(record.top_updates || record.updates),
    blockers: normalizeStringList(record.blockers),
    recommendedActions: normalizeStringList(record.recommended_actions || record.actions),
    recommendations: normalizeStringList(record.recommendations || record.recommended_actions || record.actions),
    criticalAlerts: normalizeStringList(record.critical_alerts || record.alerts),
    urgency: asString(record.urgency, 'normal'),
  };
}

function normalizeHighlight(input: unknown, index: number): AgentSummaryHighlight | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  return {
    id: asString(record.id, `highlight-${index}`),
    agentName: asString(record.agent_name || record.agent || record.employee, 'Unknown agent'),
    headline: asString(record.headline || record.title || record.summary, 'Agent update'),
    summary: asString(record.summary || record.final_answer || record.notes),
    status: asString(record.status || record.validation_status, 'unknown'),
    createdAt: asString(record.created_at || record.generated_at || record.createdAt),
    riskLevel: asString(record.risk_level || record.severity || record.priority, 'normal'),
  };
}

export function useCeoBriefingDashboard() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [hours, setHours] = useState(72);
  const [limit, setLimit] = useState(8);
  const [briefing, setBriefing] = useState<ExecutiveBriefing | null>(null);
  const [briefings, setBriefings] = useState<ExecutiveBriefing[]>([]);
  const [recentHighlights, setRecentHighlights] = useState<AgentSummaryHighlight[]>([]);
  const [generatedAt, setGeneratedAt] = useState('');

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
      const body = await authFetchJson<BriefingResponse>(`/.netlify/functions/admin-ceo-briefing?${params.toString()}`);
      const nextBriefing = normalizeBriefing(body.latest_briefing || body.briefing || body.executive_briefing);
      const nextBriefings = asArray(body.briefings)
        .map((entry) => normalizeBriefing(entry))
        .filter((entry): entry is ExecutiveBriefing => Boolean(entry));
      const nextHighlights = asArray(body.recent_agent_highlights || body.agent_summary_highlights)
        .map((entry, index) => normalizeHighlight(entry, index))
        .filter((entry): entry is AgentSummaryHighlight => Boolean(entry));

      setBriefing(nextBriefing);
      setBriefings(nextBriefings);
      setRecentHighlights(nextHighlights);
      setGeneratedAt(asString(body.generated_at));
    } catch (refreshError: any) {
      setError(String(refreshError?.message || 'Unable to load CEO briefing dashboard.'));
      setBriefing(null);
      setBriefings([]);
      setRecentHighlights([]);
      setGeneratedAt('');
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
    briefing,
    briefings,
    recentHighlights,
    generatedAt,
    refresh,
  }), [user, checkingAccess, isAuthorized, loading, refreshing, error, hours, limit, briefing, briefings, recentHighlights, generatedAt]);
}