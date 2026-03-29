function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function toDateOrNull(value) {
  const text = asText(value);
  if (!text) return null;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isPaidTier(subscription = {}) {
  const tier = asText(subscription.tier || subscription.plan_code).toLowerCase();
  return Boolean(tier) && tier !== 'free';
}

function isActivePaidSubscription(subscription = {}, now = new Date()) {
  const status = asText(subscription.status).toLowerCase();
  const activeStatus = status === 'active' || status === 'trialing';
  if (!activeStatus) return false;

  if (!isPaidTier(subscription)) return false;

  const periodEnd = toDateOrNull(subscription.current_period_end);
  if (!periodEnd) return true;
  return periodEnd.getTime() >= now.getTime();
}

function isOverrideWindowActive(override = {}, now = new Date()) {
  if (!override || !override.active) return false;

  const start = toDateOrNull(override.override_start || override.created_at);
  if (start && start.getTime() > now.getTime()) return false;

  const end = toDateOrNull(override.override_end || override.promo_expires_at);
  if (end && end.getTime() <= now.getTime()) return false;

  return true;
}

function chooseBestOverride(overrides = [], { userId = null, now = new Date() } = {}) {
  const uid = asText(userId) || null;
  const candidates = (Array.isArray(overrides) ? overrides : [])
    .filter((row) => isOverrideWindowActive(row, now))
    .filter((row) => {
      const rowUserId = asText(row?.user_id) || null;
      if (!uid) return rowUserId === null;
      return rowUserId === null || rowUserId === uid;
    })
    .sort((a, b) => {
      const aSpecificity = asText(a?.user_id) ? 1 : 0;
      const bSpecificity = asText(b?.user_id) ? 1 : 0;
      if (aSpecificity !== bSpecificity) return bSpecificity - aSpecificity;

      const aAt = toDateOrNull(a?.created_at)?.getTime() || 0;
      const bAt = toDateOrNull(b?.created_at)?.getTime() || 0;
      return bAt - aAt;
    });

  return candidates[0] || null;
}

export function resolveMembershipAccess({
  subscription = null,
  overrides = [],
  user_id = null,
  now = new Date(),
} = {}) {
  const activeOverride = chooseBestOverride(overrides, { userId: user_id, now });
  if (activeOverride) {
    const type = asText(activeOverride.override_type).toLowerCase();
    if (type === 'promo') {
      return {
        access_allowed: true,
        source: 'active_promotion',
        reason: 'promotion_override_active',
        active_override: activeOverride,
      };
    }

    return {
      access_allowed: true,
      source: 'active_override',
      reason: 'membership_override_active',
      active_override: activeOverride,
    };
  }

  if (isActivePaidSubscription(subscription || {}, now)) {
    return {
      access_allowed: true,
      source: 'active_paid_subscription',
      reason: 'paid_subscription_active',
      active_override: null,
    };
  }

  return {
    access_allowed: false,
    source: 'expired_subscription',
    reason: subscription ? 'subscription_not_active_or_not_paid' : 'no_subscription',
    active_override: null,
  };
}

export const _private = {
  isPaidTier,
  isActivePaidSubscription,
  isOverrideWindowActive,
  chooseBestOverride,
  toDateOrNull,
};
