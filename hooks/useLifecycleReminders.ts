import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  getBusinessFoundationProfile,
  getFundingHistory,
  getFundingRoadmap,
  getPortalTasks,
} from '../services/fundingFoundationService';
import {
  applyReminderAction,
  buildLifecycleReminders,
  getClientVisibleReminders,
  LifecycleReminder,
  ReminderAction,
  summarizeReminderMetrics,
  syncReminderState,
} from '../services/lifecycleReminderService';

type TenantOnlyRow = { tenant_id: string };

type CapitalProfileRow = {
  reserve_confirmed?: boolean | null;
  capital_setup_status?: string | null;
  business_growth_positioned?: boolean | null;
};

type CapitalAllocationRow = {
  selected_path?: string | null;
  current_state?: string | null;
};

type AdvancedAccessRow = {
  opted_in?: boolean | null;
  intro_video_watched_at?: string | null;
  access_status?: string | null;
};

type TaskRow = Record<string, unknown>;

async function safeTenantSelect<T extends Record<string, unknown>>(
  table: string,
  select: string,
  tenantId: string,
  dependencyNotes: string[],
  limit = 100
): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(select).eq('tenant_id', tenantId).limit(limit);
  if (error) {
    dependencyNotes.push(`${table}: ${error.message || 'query unavailable'}`);
    return [];
  }
  return (data || []) as T[];
}

function dedupeTasks(tasks: TaskRow[]) {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    const key = String(task.task_id || task.id || task.title || Math.random());
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function useLifecycleReminders(tenantId?: string, clientLabel?: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dependencyNotes, setDependencyNotes] = useState<string[]>([]);
  const [reminders, setReminders] = useState<LifecycleReminder[]>([]);

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setReminders([]);
      setDependencyNotes([]);
      return;
    }

    setLoading(true);
    setError('');
    const notes: string[] = [];

    try {
      const [
        portalTasks,
        roadmap,
        history,
        business,
        creditReports,
        creditAnalysis,
        capitalProfiles,
        capitalAllocations,
        advancedAccess,
        grantMatches,
        grantDrafts,
        grantSubmissions,
      ] = await Promise.all([
        getPortalTasks(tenantId, { reconcile: true }).catch((err: any) => {
          notes.push(`portal_tasks: ${String(err?.message || err)}`);
          return { top_task: null, urgent: [], recommended: [], completed: [] } as any;
        }),
        getFundingRoadmap(tenantId, false).catch((err: any) => {
          notes.push(`funding_roadmap: ${String(err?.message || err)}`);
          return { stage: 'untracked', readiness: { blockers: [] } } as any;
        }),
        getFundingHistory(tenantId).catch((err: any) => {
          notes.push(`funding_history: ${String(err?.message || err)}`);
          return { applications: [], results: [], legacy_outcomes: [] } as any;
        }),
        getBusinessFoundationProfile(tenantId).catch((err: any) => {
          notes.push(`business_foundation: ${String(err?.message || err)}`);
          return { readiness: { path: null, missing_steps: [] } } as any;
        }),
        safeTenantSelect<TenantOnlyRow>('credit_reports', 'tenant_id', tenantId, notes),
        safeTenantSelect<TenantOnlyRow>('credit_analysis', 'tenant_id', tenantId, notes),
        safeTenantSelect<CapitalProfileRow>('capital_profiles', 'reserve_confirmed,capital_setup_status,business_growth_positioned', tenantId, notes),
        safeTenantSelect<CapitalAllocationRow>('capital_allocation_choices', 'selected_path,current_state', tenantId, notes),
        safeTenantSelect<AdvancedAccessRow>('user_advanced_access', 'opted_in,intro_video_watched_at,access_status,feature_key', tenantId, notes),
        safeTenantSelect<TenantOnlyRow>('grant_matches', 'tenant_id', tenantId, notes),
        safeTenantSelect<TenantOnlyRow>('grant_application_drafts', 'tenant_id', tenantId, notes),
        safeTenantSelect<TenantOnlyRow>('grant_submissions', 'tenant_id', tenantId, notes),
      ]);

      const pendingTasks = dedupeTasks([
        portalTasks.top_task,
        ...(portalTasks.urgent || []),
        ...(portalTasks.recommended || []),
      ].filter(Boolean));

      const nextReminders = buildLifecycleReminders({
        tenantId,
        clientLabel: clientLabel || 'Current client',
        currentStage: String(roadmap.stage || 'untracked'),
        pendingTasks,
        creditReportCount: creditReports.length,
        creditAnalysisCount: creditAnalysis.length,
        businessPath: business.readiness?.path || null,
        businessMissingSteps: Array.isArray(business.readiness?.missing_steps) ? business.readiness.missing_steps : [],
        pendingApplications: Array.isArray(history.applications)
          ? history.applications.filter((row: any) => ['submitted', 'pending'].includes(String(row?.decision_status || '').toLowerCase()))
          : [],
        fundingResultCount: Array.isArray(history.results) ? history.results.length : 0,
        capitalProfile: capitalProfiles[0] || null,
        capitalAllocation: capitalAllocations[0] || null,
        tradingAccess: (advancedAccess as any[]).find((row) => String(row.feature_key || 'advanced_trading') === 'advanced_trading') || advancedAccess[0] || null,
        grantMatchCount: grantMatches.length,
        grantDraftCount: grantDrafts.length,
        grantSubmissionCount: grantSubmissions.length,
      });

      setReminders(nextReminders);
      setDependencyNotes(Array.from(new Set(notes.concat([
        'Internal communication status, suppression, and send-count tracking are currently stored in local browser state for the safest frontend-only slice. Backend thread/message storage is still needed for durable shared history across sessions.',
      ]))));
    } catch (err: any) {
      setError(String(err?.message || 'Unable to build lifecycle reminders.'));
      setReminders([]);
      setDependencyNotes(Array.from(new Set(notes)));
    } finally {
      setLoading(false);
    }
  }, [clientLabel, tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateReminder = useCallback((reminderId: string, action: ReminderAction) => {
    applyReminderAction(reminderId, action);
    setReminders((current) => syncReminderState(current));
  }, []);

  return useMemo(
    () => ({
      loading,
      error,
      reminders,
      clientVisibleReminders: getClientVisibleReminders(reminders),
      dependencyNotes,
      metrics: summarizeReminderMetrics(reminders),
      refresh,
      updateReminder,
    }),
    [dependencyNotes, error, loading, refresh, reminders, updateReminder]
  );
}