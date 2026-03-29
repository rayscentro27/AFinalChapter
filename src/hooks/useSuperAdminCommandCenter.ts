import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authFetchJson, resolveInternalAccess } from './adminAccess';

export type ParsedIntent = {
  commandType: string;
  targetLabel: string;
  validationStatus: string;
  confidenceLabel: string;
  notes: string[];
};

export type AdminCommandRecord = {
  id: string;
  tenantId: string | null;
  rawCommand: string;
  commandType: string;
  riskLevel: string;
  status: string;
  validationStatus: string;
  queueStatus: string;
  createdAt: string;
  updatedAt: string;
  parsedIntent: ParsedIntent | null;
  approvalRequired: boolean;
  approvalStatus: string;
  queueHandoffState: string;
  executionOutcome: string;
  executionSummary: string;
  resultSummary: string;
  errorMessage: string;
  approvedAt: string;
  executedAt: string;
  completedAt: string;
};

type CommandCenterResponse = {
  ok?: boolean;
  error?: string;
  items?: unknown;
  commands?: unknown;
  history?: unknown;
  submitted?: unknown;
};

type CommandActionResponse = {
  ok?: boolean;
  error?: string;
  command?: unknown;
  approved?: unknown;
  queued?: unknown;
};

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeParsedIntent(input: unknown): ParsedIntent | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const notes = asArray(record.notes || record.validation_notes || record.targets)
    .map((entry) => asString(typeof entry === 'string' ? entry : (entry as Record<string, unknown>)?.label || (entry as Record<string, unknown>)?.message))
    .filter(Boolean);
  return {
    commandType: asString(record.command_type || record.type, 'unknown'),
    targetLabel: asString(record.target_label || record.target || record.scope, 'No target extracted'),
    validationStatus: asString(record.validation_status || record.validation, 'unknown'),
    confidenceLabel: asString(record.confidence_label || record.confidence || record.confidence_band, 'unscored'),
    notes,
  };
}

export function normalizeCommandRecord(input: unknown, index: number): AdminCommandRecord | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  return {
    id: asString(record.id, `command-${index}`),
    tenantId: asString(record.tenant_id) || null,
    rawCommand: asString(record.raw_command || record.command || record.prompt),
    commandType: asString(record.command_type || record.type, 'unknown'),
    riskLevel: asString(record.risk_level || record.priority || 'medium'),
    status: asString(record.status, 'unknown'),
    validationStatus: asString(record.validation_status || record.validation, 'unknown'),
    queueStatus: asString(record.queue_status || record.job_status || record.execution_status, 'unqueued'),
    createdAt: asString(record.created_at || record.submitted_at),
    updatedAt: asString(record.updated_at),
    parsedIntent: normalizeParsedIntent(record.parsed_intent || record.intent_preview || record.preview),
    approvalRequired: Boolean(record.approval_required ?? record.requires_approval ?? record.high_risk),
    approvalStatus: asString(record.approval_status || record.approval?.status, 'not_requested'),
    queueHandoffState: asString(record.queue_handoff_state || record.handoff_status || record.queue_status, 'unknown'),
    executionOutcome: asString(record.execution_outcome || record.outcome || record.execution_status, 'unknown'),
    executionSummary: asString(record.execution_summary || record.outcome_summary || record.result_summary),
    resultSummary: asString(record.result_summary || record.execution_summary || record.outcome_summary),
    errorMessage: asString(record.error_message),
    approvedAt: asString(record.approved_at),
    executedAt: asString(record.executed_at),
    completedAt: asString(record.completed_at),
  };
}

export function useSuperAdminCommandCenter() {
  const { user } = useAuth();
  const initialParams = new URLSearchParams(window.location.search);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [history, setHistory] = useState<AdminCommandRecord[]>([]);
  const [draft, setDraft] = useState(() => initialParams.get('draft') || '');
  const [selectedCommandId, setSelectedCommandId] = useState(() => initialParams.get('command_id') || '');

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
      const body = await authFetchJson<CommandCenterResponse>('/.netlify/functions/admin-super-admin-commands?limit=20');
      const nextHistory = asArray(body.items || body.commands || body.history)
        .map((entry, index) => normalizeCommandRecord(entry, index))
        .filter((entry): entry is AdminCommandRecord => Boolean(entry));
      setHistory(nextHistory);
      setSelectedCommandId((current) => current || nextHistory[0]?.id || '');
    } catch (refreshError: any) {
      setError(String(refreshError?.message || 'Unable to load command history.'));
      setHistory([]);
      setSelectedCommandId('');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function submitCommand() {
    if (!draft.trim()) {
      setSubmitError('Command text is required.');
      return false;
    }

    try {
      setSubmitting(true);
      setSubmitError('');
      await authFetchJson<CommandCenterResponse>('/.netlify/functions/admin-super-admin-commands', {
        method: 'POST',
        body: { command: draft.trim() },
      });
      setDraft('');
      await refresh();
      return true;
    } catch (submitCommandError: any) {
      setSubmitError(String(submitCommandError?.message || 'Unable to submit command.'));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function applyAction(commandId: string, action: 'approve' | 'reject' | 'cancel', reason?: string) {
    try {
      setSubmitting(true);
      setSubmitError('');
      await authFetchJson<CommandActionResponse>('/.netlify/functions/admin-super-admin-commands', {
        method: 'PATCH',
        body: { command_id: commandId, action, reason },
      });
      await refresh();
      return true;
    } catch (requestError: any) {
      setSubmitError(String(requestError?.message || `Unable to ${action} command.`));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const nextUrl = new URL(window.location.href);
    if (selectedCommandId) nextUrl.searchParams.set('command_id', selectedCommandId);
    else nextUrl.searchParams.delete('command_id');
    if (draft.trim()) nextUrl.searchParams.set('draft', draft.trim());
    else nextUrl.searchParams.delete('draft');
    window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`);
  }, [selectedCommandId, draft]);

  useEffect(() => {
    if (!checkingAccess && isAuthorized) {
      void refresh();
    }
  }, [checkingAccess, isAuthorized]);

  const selectedCommand = useMemo(
    () => history.find((item) => item.id === selectedCommandId) || history[0] || null,
    [history, selectedCommandId]
  );

  return useMemo(() => ({
    user,
    checkingAccess,
    isAuthorized,
    loading,
    refreshing,
    submitting,
    error,
    submitError,
    history,
    draft,
    setDraft,
    selectedCommand,
    selectedCommandId,
    setSelectedCommandId,
    refresh,
    submitCommand,
    approveCommand: (commandId: string, reason?: string) => applyAction(commandId, 'approve', reason),
    rejectCommand: (commandId: string, reason?: string) => applyAction(commandId, 'reject', reason),
    cancelCommand: (commandId: string, reason?: string) => applyAction(commandId, 'cancel', reason),
  }), [user, checkingAccess, isAuthorized, loading, refreshing, submitting, error, submitError, history, draft, selectedCommand, selectedCommandId]);
}