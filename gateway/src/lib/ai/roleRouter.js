const ALL_PHASES = ['intake', 'credit', 'business', 'funding', 'grants', 'investments', 'success'];

const TIER_ALLOWED_PHASES = {
  tier1: ['intake', 'success'],
  tier2: ['intake', 'credit', 'success'],
  tier3: ALL_PHASES,
};

const ROLE_BY_PHASE = {
  intake: 'intake_specialist',
  credit: 'credit_analyst',
  business: 'business_advisor',
  funding: 'funding_specialist',
  grants: 'grant_writer',
  investments: 'investment_advisor',
  success: 'success_manager',
};

const TIER_ALLOWED_ROLES = {
  tier1: ['intake_specialist', 'success_manager'],
  tier2: ['intake_specialist', 'credit_analyst', 'success_manager'],
  tier3: [
    'intake_specialist',
    'credit_analyst',
    'business_advisor',
    'funding_specialist',
    'grant_writer',
    'investment_advisor',
    'success_manager',
  ],
};

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

export function normalizeTier(value) {
  const tier = asText(value).toLowerCase();
  if (tier === 'tier1' || tier === 'tier2' || tier === 'tier3') return tier;
  return 'tier1';
}

export function allowedPhasesForTier(tierInput) {
  const tier = normalizeTier(tierInput);
  return [...(TIER_ALLOWED_PHASES[tier] || TIER_ALLOWED_PHASES.tier1)];
}

export function roleAllowedForTier({ tier: tierInput, roleKey }) {
  const tier = normalizeTier(tierInput);
  const role = asText(roleKey).toLowerCase();
  return (TIER_ALLOWED_ROLES[tier] || TIER_ALLOWED_ROLES.tier1).includes(role);
}

export function decideNextRole({ tier: tierInput, phase, credit_readiness, business_exists }) {
  const tier = normalizeTier(tierInput);
  const nextPhase = asText(phase).toLowerCase() || 'intake';

  if (!allowedPhasesForTier(tier).includes(nextPhase)) {
    return 'success_manager';
  }

  if (tier === 'tier1') {
    if (nextPhase === 'intake') return 'intake_specialist';
    return 'success_manager';
  }

  if (tier === 'tier2') {
    if (nextPhase === 'credit') return 'credit_analyst';
    if (nextPhase === 'success') return 'success_manager';
    return 'intake_specialist';
  }

  if (nextPhase === 'funding') {
    const readiness = asText(credit_readiness).toLowerCase();
    if (readiness === 'not_ready' || readiness === 'conditional') {
      return 'credit_analyst';
    }
  }

  if (nextPhase === 'business' && business_exists === true) {
    return 'funding_specialist';
  }

  return ROLE_BY_PHASE[nextPhase] || 'success_manager';
}

export const AI_ROLE_KEYS = Object.freeze({
  INTAKE_SPECIALIST: 'intake_specialist',
  CREDIT_ANALYST: 'credit_analyst',
  BUSINESS_ADVISOR: 'business_advisor',
  FUNDING_SPECIALIST: 'funding_specialist',
  GRANT_WRITER: 'grant_writer',
  INVESTMENT_ADVISOR: 'investment_advisor',
  SUCCESS_MANAGER: 'success_manager',
});
