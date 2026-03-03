import { FeatureKey, PlanCode, SubscriptionStatus } from './types';

const PLAN_RANK: Record<PlanCode, number> = {
  FREE: 0,
  GROWTH: 1,
  PREMIUM: 2,
};

const FEATURE_MIN_PLAN: Record<FeatureKey, PlanCode> = {
  DISPUTE_LETTERS: 'FREE',
  ROADMAP: 'FREE',
  BUSINESS_FORMATION: 'GROWTH',
  DOCUPOST_MAILING: 'GROWTH',
  GRANTS: 'GROWTH',
  FUNDING_SEQUENCE: 'PREMIUM',
  SBA_PREP: 'PREMIUM',
  INVESTMENT_LIBRARY: 'PREMIUM',
};

const FUNDING_FEATURES_REQUIRING_DISCLOSURE: FeatureKey[] = ['FUNDING_SEQUENCE', 'SBA_PREP'];

function isSubscriptionActive(status: SubscriptionStatus | null | undefined): boolean {
  return status === 'active' || status === 'trialing';
}

export type EntitlementUser = {
  plan_code?: PlanCode | null;
  subscription_status?: SubscriptionStatus | null;
  commission_disclosure_accepted?: boolean;
};

export function canAccessFeature(user: EntitlementUser | null, featureKey: FeatureKey): boolean {
  const requiredPlan = FEATURE_MIN_PLAN[featureKey];
  const currentPlan = user?.plan_code || 'FREE';
  const subscriptionStatus = user?.subscription_status || 'active';

  if (requiredPlan !== 'FREE' && !isSubscriptionActive(subscriptionStatus)) {
    return false;
  }

  if (PLAN_RANK[currentPlan] < PLAN_RANK[requiredPlan]) {
    return false;
  }

  if (
    FUNDING_FEATURES_REQUIRING_DISCLOSURE.includes(featureKey)
    && PLAN_RANK[currentPlan] >= PLAN_RANK.PREMIUM
    && !user?.commission_disclosure_accepted
  ) {
    return false;
  }

  return true;
}
