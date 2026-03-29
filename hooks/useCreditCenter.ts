import { useCallback, useEffect, useState } from 'react';
import {
  CreditAnalysisResponse,
  CreditLettersResponse,
  CreditRecommendationsResponse,
  generateCreditLetter,
  getCreditAnalysis,
  getCreditLetters,
  getCreditRecommendations,
} from '../services/fundingFoundationService';

type CreditCenterData = {
  analysis: CreditAnalysisResponse | null;
  recommendations: CreditRecommendationsResponse | null;
  letters: CreditLettersResponse | null;
};

export default function useCreditCenter(tenantId?: string) {
  const [data, setData] = useState<CreditCenterData>({
    analysis: null,
    recommendations: null,
    letters: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setData({ analysis: null, recommendations: null, letters: null });
      return null;
    }

    setLoading(true);
    setError('');
    try {
      const [analysis, recommendations, letters] = await Promise.all([
        getCreditAnalysis(tenantId),
        getCreditRecommendations(tenantId),
        getCreditLetters(tenantId),
      ]);

      const next = { analysis, recommendations, letters };
      setData(next);
      return next;
    } catch (err: any) {
      setError(String(err?.message || 'Unable to load credit center.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const createLetter = useCallback(
    async (input: { recommendation_id?: string; title?: string; summary?: string }) => {
      if (!tenantId) return null;
      setSaving(true);
      setError('');
      try {
        const result = await generateCreditLetter({
          tenant_id: tenantId,
          recommendation_id: input.recommendation_id,
          title: input.title,
          summary: input.summary,
        });
        await refresh();
        return result.letter;
      } catch (err: any) {
        setError(String(err?.message || 'Unable to generate dispute letter.'));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [refresh, tenantId]
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
    createLetter,
  };
}
