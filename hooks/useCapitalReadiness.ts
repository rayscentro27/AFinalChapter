import { useCallback, useEffect, useState } from 'react';
import {
  CapitalAllocationState,
  CapitalEligibility,
  CapitalProfile,
  CapitalReadiness,
  getCapitalReadiness,
} from '../services/capitalAccessService';

export type CapitalReadinessPayload = {
  tenant_id: string;
  readiness: CapitalReadiness;
  profile: CapitalProfile | null;
  allocation: CapitalAllocationState;
  eligibility: CapitalEligibility;
};

export default function useCapitalReadiness(tenantId?: string, reconcile = false) {
  const [data, setData] = useState<CapitalReadinessPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setData(null);
      return null;
    }

    setLoading(true);
    setError('');

    try {
      const response = await getCapitalReadiness(tenantId, reconcile);
      const next: CapitalReadinessPayload = {
        tenant_id: response.tenant_id,
        readiness: response.readiness,
        profile: response.profile,
        allocation: response.allocation,
        eligibility: response.eligibility,
      };
      setData(next);
      return next;
    } catch (err: any) {
      setError(String(err?.message || 'Unable to load capital readiness.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [reconcile, tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data,
    loading,
    error,
    refresh,
  };
}
