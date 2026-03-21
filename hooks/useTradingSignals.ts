import { useCallback, useEffect, useState } from 'react';
import { getTradingSignals, TradingSignal } from '../services/tradingSignalsService';

type TradingSignalFilters = {
  symbol?: string;
  market_type?: string;
  timeframe?: string;
  limit?: number;
  offset?: number;
};

export default function useTradingSignals(enabled = true, initialFilters: TradingSignalFilters = {}) {
  const [filters, setFilters] = useState<TradingSignalFilters>({
    limit: 20,
    offset: 0,
    ...initialFilters,
  });
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!enabled) {
      setSignals([]);
      setCount(0);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = await getTradingSignals(filters);
      setSignals(payload.data || []);
      setCount(Number(payload.count || 0));
    } catch (err: any) {
      setError(String(err?.message || 'Unable to load approved signals.'));
      setSignals([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [enabled, filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    filters,
    setFilters,
    signals,
    count,
    loading,
    error,
    refresh,
  };
}
