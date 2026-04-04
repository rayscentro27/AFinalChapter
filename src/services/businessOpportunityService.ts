import { supabase } from '../../lib/supabaseClient';

export type BusinessOpportunityMatchRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  opportunity_id: string;
  status: 'recommended' | 'saved' | 'started' | 'dismissed' | 'completed';
  match_score: number;
  funding_fit_score: number;
  difficulty_fit_score: number;
  readiness_fit_score: number;
  grant_boost_score: number;
  startup_cost_penalty: number;
  estimated_funding_min_cents: number | null;
  estimated_funding_max_cents: number | null;
  reasons: Array<{ code: string; detail: string }>;
  source_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  business_opportunities?: {
    id: string;
    slug: string;
    name: string;
    category: string;
    opportunity_type: string;
    summary_md: string;
    difficulty_level: string;
    startup_cost_min_cents: number;
    startup_cost_max_cents: number;
    time_to_revenue_days: number | null;
    recommended_funding_min_cents: number | null;
    recommended_funding_max_cents: number | null;
    metadata: Record<string, unknown>;
  } | null;
};

export type BusinessOpportunityMatchesResponse = {
  ok: boolean;
  tenant_id: string;
  readiness_score: number;
  estimated_funding: {
    min: number;
    max: number;
    unlocked: boolean;
  };
  matches: BusinessOpportunityMatchRow[];
  matching_rules: {
    signals: string[];
    scoring: string[];
  };
};

export async function getBusinessOpportunityMatches(tenantId?: string): Promise<BusinessOpportunityMatchesResponse> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in required.');

  const query = new URLSearchParams();
  if (tenantId) query.set('tenant_id', tenantId);

  const response = await fetch(`/.netlify/functions/business-opportunity-matches${query.toString() ? `?${query.toString()}` : ''}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as any)?.error || 'Unable to load business opportunity matches.'));
  }

  return payload as BusinessOpportunityMatchesResponse;
}
