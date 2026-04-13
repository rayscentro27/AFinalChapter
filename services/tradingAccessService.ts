import { supabase } from '../lib/supabaseClient';

const BASE = '/.netlify/functions';

export type TradingAccessSnapshot = {
  tenant_id: string;
  user_id: string;
  feature_key: string;
  eligible: boolean;
  blockers: string[];
  unlocked: boolean;
  opted_in: boolean;
  video_complete: boolean;
  disclaimer_complete: boolean;
  access_ready: boolean;
  access_status: 'locked' | 'eligible_pending' | 'in_progress' | 'ready' | 'unlocked';
  disclaimer_version: string;
  intro_video_url: string | null;
  intro_video_watched_at: string | null;
  disclaimer_accepted_at: string | null;
  selected_allocation_path: 'business_growth' | 'trading_education' | 'grant_funding' | null;
  paper_trading_recommended: boolean;
  reserve_confirmed: boolean;
  business_growth_positioned: boolean;
  trading_access_tier: 'super_admin' | 'internal_operator' | 'client_basic' | 'client_intermediate' | 'client_advanced';
  trading_stage: 'education_only' | 'paper_trading' | 'strategy_view' | 'demo_broker_enabled' | 'admin_lab_full';
  admin_lab_enabled: boolean;
  strategy_access_allowed: boolean;
  demo_connection_allowed: boolean;
  trading_level: number;
  updated_at: string | null;
};

type TradingAccessResponse = {
  ok: boolean;
  tenant_id: string;
  access: TradingAccessSnapshot;
  error?: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const sessionRes = await supabase.auth.getSession();
  const token = String(sessionRes.data.session?.access_token || '').trim();
  if (!token) {
    throw new Error('Sign in required to access trading tools.');
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
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
}

function ensureAccess(payload: TradingAccessResponse): TradingAccessSnapshot {
  if (!payload?.ok || !payload?.access) {
    throw new Error(String(payload?.error || 'Unable to load trading access state.'));
  }
  return payload.access;
}

export async function getTradingAccess(tenantId?: string, reconcile = true): Promise<TradingAccessSnapshot> {
  const headers = await authHeaders();
  const query = new URLSearchParams();
  if (tenantId) query.set('tenant_id', tenantId);
  if (reconcile) query.set('reconcile', 'true');

  const payload = await requestJson<TradingAccessResponse>(`${BASE}/trading-access?${query.toString()}`, {
    method: 'GET',
    headers,
  });

  return ensureAccess(payload);
}

export async function optInAdvancedTrading(input: {
  tenant_id?: string;
  opted_in?: boolean;
  reconcile?: boolean;
} = {}): Promise<TradingAccessSnapshot> {
  const headers = await authHeaders();
  const payload = await requestJson<TradingAccessResponse>(`${BASE}/trading-opt-in`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenant_id: input.tenant_id,
      opted_in: input.opted_in ?? true,
      reconcile: input.reconcile ?? true,
    }),
  });

  return ensureAccess(payload);
}

export async function markTradingOverviewComplete(input: {
  tenant_id?: string;
  completed?: boolean;
  intro_video_url?: string;
  reconcile?: boolean;
} = {}): Promise<TradingAccessSnapshot> {
  const headers = await authHeaders();
  const payload = await requestJson<TradingAccessResponse>(`${BASE}/trading-video-complete`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenant_id: input.tenant_id,
      completed: input.completed ?? true,
      intro_video_url: input.intro_video_url,
      reconcile: input.reconcile ?? true,
    }),
  });

  return ensureAccess(payload);
}

export async function acceptTradingDisclaimer(input: {
  tenant_id?: string;
  accepted?: boolean;
  disclaimer_version?: string;
  reconcile?: boolean;
} = {}): Promise<TradingAccessSnapshot> {
  const headers = await authHeaders();
  const payload = await requestJson<TradingAccessResponse>(`${BASE}/trading-disclaimer-accept`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenant_id: input.tenant_id,
      accepted: input.accepted ?? true,
      disclaimer_version: input.disclaimer_version || 'trading-v1',
      reconcile: input.reconcile ?? true,
    }),
  });

  return ensureAccess(payload);
}
