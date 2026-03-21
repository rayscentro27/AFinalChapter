import { useCallback, useState } from 'react';
import {
  PortalAiResponse,
  PortalAiRole,
  getPortalAiResponse,
} from '../services/fundingFoundationService';

export default function usePortalAI(tenantId?: string, role: PortalAiRole = 'funding_guide') {
  const [data, setData] = useState<PortalAiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const ask = useCallback(
    async (input: { coaching_goal?: string; user_message?: string }) => {
      if (!tenantId) return null;
      setLoading(true);
      setError('');
      try {
        const response = await getPortalAiResponse({
          tenant_id: tenantId,
          role,
          coaching_goal: input.coaching_goal,
          user_message: input.user_message,
        });
        setData(response);
        return response;
      } catch (err: any) {
        setError(String(err?.message || 'Unable to generate portal guidance.'));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [role, tenantId]
  );

  return {
    data,
    loading,
    error,
    ask,
  };
}
