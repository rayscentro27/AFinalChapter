import { useCallback, useEffect, useState } from 'react';
import { BusinessOpportunityMatchesResponse, getBusinessOpportunityMatches } from '../src/services/businessOpportunityService';

export default function useBusinessOpportunityMatches(tenantId?: string) {
  const [data, setData] = useState<BusinessOpportunityMatchesResponse | null>(null);
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
      const next = await getBusinessOpportunityMatches(tenantId);
      setData(next);
      return next;
    } catch (err: any) {
      setError(String(err?.message || 'Unable to load business opportunity matches.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

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
