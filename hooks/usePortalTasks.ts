import { useCallback, useEffect, useState } from 'react';
import {
  PortalTasksResponse,
  getPortalTasks,
} from '../services/fundingFoundationService';

export default function usePortalTasks(tenantId?: string, reconcile = false) {
  const [data, setData] = useState<PortalTasksResponse | null>(null);
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
      const response = await getPortalTasks(tenantId, { reconcile });
      setData(response);
      return response;
    } catch (err: any) {
      setError(String(err?.message || 'Unable to load portal tasks.'));
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
