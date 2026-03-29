import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CapitalAllocationState,
  CapitalEligibility,
  CapitalProfile,
  CapitalReadiness,
  CapitalStepItem,
  CapitalStepStatus,
  getCapitalProfile,
  updateCapitalProfile,
  updateCapitalSetupProgress,
} from '../services/capitalAccessService';

export type CapitalProfilePayload = {
  tenant_id: string;
  profile: CapitalProfile | null;
  setup_progress: CapitalStepItem[];
  readiness: CapitalReadiness;
  allocation: CapitalAllocationState;
  eligibility: CapitalEligibility;
};

export default function useCapitalProfile(tenantId?: string) {
  const [data, setData] = useState<CapitalProfilePayload | null>(null);
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
      const response = await getCapitalProfile(tenantId, false);
      const next: CapitalProfilePayload = {
        tenant_id: response.tenant_id,
        profile: response.profile,
        setup_progress: response.setup_progress,
        readiness: response.readiness,
        allocation: response.allocation,
        eligibility: response.eligibility,
      };
      setData(next);
      return next;
    } catch (err: any) {
      setError(String(err?.message || 'Unable to load capital profile.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateProfileValues = useCallback(
    async (input: {
      total_funding_received?: number | null;
      estimated_monthly_payment?: number | null;
      reserve_target_months?: number | null;
      recommended_reserve_amount?: number | null;
      reserve_confirmed?: boolean;
      reserve_confirmed_at?: string | null;
      business_growth_positioned?: boolean;
      capital_setup_status?: 'not_started' | 'in_progress' | 'ready' | 'completed' | 'blocked' | null;
      metadata?: Record<string, unknown>;
    }) => {
      if (!tenantId) return null;
      setSaving(true);
      setError('');
      try {
        const response = await updateCapitalProfile({
          tenant_id: tenantId,
          ...input,
          reconcile: true,
        });

        const next: CapitalProfilePayload = {
          tenant_id: response.tenant_id,
          profile: response.profile,
          setup_progress: response.setup_progress,
          readiness: response.readiness,
          allocation: response.allocation,
          eligibility: response.eligibility,
        };
        setData(next);
        return next;
      } catch (err: any) {
        setError(String(err?.message || 'Unable to update capital profile.'));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [tenantId]
  );

  const updateStep = useCallback(
    async (stepKey: string, stepStatus: CapitalStepStatus, notes?: string | null) => {
      if (!tenantId) return null;
      setSaving(true);
      setError('');

      try {
        const response = await updateCapitalSetupProgress({
          tenant_id: tenantId,
          step_key: stepKey,
          step_status: stepStatus,
          notes,
          reconcile: true,
        });

        const next: CapitalProfilePayload = {
          tenant_id: response.tenant_id,
          profile: response.profile,
          setup_progress: response.setup_progress,
          readiness: response.readiness,
          allocation: response.allocation,
          eligibility: response.eligibility,
        };
        setData(next);
        return next;
      } catch (err: any) {
        setError(String(err?.message || 'Unable to update setup step.'));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [tenantId]
  );

  const setReserveConfirmed = useCallback(
    async (confirmed: boolean) => {
      return updateProfileValues({
        reserve_confirmed: confirmed,
        reserve_confirmed_at: confirmed ? new Date().toISOString() : null,
      });
    },
    [updateProfileValues]
  );

  const reserveDefaults = useMemo(() => {
    return {
      total_funding_received:
        data?.profile?.total_funding_received ?? data?.readiness.reserve_guidance.total_funding_received ?? null,
      estimated_monthly_payment:
        data?.profile?.estimated_monthly_payment ?? data?.readiness.reserve_guidance.estimated_monthly_payment ?? null,
      reserve_target_months:
        data?.profile?.reserve_target_months ?? data?.readiness.reserve_guidance.reserve_target_months ?? 6,
      recommended_reserve_amount:
        data?.profile?.recommended_reserve_amount ??
        data?.readiness.reserve_guidance.recommended_reserve_amount ??
        null,
      reserve_confirmed:
        data?.profile?.reserve_confirmed ?? data?.readiness.reserve_guidance.reserve_confirmed ?? false,
    };
  }, [
    data?.profile?.estimated_monthly_payment,
    data?.profile?.recommended_reserve_amount,
    data?.profile?.reserve_confirmed,
    data?.profile?.reserve_target_months,
    data?.profile?.total_funding_received,
    data?.readiness.reserve_guidance.estimated_monthly_payment,
    data?.readiness.reserve_guidance.recommended_reserve_amount,
    data?.readiness.reserve_guidance.reserve_confirmed,
    data?.readiness.reserve_guidance.reserve_target_months,
    data?.readiness.reserve_guidance.total_funding_received,
  ]);

  return {
    data,
    loading,
    saving,
    error,
    refresh,
    updateProfileValues,
    updateStep,
    setReserveConfirmed,
    reserveDefaults,
  };
}
