import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { authFetchJson, resolveInternalAccess } from './adminAccess';

export type ActivationTenant = {
  id: string;
  name: string;
  created_at?: string;
};

export type ActivationDomain = {
  id: string;
  domain_key: string;
  display_name: string;
  status: string;
  severity: string;
  blocking_level: string;
  guidance?: string | null;
  notes?: string | null;
  action_path?: string | null;
  last_checked_at?: string | null;
  effective_status: string;
  effective_severity: string;
  effective_missing_items: string[];
};

export type ActivationCredential = {
  id: string;
  domain_key: string;
  credential_key: string;
  label: string;
  status: string;
  connection_state: string;
  masked_value?: string | null;
  notes?: string | null;
  instructions?: string | null;
  action_path?: string | null;
  is_sensitive: boolean;
  last_checked_at?: string | null;
};

export type ActivationStep = {
  id: string;
  domain_key: string;
  step_key: string;
  label: string;
  description?: string | null;
  status: string;
  required: boolean;
  sort_order: number;
  action_path?: string | null;
  notes?: string | null;
};

export type EnvironmentReadiness = {
  id: string;
  readiness_key: string;
  label: string;
  status: string;
  severity: string;
  notes?: string | null;
  effective_status: string;
  effective_severity: string;
  effective_blocking_items: string[];
  effective_warning_items: string[];
};

type ActivationResponse = {
  ok?: boolean;
  error?: string;
  summary?: {
    overall_status: string;
    blocked_domains: number;
    warning_domains: number;
    missing_credentials: number;
    pending_steps: number;
    completed_steps: number;
    active_incidents: number;
    next_step: string;
    blocking_issues: string[];
  };
  control_plane?: {
    system_mode: string;
    queue_enabled: boolean;
    ai_jobs_enabled: boolean;
    research_jobs_enabled: boolean;
    notifications_enabled: boolean;
    updated_at?: string | null;
  };
  nexus_one?: {
    latest_briefing_title?: string | null;
    latest_briefing_at?: string | null;
    briefings_count: number;
    pending_command_approvals: number;
    total_commands: number;
    running_or_queued_commands: number;
    recent_agent_runs: number;
    fresh_workers: number;
    stale_workers: number;
    manus_positioning: string;
  };
  launch_summary?: {
    readiness_checks: Array<Record<string, unknown>>;
    blocked_checks: number;
    warning_checks: number;
    recent_simulations: Array<Record<string, unknown>>;
  };
  domains?: ActivationDomain[];
  credentials?: ActivationCredential[];
  activation_steps?: ActivationStep[];
  environment_readiness?: EnvironmentReadiness[];
  missing_tables?: string[];
  warnings?: string[];
};

export function useAdminActivationCenter() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState<ActivationTenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [summary, setSummary] = useState<ActivationResponse['summary'] | null>(null);
  const [controlPlane, setControlPlane] = useState<ActivationResponse['control_plane'] | null>(null);
  const [nexusOne, setNexusOne] = useState<ActivationResponse['nexus_one'] | null>(null);
  const [launchSummary, setLaunchSummary] = useState<ActivationResponse['launch_summary'] | null>(null);
  const [domains, setDomains] = useState<ActivationDomain[]>([]);
  const [credentials, setCredentials] = useState<ActivationCredential[]>([]);
  const [steps, setSteps] = useState<ActivationStep[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentReadiness[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [missingTables, setMissingTables] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    async function boot() {
      const authorized = await resolveInternalAccess(user?.id, user?.role);
      if (!active) return;
      setIsAuthorized(authorized);
      setCheckingAccess(false);
      if (!authorized) {
        setLoading(false);
        return;
      }

      try {
        const { data, error: tenantError } = await supabase.from('tenants').select('id,name,created_at').order('created_at', { ascending: false });
        if (tenantError) throw tenantError;
        if (!active) return;
        const nextTenants = Array.isArray(data) ? data as ActivationTenant[] : [];
        setTenants(nextTenants);
        setSelectedTenantId((current) => current || nextTenants[0]?.id || '');
      } catch (bootError: any) {
        if (!active) return;
        setError(String(bootError?.message || 'Unable to load tenants.'));
        setLoading(false);
      }
    }

    void boot();
    return () => {
      active = false;
    };
  }, [user?.id, user?.role]);

  async function refresh(tenantId = selectedTenantId) {
    if (!isAuthorized || !tenantId) {
      setLoading(false);
      return;
    }

    try {
      setRefreshing(true);
      setLoading(true);
      setError('');
      const payload = await authFetchJson<ActivationResponse>(`/.netlify/functions/admin-activation-readiness?tenant_id=${encodeURIComponent(tenantId)}`);
      setSummary(payload.summary || null);
      setControlPlane(payload.control_plane || null);
      setNexusOne(payload.nexus_one || null);
      setLaunchSummary(payload.launch_summary || null);
      setDomains(Array.isArray(payload.domains) ? payload.domains : []);
      setCredentials(Array.isArray(payload.credentials) ? payload.credentials : []);
      setSteps(Array.isArray(payload.activation_steps) ? payload.activation_steps : []);
      setEnvironments(Array.isArray(payload.environment_readiness) ? payload.environment_readiness : []);
      setWarnings(Array.isArray(payload.warnings) ? payload.warnings : []);
      setMissingTables(Array.isArray(payload.missing_tables) ? payload.missing_tables : []);
    } catch (refreshError: any) {
      setError(String(refreshError?.message || 'Unable to load activation readiness.'));
      setDomains([]);
      setCredentials([]);
      setSteps([]);
      setEnvironments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function mutate(body: Record<string, unknown>) {
    if (!selectedTenantId) return;
    try {
      setSaving(true);
      setError('');
      const payload = await authFetchJson<ActivationResponse>('/.netlify/functions/admin-activation-readiness', {
        method: 'PATCH',
        body: { tenant_id: selectedTenantId, ...body },
      });
      setSummary(payload.summary || null);
      setControlPlane(payload.control_plane || null);
      setNexusOne(payload.nexus_one || null);
      setLaunchSummary(payload.launch_summary || null);
      setDomains(Array.isArray(payload.domains) ? payload.domains : []);
      setCredentials(Array.isArray(payload.credentials) ? payload.credentials : []);
      setSteps(Array.isArray(payload.activation_steps) ? payload.activation_steps : []);
      setEnvironments(Array.isArray(payload.environment_readiness) ? payload.environment_readiness : []);
      setWarnings(Array.isArray(payload.warnings) ? payload.warnings : []);
      setMissingTables(Array.isArray(payload.missing_tables) ? payload.missing_tables : []);
    } catch (mutationError: any) {
      setError(String(mutationError?.message || 'Unable to update activation readiness.'));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!checkingAccess && isAuthorized && selectedTenantId) {
      void refresh(selectedTenantId);
    }
  }, [checkingAccess, isAuthorized, selectedTenantId]);

  const groupedCredentials = useMemo(() => {
    const map = new Map<string, ActivationCredential[]>();
    for (const item of credentials) {
      const bucket = map.get(item.domain_key) || [];
      bucket.push(item);
      map.set(item.domain_key, bucket);
    }
    return map;
  }, [credentials]);

  return {
    user,
    checkingAccess,
    isAuthorized,
    loading,
    refreshing,
    saving,
    error,
    tenants,
    selectedTenantId,
    setSelectedTenantId,
    summary,
    controlPlane,
    nexusOne,
    launchSummary,
    domains,
    credentials,
    groupedCredentials,
    steps,
    environments,
    warnings,
    missingTables,
    refresh,
    updateDomain: (domainKey: string, updates: Record<string, unknown>) => mutate({ action: 'update_domain', domain_key: domainKey, ...updates }),
    updateCredential: (domainKey: string, credentialKey: string, updates: Record<string, unknown>) => mutate({ action: 'update_credential', domain_key: domainKey, credential_key: credentialKey, ...updates }),
    updateStep: (stepKey: string, updates: Record<string, unknown>) => mutate({ action: 'update_step', step_key: stepKey, ...updates }),
    updateEnvironment: (readinessKey: string, updates: Record<string, unknown>) => mutate({ action: 'update_environment', readiness_key: readinessKey, ...updates }),
  };
}
