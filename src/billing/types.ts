export type PlanCode = 'FREE' | 'GROWTH' | 'PREMIUM';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled';
export type BillingProvider = 'stripe' | 'manual';

export type FeatureKey =
  | 'DISPUTE_LETTERS'
  | 'ROADMAP'
  | 'BUSINESS_FORMATION'
  | 'FUNDING_SEQUENCE'
  | 'DOCUPOST_MAILING'
  | 'GRANTS'
  | 'SBA_PREP'
  | 'INVESTMENT_LIBRARY';

export interface MembershipPlan {
  id: string;
  code: PlanCode;
  price_cents: number;
  is_active: boolean;
}

export interface SubscriptionRecord {
  id: string;
  user_id: string;
  tenant_id: string | null;
  plan_code: PlanCode;
  status: SubscriptionStatus;
  provider: BillingProvider;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionEvent {
  id: string;
  subscription_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}
