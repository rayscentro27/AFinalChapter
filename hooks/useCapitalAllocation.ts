import { useCallback, useEffect, useState } from 'react';
import {
  CapitalAllocationState,
  CapitalEligibility,
  CapitalPath,
  CapitalProfile,
  CapitalReadiness,
  getCapitalAllocation,
  setCapitalAllocation,
} from '../services/capitalAccessService';

export type CapitalAllocationPayload = {
  tenant_id: string;
  allocation: CapitalAllocationState;
  readiness: CapitalReadiness;
  profile: CapitalProfile | null;
  eligibility: CapitalEligibility;
};

export default function useCapitalAllocation(tenantId?: string) {
  const [data, setData] = useState<CapitalAllocationPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setData(null);
      return null;
    }

    setLoading(true);
    setError('');

    try {
      const response = await getCapitalAllocation(tenantId, false);
      const next: CapitalAllocationPayload = {
        tenant_id: response.tenant_id,
        allocation: response.allocation,
        readiness: response.readiness,
        profile: response.profile,
        eligibility: response.eligibility,
      };
      setData(next);
      return next;
    } catch (err: any) {
      setError(String(err?.message || 'Unable to load capital allocation.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectPath = useCallback(
    async (selectedPath: CapitalPath, metadata?: Record<string, unknown>) => {
      if (!tenantId) return null;
      setSaving(true);
      setError('');

      try {
        const response = await setCapitalAllocation({
          tenant_id: tenantId,
          selected_path: selectedPath,
          metadata,
          reconcile: true,
        });

        const next: CapitalAllocationPayload = {
          tenant_id: response.tenant_id,
          allocation: response.allocation,
          readiness: response.readiness,
          profile: response.profile,
          eligibility: response.eligibility,
        };
        setData(next);
        return next;
      } catch (err: any) {
        setError(String(err?.message || 'Unable to set capital allocation path.'));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [tenantId]
  );

  return {
    data,
    loading,
    saving,
    error,
    refresh,
    selectPath,
  };
}
