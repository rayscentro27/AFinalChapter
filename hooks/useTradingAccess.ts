import { useCallback, useEffect, useState } from 'react';
import {
  TradingAccessSnapshot,
  acceptTradingDisclaimer,
  getTradingAccess,
  markTradingOverviewComplete,
  optInAdvancedTrading,
} from '../services/tradingAccessService';

type BusyAction = 'refresh' | 'opt_in' | 'video' | 'disclaimer' | null;

export default function useTradingAccess(tenantId?: string, options?: { reconcileOnFetch?: boolean }) {
  const [snapshot, setSnapshot] = useState<TradingAccessSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setSnapshot(null);
      return null;
    }

    setLoading(true);
    setError('');
    setBusyAction('refresh');
    try {
      const next = await getTradingAccess(tenantId, options?.reconcileOnFetch ?? true);
      setSnapshot(next);
      return next;
    } catch (err: any) {
      const msg = String(err?.message || 'Unable to load trading access state.');
      setError(msg);
      return null;
    } finally {
      setLoading(false);
      setBusyAction(null);
    }
  }, [tenantId, options?.reconcileOnFetch]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const optIn = useCallback(async () => {
    if (!tenantId) return null;
    setError('');
    setBusyAction('opt_in');
    try {
      const next = await optInAdvancedTrading({ tenant_id: tenantId, opted_in: true, reconcile: true });
      setSnapshot(next);
      return next;
    } catch (err: any) {
      setError(String(err?.message || 'Unable to save opt-in status.'));
      return null;
    } finally {
      setBusyAction(null);
    }
  }, [tenantId]);

  const completeVideo = useCallback(async () => {
    if (!tenantId) return null;
    setError('');
    setBusyAction('video');
    try {
      const next = await markTradingOverviewComplete({ tenant_id: tenantId, completed: true, reconcile: true });
      setSnapshot(next);
      return next;
    } catch (err: any) {
      setError(String(err?.message || 'Unable to save video completion.'));
      return null;
    } finally {
      setBusyAction(null);
    }
  }, [tenantId]);

  const acceptDisclaimer = useCallback(async () => {
    if (!tenantId) return null;
    setError('');
    setBusyAction('disclaimer');
    try {
      const next = await acceptTradingDisclaimer({
        tenant_id: tenantId,
        accepted: true,
        disclaimer_version: snapshot?.disclaimer_version || 'trading-v1',
        reconcile: true,
      });
      setSnapshot(next);
      return next;
    } catch (err: any) {
      setError(String(err?.message || 'Unable to save disclaimer acknowledgement.'));
      return null;
    } finally {
      setBusyAction(null);
    }
  }, [tenantId, snapshot?.disclaimer_version]);

  return {
    snapshot,
    loading,
    error,
    busyAction,
    refresh,
    optIn,
    completeVideo,
    acceptDisclaimer,
  };
}
