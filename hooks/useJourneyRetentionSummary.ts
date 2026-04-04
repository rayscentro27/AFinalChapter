import { useEffect, useState } from 'react';
import { getJourneyRetentionSummary, JourneyRetentionSummary } from '../src/services/journeyRetentionService';

export default function useJourneyRetentionSummary(tenantId?: string, userId?: string) {
  const [data, setData] = useState<JourneyRetentionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!tenantId) {
        setData(null);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const summary = await getJourneyRetentionSummary(tenantId, userId);
        if (!active) return;
        setData(summary);
      } catch (err: any) {
        if (!active) return;
        setError(String(err?.message || 'Unable to load retention summary.'));
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [tenantId, userId]);

  return {
    data,
    loading,
    error,
  };
}
