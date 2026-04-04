import { useCallback, useEffect, useState } from 'react';
import { getCreditWorkflowSnapshot, CreditWorkflowSnapshot } from '../services/creditWorkflowService';

export default function useCreditWorkflow(input: { tenantId?: string; userId?: string }) {
  const { tenantId, userId } = input;
  const [data, setData] = useState<CreditWorkflowSnapshot>({
    packets: [],
    finalizedLetters: [],
    mailEvents: [],
    mailPackets: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!userId) {
      setData({ packets: [], finalizedLetters: [], mailEvents: [], mailPackets: [] });
      return null;
    }

    setLoading(true);
    setError('');
    try {
      const snapshot = await getCreditWorkflowSnapshot({ tenantId, userId });
      setData(snapshot);
      return snapshot;
    } catch (err: any) {
      setError(String(err?.message || 'Unable to load credit workflow.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [tenantId, userId]);

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
