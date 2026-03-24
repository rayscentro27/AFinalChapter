import { useEffect, useMemo, useState } from 'react';
import { authFetchJson } from './adminAccess';

export type CredentialCheck = {
  integration_key: string;
  check_key: string;
  label: string;
  severity: string;
  source: string;
  status: string;
  summary: string;
  details?: Record<string, unknown>;
  last_checked_at?: string | null;
};

export type CredentialIntegration = {
  integration_key: string;
  display_name: string;
  category: string;
  description: string;
  instructions: string;
  action_path?: string | null;
  secret_handling: string;
  required_pilot: boolean;
  required_launch: boolean;
  status: string;
  verification_state: string;
  masked_hint?: string | null;
  last_verified_at?: string | null;
  last_verification_summary?: string | null;
  last_verification_error?: string | null;
  checks: CredentialCheck[];
};

type CredentialSummary = {
  overall_status: string;
  pilot_status: string;
  launch_status: string;
  integrations_total: number;
  ready_integrations: number;
  blocked_integrations: number;
  degraded_integrations: number;
  verification_failures: number;
  pilot_blockers: string[];
  launch_blockers: string[];
  next_step: string;
};

type CredentialEvent = {
  id: string;
  integration_key: string;
  event_type: string;
  status?: string | null;
  summary?: string | null;
  created_at: string;
};

type ResponseShape = {
  ok: boolean;
  tenant_id: string;
  summary: CredentialSummary;
  integrations: CredentialIntegration[];
  checks: CredentialCheck[];
  events: CredentialEvent[];
  warnings: string[];
  missing_tables: string[];
  error?: string;
};

export function useAdminCredentialReadiness(tenantId: string) {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [verifyingKey, setVerifyingKey] = useState('');
  const [error, setError] = useState('');
  const [data, setData] = useState<ResponseShape | null>(null);

  async function refresh() {
    if (!tenantId) return;
    setRefreshing(true);
    setError('');
    try {
      const response = await authFetchJson<ResponseShape>(`/.netlify/functions/admin-credential-readiness?tenant_id=${encodeURIComponent(tenantId)}`);
      setData(response);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    void refresh();
  }, [tenantId]);

  async function verifyIntegration(integrationKey: string) {
    if (!tenantId || !integrationKey) return;
    setVerifyingKey(integrationKey);
    setError('');
    try {
      const response = await authFetchJson<ResponseShape>(`/.netlify/functions/admin-credential-readiness?integration_key=${encodeURIComponent(integrationKey)}`, {
        method: 'POST',
        body: { tenant_id: tenantId },
      });
      setData(response);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setVerifyingKey('');
    }
  }

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, CredentialIntegration[]>();
    for (const item of data?.integrations || []) {
      const key = item.category || 'other';
      const current = map.get(key) || [];
      current.push(item);
      map.set(key, current);
    }
    return map;
  }, [data]);

  return {
    loading,
    refreshing,
    verifyingKey,
    error,
    summary: data?.summary || null,
    integrations: data?.integrations || [],
    checks: data?.checks || [],
    events: data?.events || [],
    warnings: data?.warnings || [],
    missingTables: data?.missing_tables || [],
    groupedByCategory,
    refresh,
    verifyIntegration,
  };
}