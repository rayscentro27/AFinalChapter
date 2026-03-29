export type AgentTier =
  | 'ComplianceRisk'
  | 'Structural'
  | 'Strategy'
  | 'Growth'
  | 'SalesVelocity';

export interface AgentRecommendation {
  agent_name: string;
  tier: AgentTier;
  recommendation: string;
}

export interface ArbitrationResult {
  conflict_detected: boolean;
  applied_priority_tier: AgentTier;
  final_guidance: string;
  rationale: string;
  consensus_score: number; // 0..1
  recommendations: AgentRecommendation[];
}

const tierPriority: AgentTier[] = ['ComplianceRisk', 'Structural', 'Strategy', 'Growth', 'SalesVelocity'];

const tierRank = (t: AgentTier) => tierPriority.indexOf(t);

const normalize = (s: string) => (s || '').toLowerCase();

function stance(text: string): 'accelerate' | 'delay' | 'neutral' {
  const t = normalize(text);
  const accel = ['apply', 'accelerate', 'move now', 'submit', 'deploy', 'push', 'send'].some((k) => t.includes(k));
  const delay = ['delay', 'wait', 'stabilize', 'repair', 'slow', 'pause', 'hold'].some((k) => t.includes(k));
  if (accel && !delay) return 'accelerate';
  if (delay && !accel) return 'delay';
  return 'neutral';
}

export function arbitrateRecommendations(input: AgentRecommendation[]): ArbitrationResult {
  const recommendations = (Array.isArray(input) ? input : []).filter((r) => r && r.agent_name && r.recommendation);

  if (recommendations.length === 0) {
    return {
      conflict_detected: false,
      applied_priority_tier: 'Strategy',
      final_guidance: 'No guidance available.',
      rationale: 'No recommendations were provided to the arbitration engine.',
      consensus_score: 0,
      recommendations: [],
    };
  }

  const stances = recommendations.map((r) => ({ r, s: stance(r.recommendation) }));
  const accelCount = stances.filter((x) => x.s === 'accelerate').length;
  const delayCount = stances.filter((x) => x.s === 'delay').length;
  const conflict_detected = accelCount > 0 && delayCount > 0;

  const consensus_score = recommendations.length <= 1 ? 1 : Math.max(accelCount, delayCount) / recommendations.length;

  // If conflict, pick the highest-priority tier among recommendations that have a non-neutral stance.
  let applied: AgentRecommendation = recommendations[0];

  if (conflict_detected) {
    const nonNeutral = stances.filter((x) => x.s !== 'neutral').map((x) => x.r);
    applied = nonNeutral.sort((a, b) => tierRank(a.tier) - tierRank(b.tier))[0] || recommendations[0];
  } else {
    // No conflict: pick the highest-priority tier overall.
    applied = recommendations.slice().sort((a, b) => tierRank(a.tier) - tierRank(b.tier))[0];
  }

  const rationale =
    conflict_detected
      ? `Conflict detected. Priority hierarchy applied: ${applied.tier} overrides lower tiers.`
      : `No conflict detected. Highest-priority tier selected: ${applied.tier}.`;

  return {
    conflict_detected,
    applied_priority_tier: applied.tier,
    final_guidance: applied.recommendation,
    rationale,
    consensus_score,
    recommendations,
  };
}
