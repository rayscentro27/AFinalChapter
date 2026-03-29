export type PlanCode = 'FREE' | 'GROWTH' | 'PREMIUM';
export type TierCode = 'free' | 'growth' | 'premium';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
export type BillingProvider = 'stripe' | 'manual';

export type FeatureKey =
  | 'DISPUTE_LETTERS'
  | 'ROADMAP'
  | 'BUSINESS_FORMATION'
  | 'FUNDING_SEQUENCE'
  | 'DOCUPOST_MAILING'
  | 'FUNDING_RESEARCH'
  | 'FUNDING_OUTCOMES'
  | 'GRANTS'
  | 'SBA_PREP'
  | 'LENDER_ROOM'
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
  tier?: TierCode | null;
  status: SubscriptionStatus;
  provider: BillingProvider;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  cancel_at_period_end?: boolean | null;
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
