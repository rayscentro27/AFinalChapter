import {
  ClientProfileType,
  Contact,
  CreditProfileBand,
  ExperienceConfig,
  FundingExperienceBand,
  PortalExperienceTarget,
} from '../types';
import {
  BusinessFoundationProfileResponse,
  FundingRoadmapResponse,
  PortalTasksResponse,
} from './fundingFoundationService';

type ClientExperienceInput = {
  contact: Contact;
  roadmap: FundingRoadmapResponse | null;
  tasks: PortalTasksResponse | null;
  business: BusinessFoundationProfileResponse | null;
  credit: any;
  capital: any;
  isFunded: boolean;
};

function normalizeText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleCase(value: string) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function uniqueTargets(targets: PortalExperienceTarget[]) {
  return Array.from(new Set(targets));
}

function firstNumericValue(values: unknown[]): number | null {
  for (const value of values) {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return null;
}

function extractCreditScore(credit: any): number | null {
  const latestAnalysis = credit?.analysis?.latest_analysis || {};
  const latestReport = credit?.analysis?.latest_report || {};
  const score = firstNumericValue([
    latestAnalysis?.score,
    latestAnalysis?.credit_score,
    latestAnalysis?.fico_score,
    latestAnalysis?.composite_score,
    latestAnalysis?.summary?.score,
    latestAnalysis?.metadata?.score,
    latestReport?.score,
    latestReport?.credit_score,
    latestReport?.fico_score,
    latestReport?.metadata?.score,
  ]);
  if (score === null) return null;
  if (score <= 1) return Math.round(score * 850);
  return score;
}

function deriveBusinessMaturity(input: ClientExperienceInput): 'startup' | 'established' {
  const path = input.business?.readiness?.path;
  if (path === 'new_business') return 'startup';
  if (path === 'existing_business_optimization') return 'established';
  if ((input.contact.timeInBusiness || 0) >= 2) return 'established';
  if ((input.contact.revenue || 0) >= 250000) return 'established';
  return 'startup';
}

function deriveCreditBand(input: ClientExperienceInput): CreditProfileBand {
  const score = extractCreditScore(input.credit);
  const recommendationCount = Number(input.credit?.recommendations?.recommendations?.length || 0);
  const hasAnalysis = Boolean(input.credit?.analysis?.latest_analysis);
  const hasReport = Boolean(input.credit?.analysis?.latest_report);

  if (score !== null && score >= 700) return 'high_credit';
  if (score !== null && score <= 640) return 'low_credit';
  if (recommendationCount >= 5) return 'low_credit';
  if (hasAnalysis || hasReport) return 'building_credit';
  return 'unknown';
}

function deriveReadinessBand(input: ClientExperienceInput): FundingExperienceBand {
  const stage = String(input.roadmap?.stage || '').toLowerCase();
  if (input.isFunded || stage === 'post_funding_capital') return 'post_funding';
  if (stage === 'application_loop') return 'application_active';
  if (stage === 'funding_roadmap' || input.roadmap?.readiness?.ready) return 'funding_ready';
  return 'early_stage';
}

function deriveProfileType(dimensions: ExperienceConfig['dimensions']): ClientProfileType {
  if (dimensions.readinessBand === 'post_funding') return 'post_funding_operator';
  if (dimensions.businessMaturity === 'startup' && dimensions.readinessBand === 'early_stage') return 'startup_credit_builder';
  if (dimensions.businessMaturity === 'startup') return 'startup_funding_ready';
  if (dimensions.creditBand === 'low_credit' && dimensions.readinessBand === 'early_stage') return 'established_credit_rebuild';
  if (dimensions.readinessBand === 'funding_ready' || dimensions.readinessBand === 'application_active') return 'established_funding_ready';
  return 'established_growth_operator';
}

function buildRecommendations(profileType: ClientProfileType, input: ClientExperienceInput): ExperienceConfig['recommendations'] {
  const roadmapRecommendation = input.roadmap?.recommendation?.top_recommendation;

  if (profileType === 'startup_credit_builder') {
    return [
      {
        id: 'startup-business-foundation',
        title: 'Finish business foundation first',
        body: 'Your portal emphasizes entity, EIN, bank, and consistency steps before lender-facing motion.',
        target: 'businessFoundation',
      },
      {
        id: 'startup-credit-docs',
        title: 'Use documents to accelerate readiness',
        body: 'Upload foundational files early so credit and funding steps have the right evidence set when they become active.',
        target: 'documents',
      },
      {
        id: 'startup-action-center',
        title: roadmapRecommendation?.title || 'Follow the guided next step',
        body: roadmapRecommendation?.action || 'The action center is prioritized for startup setup and early credit-readiness work.',
        target: 'actionCenter',
      },
    ];
  }

  if (profileType === 'startup_funding_ready') {
    return [
      {
        id: 'startup-funding-roadmap',
        title: 'Move from setup to applications cleanly',
        body: 'The portal shifts emphasis toward roadmap execution, application logging, and lender-facing documentation.',
        target: 'fundingRoadmap',
      },
      {
        id: 'startup-document-precision',
        title: 'Keep documents lender-ready',
        body: 'Documents now support application motion, not just setup completeness.',
        target: 'documents',
      },
      {
        id: 'startup-messages',
        title: 'Watch workflow messages closely',
        body: 'Internal guidance threads become more execution-focused once your startup is funding-ready.',
        target: 'messages',
      },
    ];
  }

  if (profileType === 'established_credit_rebuild') {
    return [
      {
        id: 'established-credit',
        title: 'Repair credit bottlenecks before speed',
        body: 'This experience de-emphasizes aggressive funding motion until credit and document blockers are resolved.',
        target: 'creditCenter',
      },
      {
        id: 'established-documents',
        title: 'Use the document workspace as proof control',
        body: 'Expect more emphasis on statements, bureau evidence, and support files that unblock underwriting.',
        target: 'documents',
      },
      {
        id: 'established-action-center',
        title: 'Keep the action center tightly sequenced',
        body: 'Task ordering now favors credit repair and supporting uploads over optional growth branches.',
        target: 'actionCenter',
      },
    ];
  }

  if (profileType === 'established_funding_ready') {
    return [
      {
        id: 'established-roadmap',
        title: 'Prioritize lender-facing execution',
        body: 'The roadmap, activity feed, and document workspace become the highest-emphasis surfaces.',
        target: 'fundingRoadmap',
      },
      {
        id: 'established-activity',
        title: 'Track application motion in activity',
        body: 'Use the activity feed to keep submissions, outcomes, and follow-up actions aligned.',
        target: 'activity',
      },
      {
        id: 'established-documents',
        title: 'Keep generated and uploaded files visible',
        body: 'The portal now leans harder on workflow-managed documents to support funding velocity.',
        target: 'documents',
      },
    ];
  }

  if (profileType === 'post_funding_operator') {
    return [
      {
        id: 'post-funding-protection',
        title: 'Reserve-first protection stays primary',
        body: 'Capital protection and allocation become the dominant workspace emphasis after funding closes.',
        target: 'capitalProtection',
      },
      {
        id: 'post-funding-allocation',
        title: 'Make capital path decisions deliberately',
        body: 'Optional branches like grants or trading stay secondary to reserve discipline and business growth positioning.',
        target: 'capitalAllocation',
      },
      {
        id: 'post-funding-grants',
        title: 'Optional paths stay contextual',
        body: 'Grant and trading recommendations remain visible, but only as post-funding branches rather than core workflow.',
        target: 'grants',
      },
    ];
  }

  return [
    {
      id: 'growth-action-center',
      title: 'Keep the action center concise',
      body: 'This experience favors a balanced operating mode across funding, documents, and business optimization.',
      target: 'actionCenter',
    },
    {
      id: 'growth-roadmap',
      title: 'Use the roadmap as the execution spine',
      body: 'Recommendations and task priorities still anchor on the funding-first sequence.',
      target: 'fundingRoadmap',
    },
    {
      id: 'growth-documents',
      title: 'Keep document readiness current',
      body: 'Supporting files stay visible because they influence both underwriting and workflow accuracy.',
      target: 'documents',
    },
  ];
}

export function buildExperienceConfig(input: ClientExperienceInput): ExperienceConfig {
  const dimensions: ExperienceConfig['dimensions'] = {
    businessMaturity: deriveBusinessMaturity(input),
    creditBand: deriveCreditBand(input),
    readinessBand: deriveReadinessBand(input),
  };
  const profileType = deriveProfileType(dimensions);

  const byProfile: Record<ClientProfileType, Omit<ExperienceConfig, 'dimensions' | 'profileType' | 'recommendations'>> = {
    startup_credit_builder: {
      hero: {
        eyebrow: 'Startup Mode',
        title: 'Launch-readiness portal experience',
        subtitle: 'Business setup, proof collection, and early credit structure are emphasized over aggressive funding motion.',
      },
      messaging: {
        toneLabel: 'Guided Setup Tone',
        summary: 'Messaging stays calmer and more instructional because the client still needs structure, credibility, and evidence before acceleration makes sense.',
      },
      emphasis: {
        primaryGoal: 'Finish foundational setup and reduce early underwriting friction.',
        statusLabel: 'Early-stage startup workflow',
        highlightedTargets: ['businessFoundation', 'documents', 'creditCenter', 'actionCenter'],
      },
      taskPriority: {
        targetOrder: ['businessFoundation', 'documents', 'creditCenter', 'fundingRoadmap', 'messages'],
        explanation: 'Tasks that improve setup integrity and attach supporting documents are ranked ahead of lender-facing acceleration.',
      },
    },
    startup_funding_ready: {
      hero: {
        eyebrow: 'Startup To Funding',
        title: 'Funding-ready startup experience',
        subtitle: 'The UI shifts from setup-heavy coaching to execution-heavy roadmap and document readiness.',
      },
      messaging: {
        toneLabel: 'Execution Tone',
        summary: 'Messaging becomes sharper and more momentum-oriented because the startup is ready to move through applications and evidence collection.',
      },
      emphasis: {
        primaryGoal: 'Turn startup readiness into clean funding execution.',
        statusLabel: 'Funding-ready startup',
        highlightedTargets: ['fundingRoadmap', 'documents', 'activity', 'messages'],
      },
      taskPriority: {
        targetOrder: ['fundingRoadmap', 'documents', 'activity', 'messages', 'creditCenter'],
        explanation: 'Roadmap execution, lender-facing documents, and follow-up visibility take precedence once startup readiness clears.',
      },
    },
    established_credit_rebuild: {
      hero: {
        eyebrow: 'Credit Rebuild Mode',
        title: 'Established business with credit repair emphasis',
        subtitle: 'The portal keeps the business context visible, but pushes credit cleanup and supporting files to the front.',
      },
      messaging: {
        toneLabel: 'Risk-Control Tone',
        summary: 'Messaging becomes more deliberate and corrective so the client sees underwriting blockers clearly before scaling funding attempts.',
      },
      emphasis: {
        primaryGoal: 'Reduce credit risk and document gaps before increasing application pressure.',
        statusLabel: 'Established business, low-credit posture',
        highlightedTargets: ['creditCenter', 'documents', 'actionCenter', 'messages'],
      },
      taskPriority: {
        targetOrder: ['creditCenter', 'documents', 'actionCenter', 'businessFoundation', 'fundingRoadmap'],
        explanation: 'Credit and proof-of-readiness tasks outrank broader growth moves until the credit profile improves.',
      },
    },
    established_funding_ready: {
      hero: {
        eyebrow: 'Execution Mode',
        title: 'Established business, funding-ready experience',
        subtitle: 'The portal emphasizes application sequencing, workflow visibility, and document precision for active funding motion.',
      },
      messaging: {
        toneLabel: 'Momentum Tone',
        summary: 'Messaging becomes more direct and operational because the client is past discovery and should focus on clean execution.',
      },
      emphasis: {
        primaryGoal: 'Drive efficient application motion and keep lender-facing artifacts current.',
        statusLabel: 'Funding-ready operator',
        highlightedTargets: ['fundingRoadmap', 'activity', 'documents', 'messages'],
      },
      taskPriority: {
        targetOrder: ['fundingRoadmap', 'documents', 'activity', 'messages', 'creditCenter'],
        explanation: 'Funding tasks, activity visibility, and workflow-managed documents get the strongest emphasis.',
      },
    },
    established_growth_operator: {
      hero: {
        eyebrow: 'Growth Operator Mode',
        title: 'Balanced operator experience',
        subtitle: 'The portal keeps a balanced emphasis across readiness, roadmap execution, and business optimization.',
      },
      messaging: {
        toneLabel: 'Balanced Tone',
        summary: 'Messaging stays steady and operational, avoiding excessive urgency when the client is neither blocked nor fully post-funding.',
      },
      emphasis: {
        primaryGoal: 'Maintain readiness quality while progressing through the funding-first workflow.',
        statusLabel: 'Balanced growth operator',
        highlightedTargets: ['actionCenter', 'fundingRoadmap', 'documents', 'businessFoundation'],
      },
      taskPriority: {
        targetOrder: ['actionCenter', 'fundingRoadmap', 'documents', 'businessFoundation', 'messages'],
        explanation: 'The portal maintains even pressure across action sequencing, supporting documents, and business optimization.',
      },
    },
    post_funding_operator: {
      hero: {
        eyebrow: 'Post-Funding Mode',
        title: 'Capital stewardship experience',
        subtitle: 'The portal pivots from pre-funding readiness to reserve-first protection, allocation, and optional branch control.',
      },
      messaging: {
        toneLabel: 'Stewardship Tone',
        summary: 'Messaging becomes more disciplined and allocation-aware because the primary risk is now capital misuse rather than access.',
      },
      emphasis: {
        primaryGoal: 'Protect capital first, then choose the right post-funding path.',
        statusLabel: 'Post-funding capital operator',
        highlightedTargets: ['capitalProtection', 'capitalAllocation', 'activity', 'documents'],
      },
      taskPriority: {
        targetOrder: ['capitalProtection', 'capitalAllocation', 'documents', 'activity', 'messages', 'grants', 'tradingAccess'],
        explanation: 'Reserve-first work and allocation decisions are prioritized over optional post-funding branches.',
      },
    },
  };

  return {
    profileType,
    dimensions,
    ...byProfile[profileType],
    recommendations: buildRecommendations(profileType, input),
  };
}

function matchesTarget(task: any, target: PortalExperienceTarget) {
  const haystack = normalizeText([
    task?.task_category,
    task?.group_key,
    task?.template_key,
    task?.type,
    task?.title,
    task?.description,
    task?.meta?.category,
  ].join(' '));

  const tokensByTarget: Record<PortalExperienceTarget, string[]> = {
    home: [],
    fundingRoadmap: ['funding', 'application', 'lender', 'approval', 'submit'],
    actionCenter: ['task', 'workflow'],
    activity: ['result', 'follow up', 'followup', 'history'],
    messages: ['message', 'thread', 'reply'],
    documents: ['document', 'upload', 'statement', 'attachment', 'identification', 'agreement'],
    account: ['subscription', 'profile', 'account'],
    creditCenter: ['credit', 'bureau', 'report', 'dispute', 'letter'],
    businessFoundation: ['business', 'ein', 'llc', 'naics', 'website', 'bank'],
    capitalProtection: ['capital protection', 'reserve', 'protection'],
    capitalAllocation: ['allocation', 'capital path', 'deploy'],
    tradingAccess: ['trading'],
    grants: ['grant'],
  };

  return tokensByTarget[target].some((token) => haystack.includes(token));
}

export function sortTasksForExperience(tasks: any[] = [], experienceConfig: ExperienceConfig) {
  const order = experienceConfig.taskPriority.targetOrder;
  return [...tasks].sort((left, right) => {
    const leftRank = order.findIndex((target) => matchesTarget(left, target));
    const rightRank = order.findIndex((target) => matchesTarget(right, target));
    const normalizedLeft = leftRank === -1 ? order.length : leftRank;
    const normalizedRight = rightRank === -1 ? order.length : rightRank;
    if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;

    const leftSignal = String(left?.signal || left?.priority || 'z');
    const rightSignal = String(right?.signal || right?.priority || 'z');
    return leftSignal.localeCompare(rightSignal);
  });
}

export function sortTargetsForExperience<T extends { key: PortalExperienceTarget }>(items: T[], experienceConfig: ExperienceConfig) {
  const order = experienceConfig.emphasis.highlightedTargets;
  return [...items].sort((left, right) => {
    const leftRank = order.indexOf(left.key);
    const rightRank = order.indexOf(right.key);
    const normalizedLeft = leftRank === -1 ? order.length : leftRank;
    const normalizedRight = rightRank === -1 ? order.length : rightRank;
    if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
    return left.key.localeCompare(right.key);
  });
}

export function formatClientProfileType(value: ClientProfileType) {
  return titleCase(value);
}