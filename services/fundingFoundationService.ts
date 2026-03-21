import { supabase } from '../lib/supabaseClient';

const BASE = '/.netlify/functions';

type RequestInitExt = RequestInit & { timeoutMs?: number };

export type FundingDecisionStatus = 'submitted' | 'approved' | 'denied' | 'pending' | 'cancelled';
export type PortalAiRole = 'funding_guide' | 'credit_advisor' | 'business_setup_advisor' | 'trading_coach';

export type FundingRoadmapResponse = {
  ok: boolean;
  tenant_id: string;
  stage: string;
  readiness: {
    ready: boolean;
    blockers: string[];
    recommended_next_steps: string[];
    context: Record<string, unknown>;
  };
  recommendation: {
    ready: boolean;
    current_stage: string;
    top_recommendation: {
      key: string;
      title: string;
      action: string;
    } | null;
    blockers: string[];
    reasoning_summary: string;
    follow_up_actions: string[];
  };
  strategy_steps: any[];
  applications: any[];
  results: any[];
  legacy_outcomes: any[];
};

export type PortalTasksResponse = {
  ok: boolean;
  tenant_id: string;
  top_task: any | null;
  urgent: any[];
  recommended: any[];
  completed: any[];
};

export type CreditAnalysisResponse = {
  ok: boolean;
  tenant_id: string;
  latest_report: any | null;
  latest_analysis: any | null;
  analyses: any[];
};

export type CreditRecommendationsResponse = {
  ok: boolean;
  tenant_id: string;
  recommendations: any[];
};

export type CreditLettersResponse = {
  ok: boolean;
  tenant_id: string;
  letters: any[];
};

export type BusinessFoundationProfileResponse = {
  ok: boolean;
  tenant_id: string;
  profile: any | null;
  progress: any[];
  readiness: {
    ready: boolean;
    path: 'new_business' | 'existing_business_optimization' | null;
    completed_steps: string[];
    missing_steps: string[];
    blockers: string[];
    supporting: Record<string, unknown>;
  };
  supporting?: Record<string, unknown>;
};

export type FundingHistoryResponse = {
  ok: boolean;
  tenant_id: string;
  applications: any[];
  results: any[];
  legacy_outcomes: any[];
};

export type FundingNextStepResponse = {
  ok: boolean;
  tenant_id: string;
  stage: string;
  ready: boolean;
  recommendation: FundingRoadmapResponse['recommendation'];
  blockers: string[];
  follow_up_actions: string[];
  readiness: FundingRoadmapResponse['readiness'];
};

export type PortalAiResponse = {
  ok: boolean;
  tenant_id: string;
  role: PortalAiRole;
  answer: string;
  context_meta: {
    stage: string;
    blockers_count: number;
    context_hash: string;
    model: string;
  };
};

async function authHeaders(): Promise<Record<string, string>> {
  const sessionRes = await supabase.auth.getSession();
  const token = String(sessionRes.data.session?.access_token || '').trim();
  if (!token) {
    throw new Error('Sign in required.');
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

async function requestJson<T>(url: string, init: RequestInitExt): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), init.timeoutMs || 20000);
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

function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const s = query.toString();
  return s ? `?${s}` : '';
}

function ensureOk<T extends { ok?: boolean }>(payload: T, fallback: string): T {
  if (!payload?.ok) throw new Error(fallback);
  return payload;
}

export async function getCreditAnalysis(tenantId?: string): Promise<CreditAnalysisResponse> {
  const headers = await authHeaders();
  const payload = await requestJson<CreditAnalysisResponse>(
    `${BASE}/credit-analysis${queryString({ tenant_id: tenantId })}`,
    { method: 'GET', headers }
  );
  return ensureOk(payload, 'Unable to load credit analysis.');
}

export async function getCreditRecommendations(tenantId?: string): Promise<CreditRecommendationsResponse> {
  const headers = await authHeaders();
  const payload = await requestJson<CreditRecommendationsResponse>(
    `${BASE}/credit-recommendations${queryString({ tenant_id: tenantId })}`,
    { method: 'GET', headers }
  );
  return ensureOk(payload, 'Unable to load credit recommendations.');
}

export async function getCreditLetters(tenantId?: string): Promise<CreditLettersResponse> {
  const headers = await authHeaders();
  const payload = await requestJson<CreditLettersResponse>(
    `${BASE}/credit-letters${queryString({ tenant_id: tenantId })}`,
    { method: 'GET', headers }
  );
  return ensureOk(payload, 'Unable to load dispute letters.');
}

export async function generateCreditLetter(input: {
  tenant_id?: string;
  recommendation_id?: string;
  title?: string;
  summary?: string;
}): Promise<{ ok: boolean; tenant_id: string; letter: any }> {
  const headers = await authHeaders();
  const payload = await requestJson<{ ok: boolean; tenant_id: string; letter: any }>(`${BASE}/credit-generate-letter`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  return ensureOk(payload, 'Unable to generate dispute letter draft.');
}

export async function getBusinessFoundationProfile(tenantId?: string): Promise<BusinessFoundationProfileResponse> {
  const headers = await authHeaders();
  const payload = await requestJson<BusinessFoundationProfileResponse>(
    `${BASE}/business-foundation-profile${queryString({ tenant_id: tenantId })}`,
    { method: 'GET', headers }
  );
  return ensureOk(payload, 'Unable to load business foundation profile.');
}

export async function setBusinessFoundationPath(input: {
  tenant_id?: string;
  business_path: 'new_business' | 'existing_business_optimization';
}): Promise<BusinessFoundationProfileResponse> {
  const headers = await authHeaders();
  const payload = await requestJson<BusinessFoundationProfileResponse>(`${BASE}/business-foundation-path`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  return ensureOk(payload, 'Unable to save business path.');
}

export async function setBusinessFoundationProgress(input: {
  tenant_id?: string;
  step_key: string;
  step_status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  is_required?: boolean;
  notes?: string | null;
}): Promise<BusinessFoundationProfileResponse> {
  const headers = await authHeaders();
  const payload = await requestJson<BusinessFoundationProfileResponse>(`${BASE}/business-foundation-progress`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  return ensureOk(payload, 'Unable to update business foundation progress.');
}

export async function getBusinessFoundationReadiness(tenantId?: string): Promise<BusinessFoundationProfileResponse> {
  const headers = await authHeaders();
  const payload = await requestJson<BusinessFoundationProfileResponse>(
    `${BASE}/business-foundation-readiness${queryString({ tenant_id: tenantId })}`,
    { method: 'GET', headers }
  );
  return ensureOk(payload, 'Unable to load business foundation readiness.');
}

export async function getFundingRoadmap(tenantId?: string, reconcile = false): Promise<FundingRoadmapResponse> {
  const headers = await authHeaders();
  const payload = await requestJson<FundingRoadmapResponse>(
    `${BASE}/funding-roadmap${queryString({ tenant_id: tenantId, reconcile })}`,
    { method: 'GET', headers }
  );
  return ensureOk(payload, 'Unable to load funding roadmap.');
}

export async function getFundingNextStep(tenantId?: string, reconcile = false): Promise<FundingNextStepResponse> {
  const headers = await authHeaders();
  const payload = await requestJson<FundingNextStepResponse>(
    `${BASE}/funding-next-step${queryString({ tenant_id: tenantId, reconcile })}`,
    { method: 'GET', headers }
  );
  return ensureOk(payload, 'Unable to load next funding recommendation.');
}

export async function getFundingHistory(tenantId?: string): Promise<FundingHistoryResponse> {
  const headers = await authHeaders();
  const payload = await requestJson<FundingHistoryResponse>(
    `${BASE}/funding-history${queryString({ tenant_id: tenantId })}`,
    { method: 'GET', headers }
  );
  return ensureOk(payload, 'Unable to load funding history.');
}

export async function logFundingApplyEvent(input: {
  tenant_id?: string;
  provider_name?: string;
  product_name?: string;
  bureau_used?: string;
  submitted_at?: string;
  decision_status?: FundingDecisionStatus;
  approved_amount?: number | null;
  notes?: string | null;
  inquiry_detected?: boolean | null;
  related_strategy_step_id?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; tenant_id: string; apply_log: any }> {
  const headers = await authHeaders();
  const payload = await requestJson<{ ok: boolean; tenant_id: string; apply_log: any }>(`${BASE}/funding-apply-log`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  return ensureOk(payload, 'Unable to log funding application result.');
}

export async function getPortalTasks(
  tenantId?: string,
  options: { reconcile?: boolean } = {}
): Promise<PortalTasksResponse> {
  const headers = await authHeaders();
  const payload = await requestJson<PortalTasksResponse>(
    `${BASE}/portal-tasks${queryString({ tenant_id: tenantId, reconcile: options.reconcile })}`,
    { method: 'GET', headers }
  );
  return ensureOk(payload, 'Unable to load portal tasks.');
}

export async function getPortalAiResponse(input: {
  tenant_id?: string;
  role: PortalAiRole;
  coaching_goal?: string;
  user_message?: string;
}): Promise<PortalAiResponse> {
  const headers = await authHeaders();
  const payload = await requestJson<PortalAiResponse>(`${BASE}/portal-ai-respond`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    timeoutMs: 30000,
  });
  return ensureOk(payload, 'Unable to generate AI guidance.');
}
