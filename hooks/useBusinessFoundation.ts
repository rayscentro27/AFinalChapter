import { useCallback, useEffect, useState } from 'react';
import {
  BusinessFoundationProfileResponse,
  getBusinessFoundationProfile,
  setBusinessFoundationPath,
  setBusinessFoundationProgress,
  updateBusinessFoundationProfile,
} from '../services/fundingFoundationService';

export default function useBusinessFoundation(tenantId?: string) {
  const [data, setData] = useState<BusinessFoundationProfileResponse | null>(null);
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
      const response = await getBusinessFoundationProfile(tenantId);
      setData(response);
      return response;
    } catch (err: any) {
      setError(String(err?.message || 'Unable to load business foundation.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const setPath = useCallback(
    async (path: 'new_business' | 'existing_business_optimization') => {
      if (!tenantId) return null;
      setSaving(true);
      setError('');
      try {
        const response = await setBusinessFoundationPath({
          tenant_id: tenantId,
          business_path: path,
        });
        setData(response);
        return response;
      } catch (err: any) {
        setError(String(err?.message || 'Unable to save business path.'));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [tenantId]
  );

  const setProgress = useCallback(
    async (input: {
      step_key: string;
      step_status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
      notes?: string | null;
      is_required?: boolean;
    }) => {
      if (!tenantId) return null;
      setSaving(true);
      setError('');
      try {
        const response = await setBusinessFoundationProgress({
          tenant_id: tenantId,
          step_key: input.step_key,
          step_status: input.step_status,
          notes: input.notes,
          is_required: input.is_required,
        });
        setData(response);
        return response;
      } catch (err: any) {
        setError(String(err?.message || 'Unable to update business step.'));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [tenantId]
  );

  const updateProfile = useCallback(
    async (input: {
      legal_name?: string | null;
      entity_type?: string | null;
      ein?: string | null;
      business_address?: string | null;
      business_phone?: string | null;
      business_website?: string | null;
      naics_code?: string | null;
      business_email?: string | null;
      mission_statement?: string | null;
      business_plan_summary?: string | null;
      bank_name?: string | null;
      account_type?: string | null;
      profile_status?: 'not_started' | 'in_progress' | 'ready' | 'completed' | null;
      metadata_patch?: Record<string, unknown> | null;
    }) => {
      if (!tenantId) return null;
      setSaving(true);
      setError('');
      try {
        const response = await updateBusinessFoundationProfile({
          tenant_id: tenantId,
          ...input,
        });
        setData(response);
        return response;
      } catch (err: any) {
        setError(String(err?.message || 'Unable to update business profile.'));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data,
    loading,
    saving,
    error,
    refresh,
    setPath,
    setProgress,
    updateProfile,
  };
}
