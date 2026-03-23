import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authFetchJson, resolveInternalAccess } from './adminAccess';

export type CommandInboxListItem = {
  id: string;
  rawCommand: string;
  commandType: string;
  status: string;
  queueStatus: string;
  createdAt: string;
  approvalRequired: boolean;
  approvalStatus: string;
  executionOutcome: string;
};

export type RelatedSource = {
  id: string;
  label: string;
  url: string;
  status: string;
};

export type RelatedAgentSummary = {
  id: string;
  agentName: string;
  headline: string;
  completedAt: string;
  status: string;
};

export type QueueStatusEvent = {
  id: string;
  label: string;
  status: string;
  createdAt: string;
  detail: string;
};

export type CommandInboxDetail = {
  id: string;
  rawCommand: string;
  parsedIntentLabel: string;
  validationStatus: string;
  queueStatus: string;
  createdAt: string;
  approvalRequired: boolean;
  approvalStatus: string;
  queueHandoffState: string;
  executionOutcome: string;
  executionSummary: string;
  relatedSource: RelatedSource | null;
  relatedAgentSummaries: RelatedAgentSummary[];
  timeline: QueueStatusEvent[];
};

type CommandInboxResponse = {
  ok?: boolean;
  error?: string;
  items?: unknown;
  selected?: unknown;
  detail?: unknown;
};

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeListItem(input: unknown, index: number): CommandInboxListItem | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  return {
    id: asString(record.id, `command-inbox-${index}`),
    rawCommand: asString(record.raw_command || record.command || record.prompt),
    commandType: asString(record.command_type || record.type, 'unknown'),
    status: asString(record.status, 'unknown'),
    queueStatus: asString(record.queue_status || record.job_status || record.execution_status, 'unqueued'),
    createdAt: asString(record.created_at || record.submitted_at),
    approvalRequired: Boolean(record.approval_required ?? record.requires_approval ?? record.high_risk),
    approvalStatus: asString(record.approval_status || record.approval?.status, 'not_requested'),
    executionOutcome: asString(record.execution_outcome || record.outcome || record.execution_status, 'unknown'),
  };
}

function normalizeRelatedSource(input: unknown): RelatedSource | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  return {
    id: asString(record.id, 'related-source'),
    label: asString(record.label || record.name || record.title, 'Related source'),
    url: asString(record.url || record.source_url),
    status: asString(record.status, 'unknown'),
  };
}

function normalizeAgentSummary(input: unknown, index: number): RelatedAgentSummary | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  return {
    id: asString(record.id, `summary-${index}`),
    agentName: asString(record.agent_name || record.agent || record.employee, 'Unknown agent'),
    headline: asString(record.headline || record.summary || record.title, 'Agent summary'),
    completedAt: asString(record.completed_at || record.created_at),
    status: asString(record.status, 'unknown'),
  };
}

function normalizeTimelineEvent(input: unknown, index: number): QueueStatusEvent | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  return {
    id: asString(record.id, `event-${index}`),
    label: asString(record.label || record.step || record.status, 'Timeline event'),
    status: asString(record.status || record.state, 'unknown'),
    createdAt: asString(record.created_at || record.timestamp),
    detail: asString(record.detail || record.message || record.reason),
  };
}

function normalizeDetail(input: unknown): CommandInboxDetail | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  return {
    id: asString(record.id, 'selected-command'),
    rawCommand: asString(record.raw_command || record.command || record.prompt),
    parsedIntentLabel: asString(record.parsed_intent_label || (record.parsed_intent as Record<string, unknown> | undefined)?.type || record.command_type, 'Not parsed yet'),
    validationStatus: asString(record.validation_status || record.validation, 'unknown'),
    queueStatus: asString(record.queue_status || record.job_status || record.execution_status, 'unqueued'),
    createdAt: asString(record.created_at || record.submitted_at),
    approvalRequired: Boolean(record.approval_required ?? record.requires_approval ?? record.high_risk),
    approvalStatus: asString(record.approval_status || record.approval?.status, 'not_requested'),
    queueHandoffState: asString(record.queue_handoff_state || record.handoff_status || record.queue_status, 'unknown'),
    executionOutcome: asString(record.execution_outcome || record.outcome || record.execution_status, 'unknown'),
    executionSummary: asString(record.execution_summary || record.outcome_summary || record.result_summary),
    relatedSource: normalizeRelatedSource(record.related_source || record.source),
    relatedAgentSummaries: asArray(record.related_agent_summaries || record.agent_summaries)
      .map((entry, index) => normalizeAgentSummary(entry, index))
      .filter((entry): entry is RelatedAgentSummary => Boolean(entry)),
    timeline: asArray(record.timeline || record.queue_timeline || record.events)
      .map((entry, index) => normalizeTimelineEvent(entry, index))
      .filter((entry): entry is QueueStatusEvent => Boolean(entry)),
  };
}

export function useCommandInbox() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<CommandInboxListItem[]>([]);
  const [detail, setDetail] = useState<CommandInboxDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCommandId, setSelectedCommandId] = useState(() => new URLSearchParams(window.location.search).get('command_id') || '');

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

  useEffect(() => {
    const nextUrl = new URL(window.location.href);
    if (selectedCommandId) nextUrl.searchParams.set('command_id', selectedCommandId);
    else nextUrl.searchParams.delete('command_id');
    window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`);
  }, [selectedCommandId]);

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
      params.set('limit', '20');
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (selectedCommandId) params.set('command_id', selectedCommandId);
      const body = await authFetchJson<CommandInboxResponse>(`/.netlify/functions/admin-command-inbox?${params.toString()}`);
      const nextItems = asArray(body.items)
        .map((entry, index) => normalizeListItem(entry, index))
        .filter((entry): entry is CommandInboxListItem => Boolean(entry));
      const nextDetail = normalizeDetail(body.selected || body.detail);

      setItems(nextItems);
      setSelectedCommandId((current) => current || nextDetail?.id || nextItems[0]?.id || '');
      setDetail(nextDetail || null);
    } catch (refreshError: any) {
      setError(String(refreshError?.message || 'Unable to load command inbox.'));
      setItems([]);
      setDetail(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!checkingAccess && isAuthorized) {
      void refresh();
    }
  }, [checkingAccess, isAuthorized, statusFilter, selectedCommandId]);

  return useMemo(() => ({
    user,
    checkingAccess,
    isAuthorized,
    loading,
    refreshing,
    error,
    items,
    detail,
    statusFilter,
    setStatusFilter,
    selectedCommandId,
    setSelectedCommandId,
    refresh,
  }), [user, checkingAccess, isAuthorized, loading, refreshing, error, items, detail, statusFilter, selectedCommandId]);
}