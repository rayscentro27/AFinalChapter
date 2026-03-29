import { supabase } from '../lib/supabaseClient';

const BASE = '/.netlify/functions';

export type CapitalPath = 'business_growth' | 'trading_education' | 'grant_funding';
export type CapitalSetupStatus = 'not_started' | 'in_progress' | 'ready' | 'completed';
export type CapitalStepStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked';

export type CapitalStepItem = {
  step_key: string;
  status: CapitalStepStatus;
  notes: string | null;
  is_required: boolean;
};

export type CapitalReadiness = {
  ready: boolean;
  blockers: string[];
  recommended_next_steps: string[];
  reserve_guidance: {
    total_funding_received: number | null;
    estimated_monthly_payment: number | null;
    reserve_target_months: number;
    recommended_reserve_amount: number | null;
    reserve_confirmed: boolean;
    reserve_confirmed_at: string | null;
    reserve_gap_amount: number | null;
  };
  context: {
    post_funding_eligible: boolean;
    funding_stage: string | null;
    capital_profile_id: string | null;
    capital_setup_status: CapitalSetupStatus;
    missing_setup_steps: string[];
    completed_setup_steps: string[];
    selected_path: CapitalPath | null;
  };
};

export type CapitalEligibility = {
  eligible: boolean;
  funding_stage: string | null;
  latest_approved_application_id: string | null;
  approved_total_amount: number | null;
};

export type CapitalAllocationState = {
  selected_path: CapitalPath | null;
  selected_at: string | null;
  current_state: string | null;
  latest_choice: Record<string, unknown> | null;
  history: Record<string, unknown>[];
  options: Array<{
    path: CapitalPath;
    available: boolean;
    gated: boolean;
    reason: string | null;
  }>;
};

export type CapitalProfile = {
  id: string | null;
  total_funding_received: number | null;
  estimated_monthly_payment: number | null;
  recommended_reserve_amount: number | null;
  reserve_target_months: number;
  reserve_confirmed: boolean;
  reserve_confirmed_at: string | null;
  business_growth_positioned: boolean;
  capital_setup_status: CapitalSetupStatus;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

async function authHeaders(): Promise<Record<string, string>> {
  const sessionRes = await supabase.auth.getSession();
  const token = String(sessionRes.data.session?.access_token || '').trim();
  if (!token) {
    throw new Error('Sign in required to access capital tools.');
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

type CapitalReadinessResponse = {
  ok: boolean;
  tenant_id: string;
  readiness: CapitalReadiness;
  profile: CapitalProfile | null;
  allocation: CapitalAllocationState;
  eligibility: CapitalEligibility;
};

type CapitalProfileResponse = {
  ok: boolean;
  tenant_id: string;
  profile: CapitalProfile | null;
  setup_progress: CapitalStepItem[];
  readiness: CapitalReadiness;
  allocation: CapitalAllocationState;
  eligibility: CapitalEligibility;
};

type CapitalSetupProgressResponse = {
  ok: boolean;
  tenant_id: string;
  profile: CapitalProfile | null;
  progress: CapitalStepItem | null;
  setup_progress: CapitalStepItem[];
  readiness: CapitalReadiness;
  allocation: CapitalAllocationState;
  eligibility: CapitalEligibility;
};

type CapitalAllocationResponse = {
  ok: boolean;
  tenant_id: string;
  selected_path?: CapitalPath | null;
  gating_note?: string | null;
  allocation: CapitalAllocationState;
  readiness: CapitalReadiness;
  profile: CapitalProfile | null;
  eligibility: CapitalEligibility;
};

function ensureOk<T extends { ok?: boolean }>(payload: T, fallback: string): T {
  if (!payload?.ok) {
    throw new Error(fallback);
  }
  return payload;
}

export async function getCapitalReadiness(tenantId?: string, reconcile = false): Promise<CapitalReadinessResponse> {
  const headers = await authHeaders();
  const query = new URLSearchParams();
  if (tenantId) query.set('tenant_id', tenantId);
  if (reconcile) query.set('reconcile', 'true');

  const payload = await requestJson<CapitalReadinessResponse>(`${BASE}/capital-readiness?${query.toString()}`, {
    method: 'GET',
    headers,
  });

  return ensureOk(payload, 'Unable to load capital readiness.');
}

export async function getCapitalProfile(tenantId?: string, reconcile = false): Promise<CapitalProfileResponse> {
  const headers = await authHeaders();
  const query = new URLSearchParams();
  if (tenantId) query.set('tenant_id', tenantId);
  if (reconcile) query.set('reconcile', 'true');

  const payload = await requestJson<CapitalProfileResponse>(`${BASE}/capital-profile?${query.toString()}`, {
    method: 'GET',
    headers,
  });

  return ensureOk(payload, 'Unable to load capital profile.');
}

export async function updateCapitalProfile(input: {
  tenant_id?: string;
  total_funding_received?: number | null;
  estimated_monthly_payment?: number | null;
  reserve_target_months?: number | null;
  recommended_reserve_amount?: number | null;
  reserve_confirmed?: boolean;
  reserve_confirmed_at?: string | null;
  business_growth_positioned?: boolean;
  capital_setup_status?: CapitalSetupStatus | 'blocked' | null;
  metadata?: Record<string, unknown>;
  reconcile?: boolean;
}): Promise<CapitalProfileResponse> {
  const headers = await authHeaders();

  const payload = await requestJson<CapitalProfileResponse>(`${BASE}/capital-profile`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...input,
      reconcile: input.reconcile ?? true,
    }),
  });

  return ensureOk(payload, 'Unable to update capital profile.');
}

export async function updateCapitalSetupProgress(input: {
  tenant_id?: string;
  step_key?: string;
  step_status?: CapitalStepStatus;
  is_required?: boolean;
  notes?: string | null;
  total_funding_received?: number | null;
  estimated_monthly_payment?: number | null;
  reserve_target_months?: number | null;
  recommended_reserve_amount?: number | null;
  reserve_confirmed?: boolean;
  reserve_confirmed_at?: string | null;
  capital_setup_status?: CapitalSetupStatus | 'blocked' | null;
  metadata?: Record<string, unknown>;
  reconcile?: boolean;
}): Promise<CapitalSetupProgressResponse> {
  const headers = await authHeaders();

  const payload = await requestJson<CapitalSetupProgressResponse>(`${BASE}/capital-setup-progress`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...input,
      reconcile: input.reconcile ?? true,
    }),
  });

  return ensureOk(payload, 'Unable to update capital setup progress.');
}

export async function getCapitalAllocation(tenantId?: string, reconcile = false): Promise<CapitalAllocationResponse> {
  const headers = await authHeaders();
  const query = new URLSearchParams();
  if (tenantId) query.set('tenant_id', tenantId);
  if (reconcile) query.set('reconcile', 'true');

  const payload = await requestJson<CapitalAllocationResponse>(`${BASE}/capital-allocation?${query.toString()}`, {
    method: 'GET',
    headers,
  });

  return ensureOk(payload, 'Unable to load capital allocation.');
}

export async function setCapitalAllocation(input: {
  tenant_id?: string;
  selected_path: CapitalPath;
  metadata?: Record<string, unknown>;
  reconcile?: boolean;
}): Promise<CapitalAllocationResponse> {
  const headers = await authHeaders();

  const payload = await requestJson<CapitalAllocationResponse>(`${BASE}/capital-allocation`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...input,
      reconcile: input.reconcile ?? true,
    }),
  });

  return ensureOk(payload, 'Unable to set capital allocation path.');
}
