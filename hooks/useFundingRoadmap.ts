import { useCallback, useEffect, useState } from 'react';
import {
  FundingRoadmapResponse,
  getFundingRoadmap,
} from '../services/fundingFoundationService';

export default function useFundingRoadmap(tenantId?: string, reconcile = false) {
  const [data, setData] = useState<FundingRoadmapResponse | null>(null);
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
      const response = await getFundingRoadmap(tenantId, reconcile);
      setData(response);
      return response;
    } catch (err: any) {
      setError(String(err?.message || 'Unable to load funding roadmap.'));
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
