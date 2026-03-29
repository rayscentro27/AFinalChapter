import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authFetchJson, resolveInternalAccess } from './adminAccess';
import type { AdminCommandRecord } from './useSuperAdminCommandCenter';
import { normalizeCommandRecord } from './useSuperAdminCommandCenter';
import type { SourceRegistryRecord } from './useSourceRegistry';
import { normalizeSource } from './useSourceRegistry';

type RollupCounts = {
  pendingApprovals: number;
  failedCommands: number;
  pausedSources: number;
  pausedSchedules: number;
  sourcesNeedingReview: number;
};

type OperationsRollup = {
  counts: RollupCounts;
  pendingApprovals: AdminCommandRecord[];
  failedCommands: AdminCommandRecord[];
  pausedSources: SourceRegistryRecord[];
  pausedSchedules: SourceRegistryRecord[];
  sourcesNeedingReview: SourceRegistryRecord[];
};

type CommandCenterResponse = {
  items?: unknown;
  commands?: unknown;
  history?: unknown;
};

type SourceRegistryResponse = {
  items?: unknown;
  sources?: unknown;
};

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeCommandStatus(value: string) {
  return String(value || '').trim().toLowerCase();
}

function emptyRollup(): OperationsRollup {
  return {
    counts: {
      pendingApprovals: 0,
      failedCommands: 0,
      pausedSources: 0,
      pausedSchedules: 0,
      sourcesNeedingReview: 0,
    },
    pendingApprovals: [],
    failedCommands: [],
    pausedSources: [],
    pausedSchedules: [],
    sourcesNeedingReview: [],
  };
}

function buildRollup(commands: AdminCommandRecord[], sources: SourceRegistryRecord[]): OperationsRollup {
  const pendingApprovals = commands.filter((item) => item.approvalRequired && normalizeCommandStatus(item.approvalStatus) === 'pending');
  const failedCommands = commands.filter((item) => {
    const outcome = normalizeCommandStatus(item.executionOutcome);
    const handoff = normalizeCommandStatus(item.queueHandoffState);
    return outcome.includes('failed') || outcome.includes('error') || handoff.includes('failed') || handoff.includes('error');
  });
  const pausedSources = sources.filter((item) => item.paused);
  const pausedSchedules = sources.filter((item) => item.schedulePaused);
  const sourcesNeedingReview = sources.filter((item) => item.warnings.length > 0 || normalizeCommandStatus(item.lastRunStatus).includes('failed') || normalizeCommandStatus(item.lastRunStatus).includes('error'));

  return {
    counts: {
      pendingApprovals: pendingApprovals.length,
      failedCommands: failedCommands.length,
      pausedSources: pausedSources.length,
      pausedSchedules: pausedSchedules.length,
      sourcesNeedingReview: sourcesNeedingReview.length,
    },
    pendingApprovals: pendingApprovals.slice(0, 4),
    failedCommands: failedCommands.slice(0, 4),
    pausedSources: pausedSources.slice(0, 4),
    pausedSchedules: pausedSchedules.slice(0, 4),
    sourcesNeedingReview: sourcesNeedingReview.slice(0, 4),
  };
}

export function useExecutiveOperationsRollup() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [rollup, setRollup] = useState<OperationsRollup>(() => emptyRollup());

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

      const [commandBody, sourceBody] = await Promise.all([
        authFetchJson<CommandCenterResponse>('/.netlify/functions/admin-super-admin-commands?limit=50'),
        authFetchJson<SourceRegistryResponse>('/.netlify/functions/admin-source-registry?limit=100'),
      ]);

      const commands = asArray(commandBody.items || commandBody.commands || commandBody.history)
        .map((entry, index) => normalizeCommandRecord(entry, index))
        .filter((entry): entry is AdminCommandRecord => Boolean(entry));
      const sources = asArray(sourceBody.items || sourceBody.sources)
        .map((entry, index) => normalizeSource(entry, index))
        .filter((entry): entry is SourceRegistryRecord => Boolean(entry));

      setRollup(buildRollup(commands, sources));
    } catch (refreshError: any) {
      setError(String(refreshError?.message || 'Unable to load executive operations rollup.'));
      setRollup(emptyRollup());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!checkingAccess && isAuthorized) {
      void refresh();
    }
  }, [checkingAccess, isAuthorized]);

  return useMemo(() => ({
    checkingAccess,
    isAuthorized,
    loading,
    refreshing,
    error,
    rollup,
    refresh,
  }), [checkingAccess, isAuthorized, loading, refreshing, error, rollup]);
}