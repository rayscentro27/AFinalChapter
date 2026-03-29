import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { data } from '../adapters';
import { supabase } from '../lib/supabaseClient';
import {
  applyReminderAction,
  buildLifecycleReminders,
  LifecycleReminder,
  ReminderAction,
  summarizeReminderMetrics,
  syncReminderState,
} from '../services/lifecycleReminderService';

const INTERNAL_ROLES = new Set(['admin', 'supervisor']);

type ContactSummary = {
  id: string;
  name?: string;
  company?: string;
  email?: string;
};

type TaskRow = {
  tenant_id: string;
  task_id?: string;
  title?: string;
  description?: string | null;
  status?: string;
  due_date?: string | null;
  signal?: string | null;
  group_key?: string | null;
  template_key?: string | null;
  type?: string | null;
  meta?: Record<string, unknown> | null;
};

type FundingProfileRow = { tenant_id: string; current_stage?: string | null };
type TenantOnlyRow = { tenant_id: string };
type BusinessProfileRow = { tenant_id: string; business_path?: string | null };
type BusinessProgressRow = { tenant_id: string; step_key?: string | null; step_status?: string | null; is_required?: boolean | null };
type FundingApplicationRow = { tenant_id: string; decision_status?: string | null; submitted_at?: string | null };
type FundingResultRow = { tenant_id: string };
type CapitalProfileRow = { tenant_id: string; reserve_confirmed?: boolean | null; capital_setup_status?: string | null; business_growth_positioned?: boolean | null };
type CapitalAllocationRow = { tenant_id: string; selected_path?: string | null; current_state?: string | null };
type AdvancedAccessRow = { tenant_id: string; feature_key?: string | null; opted_in?: boolean | null; intro_video_watched_at?: string | null; access_status?: string | null };

async function safeSelect<T extends Record<string, unknown>>(table: string, select: string, dependencyNotes: string[], limit = 5000): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(select).limit(limit);
  if (error) {
    dependencyNotes.push(`${table}: ${error.message || 'query unavailable'}`);
    return [];
  }
  return (data || []) as T[];
}

export default function useReminderQueue() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [dependencyNotes, setDependencyNotes] = useState<string[]>([]);
  const [tenantOptions, setTenantOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [reminders, setReminders] = useState<LifecycleReminder[]>([]);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      if (!user?.id) {
        if (!active) return;
        setIsAuthorized(false);
        setCheckingAccess(false);
        return;
      }

      const accessRes = await supabase.rpc('nexus_is_master_admin_compat');
      if (!active) return;
      if (accessRes.error) {
        setIsAuthorized(INTERNAL_ROLES.has(String(user.role || '').toLowerCase()));
      } else {
        setIsAuthorized(Boolean(accessRes.data) || INTERNAL_ROLES.has(String(user.role || '').toLowerCase()));
      }
      setCheckingAccess(false);
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [user?.id, user?.role]);

  const refresh = useCallback(async () => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setRefreshing(true);
    setError('');
    const notes: string[] = [];

    try {
      const contacts = (await data.getContacts().catch(() => {
        notes.push('contacts: unable to load contact registry');
        return [] as ContactSummary[];
      })) as ContactSummary[];

      const [
        taskRows,
        fundingProfiles,
        creditReports,
        creditAnalysis,
        businessProfiles,
        businessProgress,
        fundingApplications,
        fundingResults,
        capitalProfiles,
        capitalAllocations,
        advancedAccess,
        grantMatches,
        grantDrafts,
        grantSubmissions,
      ] = await Promise.all([
        safeSelect<TaskRow>('client_tasks', 'tenant_id,task_id,title,description,status,due_date,signal,group_key,template_key,type,meta', notes),
        safeSelect<FundingProfileRow>('funding_profiles', 'tenant_id,current_stage', notes),
        safeSelect<TenantOnlyRow>('credit_reports', 'tenant_id', notes),
        safeSelect<TenantOnlyRow>('credit_analysis', 'tenant_id', notes),
        safeSelect<BusinessProfileRow>('business_profiles', 'tenant_id,business_path', notes),
        safeSelect<BusinessProgressRow>('business_setup_progress', 'tenant_id,step_key,step_status,is_required', notes),
        safeSelect<FundingApplicationRow>('funding_applications', 'tenant_id,decision_status,submitted_at', notes),
        safeSelect<FundingResultRow>('funding_results', 'tenant_id', notes),
        safeSelect<CapitalProfileRow>('capital_profiles', 'tenant_id,reserve_confirmed,capital_setup_status,business_growth_positioned', notes),
        safeSelect<CapitalAllocationRow>('capital_allocation_choices', 'tenant_id,selected_path,current_state', notes),
        safeSelect<AdvancedAccessRow>('user_advanced_access', 'tenant_id,feature_key,opted_in,intro_video_watched_at,access_status', notes),
        safeSelect<TenantOnlyRow>('grant_matches', 'tenant_id', notes),
        safeSelect<TenantOnlyRow>('grant_application_drafts', 'tenant_id', notes),
        safeSelect<TenantOnlyRow>('grant_submissions', 'tenant_id', notes),
      ]);

      const contactMap = new Map<string, ContactSummary>(contacts.map((contact) => [contact.id, contact]));
      const tenantIds = new Set<string>(contacts.map((contact) => contact.id));
      [
        ...taskRows,
        ...fundingProfiles,
        ...creditReports,
        ...creditAnalysis,
        ...businessProfiles,
        ...businessProgress,
        ...fundingApplications,
        ...fundingResults,
        ...capitalProfiles,
        ...capitalAllocations,
        ...advancedAccess,
        ...grantMatches,
        ...grantDrafts,
        ...grantSubmissions,
      ].forEach((row: any) => {
        if (row?.tenant_id) tenantIds.add(row.tenant_id);
      });

      const nextReminders: LifecycleReminder[] = [];

      tenantIds.forEach((tenantId) => {
        const contact = contactMap.get(tenantId);
        const pendingTasks = taskRows.filter((row) => row.tenant_id === tenantId && String(row.status || 'pending') !== 'completed');
        const missingSteps = businessProgress
          .filter((row) => row.tenant_id === tenantId && row.is_required && row.step_status !== 'completed')
          .map((row) => String(row.step_key || 'required_step'));

        nextReminders.push(
          ...buildLifecycleReminders({
            tenantId,
            clientLabel: String(contact?.company || contact?.name || contact?.email || tenantId),
            currentStage: fundingProfiles.find((row) => row.tenant_id === tenantId)?.current_stage || 'untracked',
            pendingTasks,
            creditReportCount: creditReports.filter((row) => row.tenant_id === tenantId).length,
            creditAnalysisCount: creditAnalysis.filter((row) => row.tenant_id === tenantId).length,
            businessPath: businessProfiles.find((row) => row.tenant_id === tenantId)?.business_path || null,
            businessMissingSteps: missingSteps,
            pendingApplications: fundingApplications.filter((row) => row.tenant_id === tenantId && ['submitted', 'pending'].includes(String(row.decision_status || '').toLowerCase())),
            fundingResultCount: fundingResults.filter((row) => row.tenant_id === tenantId).length,
            capitalProfile: capitalProfiles.find((row) => row.tenant_id === tenantId) || null,
            capitalAllocation: capitalAllocations.find((row) => row.tenant_id === tenantId) || null,
            tradingAccess: advancedAccess.find((row) => row.tenant_id === tenantId && String(row.feature_key || '') === 'advanced_trading') || advancedAccess.find((row) => row.tenant_id === tenantId) || null,
            grantMatchCount: grantMatches.filter((row) => row.tenant_id === tenantId).length,
            grantDraftCount: grantDrafts.filter((row) => row.tenant_id === tenantId).length,
            grantSubmissionCount: grantSubmissions.filter((row) => row.tenant_id === tenantId).length,
          })
        );
      });

      setTenantOptions(
        Array.from(tenantIds)
          .map((tenantId) => ({ id: tenantId, label: String(contactMap.get(tenantId)?.company || contactMap.get(tenantId)?.name || contactMap.get(tenantId)?.email || tenantId) }))
          .sort((left, right) => left.label.localeCompare(right.label))
      );
      setReminders(nextReminders);
      setDependencyNotes(Array.from(new Set(notes.concat([
        'Internal communication queue status, send count, and suppression controls are currently stored in local browser state only. Add backend thread/message storage before using this as a shared staff queue across sessions.',
        'Portal communication events are grounded in existing task and stage data. External delivery channels are intentionally not used in this slice.',
      ]))));
    } catch (err: any) {
      setError(String(err?.message || 'Unable to load lifecycle reminder queue.'));
      setReminders([]);
      setDependencyNotes(Array.from(new Set(notes)));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthorized]);

  useEffect(() => {
    if (!checkingAccess) {
      void refresh();
    }
  }, [checkingAccess, refresh]);

  const updateReminder = useCallback((reminderId: string, action: ReminderAction) => {
    applyReminderAction(reminderId, action);
    setReminders((current) => syncReminderState(current));
  }, []);

  return useMemo(
    () => ({
      user,
      checkingAccess,
      isAuthorized,
      loading,
      refreshing,
      error,
      dependencyNotes,
      reminders,
      metrics: summarizeReminderMetrics(reminders),
      tenantOptions,
      refresh,
      updateReminder,
    }),
    [checkingAccess, dependencyNotes, error, isAuthorized, loading, refresh, refreshing, reminders, tenantOptions, updateReminder, user]
  );
}