import { supabase } from '../../lib/supabaseClient';
import { PlanCode, SubscriptionStatus, TierCode } from './types';

export type UserTierState = {
  tier: PlanCode;
  status: SubscriptionStatus;
  subscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
};

const TIER_RANK: Record<PlanCode, number> = {
  FREE: 0,
  GROWTH: 1,
  PREMIUM: 2,
};

function normalizeTier(value: unknown): PlanCode {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'growth') return 'GROWTH';
  if (raw === 'premium') return 'PREMIUM';
  if (raw === 'free') return 'FREE';

  const upper = String(value || '').trim().toUpperCase();
  if (upper === 'GROWTH' || upper === 'PREMIUM' || upper === 'FREE') return upper as PlanCode;
  return 'FREE';
}

function normalizeStatus(value: unknown): SubscriptionStatus {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'active' || raw === 'trialing' || raw === 'past_due' || raw === 'canceled' || raw === 'incomplete') {
    return raw as SubscriptionStatus;
  }
  return 'active';
}

export function hasTierAccess(currentTier: PlanCode, requiredTier: PlanCode): boolean {
  return TIER_RANK[currentTier] >= TIER_RANK[requiredTier];
}

export function isSubscriptionEntitled(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

export async function getUserTier(userId: string): Promise<UserTierState> {
  if (!userId) {
    return {
      tier: 'FREE',
      status: 'active',
      subscriptionId: null,
      cancelAtPeriodEnd: false,
    };
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('id,tier,plan_code,status,cancel_at_period_end')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      tier: 'FREE',
      status: 'active',
      subscriptionId: null,
      cancelAtPeriodEnd: false,
    };
  }

  const dbTier = normalizeTier((data as { tier?: TierCode | null; plan_code?: PlanCode | null }).tier || data.plan_code);

  return {
    tier: dbTier,
    status: normalizeStatus((data as { status?: SubscriptionStatus }).status),
    subscriptionId: ((data as { id?: string }).id || null),
    cancelAtPeriodEnd: Boolean((data as { cancel_at_period_end?: boolean }).cancel_at_period_end),
  };
}
