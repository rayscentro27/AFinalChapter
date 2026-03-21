import { supabase } from '../lib/supabaseClient';

const BASE = String((import.meta as any).env?.VITE_TRADING_SIGNALS_BASE_URL || '').trim();

export type TradingSignalReviewStatus = 'approved' | 'rejected' | 'expired' | 'pending' | 'published';

export type TradingSignal = {
  id: string;
  symbol: string;
  market_type: string;
  setup_type: string;
  direction: string;
  timeframe: string;
  headline: string;
  client_summary: string;
  why_it_matters: string;
  invalidation_note: string;
  confidence_label: string;
  risk_label: string;
  score_total: number | null;
  published_at: string | null;
  expires_at: string | null;
  review_status: TradingSignalReviewStatus;
};

export type TradingSignalsResponse = {
  data: TradingSignal[];
  count: number;
};

function endpoint(path: string): string {
  if (!BASE) return path;
  return `${BASE}${path}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const sessionRes = await supabase.auth.getSession();
  const token = String(sessionRes.data.session?.access_token || '').trim();
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function requestJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), init.timeoutMs || 12000);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(String(payload?.error || `Request failed (${response.status})`));
    }

    return payload as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getTradingSignals(input: {
  symbol?: string;
  market_type?: string;
  timeframe?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<TradingSignalsResponse> {
  const headers = await authHeaders();
  const query = new URLSearchParams();
  if (input.symbol) query.set('symbol', input.symbol);
  if (input.market_type) query.set('market_type', input.market_type);
  if (input.timeframe) query.set('timeframe', input.timeframe);
  query.set('limit', String(Math.max(1, Math.min(100, Number(input.limit || 20)))));
  query.set('offset', String(Math.max(0, Number(input.offset || 0))));

  const payload = await requestJson<TradingSignalsResponse>(endpoint(`/api/trading/signals?${query.toString()}`), {
    method: 'GET',
    headers,
    timeoutMs: 15000,
  });

  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    count: Number(payload?.count || 0),
  };
}

export async function getTradingSignalById(id: string): Promise<TradingSignal | null> {
  const signalId = String(id || '').trim();
  if (!signalId) return null;

  const headers = await authHeaders();
  const payload = await requestJson<{ data?: TradingSignal }>(endpoint(`/api/trading/signals/${encodeURIComponent(signalId)}`), {
    method: 'GET',
    headers,
    timeoutMs: 12000,
  });

  return payload?.data || null;
}
