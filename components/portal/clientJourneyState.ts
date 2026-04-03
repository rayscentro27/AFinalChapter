import { ViewMode } from '../../types';
import { BusinessFoundationProfileResponse, FundingRoadmapResponse } from '../../services/fundingFoundationService';
import { CapitalReadinessPayload } from '../../hooks/useCapitalReadiness';
import { TradingAccessSnapshot } from '../../services/tradingAccessService';

type CreditCenterData = {
  analysis: {
    latest_report?: any | null;
    latest_analysis?: any | null;
    analyses?: any[];
  } | null;
  recommendations: {
    recommendations?: any[];
  } | null;
  letters: {
    letters?: any[];
  } | null;
};

export type JourneyStep = {
  key: string;
  label: string;
  helper: string;
  complete: boolean;
  active: boolean;
};

export type JourneyBadge = {
  key: string;
  label: string;
  helper: string;
  earned: boolean;
  tone: 'sky' | 'violet' | 'emerald' | 'amber';
};

export type ClientJourneyState = {
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    ctaLabel: string;
    ctaView: ViewMode;
    ctaPath?: string;
    supportText: string;
  };
  progress: {
    percent: number;
    activeStepLabel: string;
    steps: JourneyStep[];
  };
  badges: JourneyBadge[];
  fundingRange: {
    unlocked: boolean;
    min: number | null;
    max: number | null;
    helper: string;
  };
  tradingAcademy: {
    unlocked: boolean;
    statusLabel: string;
    title: string;
    subtitle: string;
    helper: string;
    ctaLabel: string;
    checklist: Array<{ label: string; complete: boolean }>;
  };
  summary: {
    businessReady: boolean;
    businessPathSelected: boolean;
    hasCreditReport: boolean;
    hasCreditAnalysis: boolean;
    hasFundingStrategy: boolean;
    hasFundingApplication: boolean;
    hasApprovedFunding: boolean;
    readinessScore: number;
    businessProgressPercent: number;
  };
};

type DeriveClientJourneyStateInput = {
  contact: {
    revenue?: number;
    value?: number;
    documents?: Array<{ type?: string; status?: string }>;
  };
  demoMode: boolean;
  credit: CreditCenterData;
  funding: FundingRoadmapResponse | null;
  business: BusinessFoundationProfileResponse | null;
  capital: CapitalReadinessPayload | null;
  trading: TradingAccessSnapshot | null;
};

const FUNDING_STAGES_WITH_STRATEGY = new Set([
  'funding_roadmap',
  'application_loop',
  'post_funding_capital',
]);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function countCompleteSteps(steps: JourneyStep[]) {
  return steps.filter((step) => step.complete).length;
}

function hasApprovedResult(funding: FundingRoadmapResponse | null, capital: CapitalReadinessPayload | null) {
  const approvedResult = (funding?.results || []).some((row: any) => String(row?.result_status || '').toLowerCase() === 'approved');
  const approvedLegacy = (funding?.legacy_outcomes || []).some((row: any) => String(row?.outcome_status || '').toLowerCase() === 'approved');
  return approvedResult || approvedLegacy || Boolean((capital?.eligibility?.approved_total_amount || 0) > 0);
}

function deriveFundingEstimate(input: {
  hasCreditReport: boolean;
  hasCreditAnalysis: boolean;
  hasApprovedFunding: boolean;
  fundingReady: boolean;
  businessReady: boolean;
  hasFundingApplication: boolean;
  score: number | null;
  revenueHint: number | null;
}) {
  if (!input.hasCreditReport) {
    return {
      unlocked: false,
      min: null,
      max: null,
      helper: 'Complete your credit upload to unlock your estimated funding range.',
    };
  }

  if (!input.hasCreditAnalysis) {
    return {
      unlocked: false,
      min: null,
      max: null,
      helper: 'Complete your analysis to unlock your estimated funding range.',
    };
  }

  if (!input.score && !input.revenueHint && !input.hasApprovedFunding) {
    return {
      unlocked: false,
      min: null,
      max: null,
      helper: 'We need more readiness data before showing an educational estimate.',
    };
  }

  let min = 10000;
  let max = 30000;

  if (input.score) {
    if (input.score >= 720) {
      min = 30000;
      max = 90000;
    } else if (input.score >= 680) {
      min = 20000;
      max = 60000;
    } else if (input.score >= 640) {
      min = 15000;
      max = 45000;
    } else if (input.score >= 600) {
      min = 10000;
      max = 30000;
    } else {
      min = 5000;
      max = 20000;
    }
  } else if (input.revenueHint && input.revenueHint >= 150000) {
    min = 20000;
    max = 50000;
  }

  if (input.businessReady) {
    min += 5000;
    max += 10000;
  }
  if (input.fundingReady) {
    min += 5000;
    max += 15000;
  }
  if (input.hasFundingApplication) {
    min += 5000;
    max += 10000;
  }
  if (input.hasApprovedFunding) {
    min += 5000;
    max += 15000;
  }

  if (input.revenueHint) {
    const revenueCap = Math.max(25000, Math.round(input.revenueHint * 0.35));
    max = Math.min(max, revenueCap);
    min = Math.min(min, Math.round(max * 0.65));
  }

  return {
    unlocked: true,
    min: clamp(Math.round(min / 5000) * 5000, 5000, 250000),
    max: clamp(Math.round(max / 5000) * 5000, 10000, 300000),
    helper: 'Educational estimate only, not a lending decision.',
  };
}

export function deriveClientJourneyState(input: DeriveClientJourneyStateInput): ClientJourneyState {
  const latestReport = input.credit.analysis?.latest_report || null;
  const latestAnalysis = input.credit.analysis?.latest_analysis || null;
  const creditRecommendations = input.credit.recommendations?.recommendations || [];
  const businessCompleted = input.business?.readiness.completed_steps || [];
  const businessMissing = input.business?.readiness.missing_steps || [];
  const businessPathSelected = Boolean(input.business?.readiness.path);
  const businessProgressPercent = Math.round(
    (businessCompleted.length / Math.max(1, businessCompleted.length + businessMissing.length)) * 100
  );

  const reportDocumentExists = (input.contact.documents || []).some(
    (document) => String(document.type || '').toLowerCase() === 'credit' && String(document.status || '').toLowerCase() !== 'missing'
  );

  const hasCreditReport = input.demoMode || Boolean(latestReport) || reportDocumentExists;
  const hasCreditAnalysis = input.demoMode || Boolean(latestAnalysis) || creditRecommendations.length > 0;
  const businessReady = input.demoMode || Boolean(input.business?.readiness.ready);
  const hasFundingStrategy =
    (input.demoMode || businessReady) &&
    (
      input.demoMode ||
      (input.funding?.strategy_steps || []).length > 0 ||
      FUNDING_STAGES_WITH_STRATEGY.has(String(input.funding?.stage || '').toLowerCase()) ||
      Boolean(input.funding?.recommendation.top_recommendation)
    );
  const hasFundingApplication =
    (input.demoMode || businessReady) &&
    (
      input.demoMode ||
      (input.funding?.applications || []).length > 0 ||
      (input.funding?.results || []).length > 0 ||
      (input.funding?.legacy_outcomes || []).length > 0
    );
  const hasApprovedFunding = input.demoMode || hasApprovedResult(input.funding, input.capital);
  const fundingReady = input.demoMode || Boolean(input.funding?.readiness.ready);

  const readinessScore = clamp(
    Math.round(
      (hasCreditReport ? 20 : 0)
      + (hasCreditAnalysis ? 20 : 0)
      + (hasFundingStrategy ? 20 : 0)
      + Math.round((Math.max(businessProgressPercent, fundingReady ? 100 : 0) / 100) * 20)
      + (hasFundingApplication ? 10 : 0)
      + (hasApprovedFunding ? 10 : 0)
    ),
    0,
    100
  );

  const journeySteps: JourneyStep[] = [
    {
      key: 'upload_report',
      label: 'Upload Credit Report',
      helper: 'Securely add your report to start readiness scoring.',
      complete: hasCreditReport,
      active: false,
    },
    {
      key: 'credit_analysis',
      label: 'AI Credit Analysis',
      helper: 'Review analysis, recommendations, and bureau signals.',
      complete: hasCreditAnalysis,
      active: false,
    },
    {
      key: 'funding_strategy',
      label: 'Funding Strategy',
      helper: 'Sequence next actions and funding readiness moves.',
      complete: hasFundingStrategy,
      active: false,
    },
    {
      key: 'apply_for_funding',
      label: 'Apply for Funding',
      helper: 'Track application movement and logged outcomes.',
      complete: hasFundingApplication,
      active: false,
    },
    {
      key: 'optimize_grow',
      label: 'Optimize & Grow',
      helper: 'Advance post-readiness growth and educational unlocks.',
      complete: hasApprovedFunding,
      active: false,
    },
  ];

  const firstIncompleteIndex = journeySteps.findIndex((step) => !step.complete);
  const activeIndex = firstIncompleteIndex === -1 ? journeySteps.length - 1 : firstIncompleteIndex;
  journeySteps[activeIndex].active = true;

  const hasProgressionThreshold = readinessScore >= 70 && businessReady;
  const actualTradingReady = Boolean(input.trading?.access_ready);
  const localTradingUnlock = businessReady && hasCreditReport && hasCreditAnalysis && hasFundingStrategy && hasProgressionThreshold;
  const tradingUnlocked = input.demoMode || actualTradingReady || localTradingUnlock;

  const fundingEstimate = deriveFundingEstimate({
    hasCreditReport,
    hasCreditAnalysis,
    hasApprovedFunding,
    fundingReady,
    businessReady,
    hasFundingApplication,
    score: Number(latestReport?.personal_score || latestReport?.business_score || 0) || null,
    revenueHint: Number(input.contact.revenue || input.contact.value || 0) || null,
  });

  let hero: ClientJourneyState['hero'];
  if (!businessPathSelected || !businessReady) {
    hero = {
      eyebrow: 'Mission control',
      title: 'Step 1: Build Your Business Foundation',
      subtitle: 'Choose your business path and complete the core setup steps before deeper funding moves unlock.',
      ctaLabel: 'Open Business Foundation',
      ctaView: ViewMode.PORTAL_BUSINESS,
      ctaPath: '/portal/business',
      supportText: 'Choose path • Complete checklist • Unlock deeper readiness',
    };
  } else if (!hasCreditReport) {
    hero = {
      eyebrow: 'Mission control',
      title: 'Step 1: Upload Your Credit Report',
      subtitle: 'This unlocks your funding strategy, estimated funding range, and next approvals.',
      ctaLabel: 'Upload Credit Report',
      ctaView: ViewMode.UPLOAD_CREDIT_REPORT,
      ctaPath: '/credit-report-upload',
      supportText: 'Takes 2 minutes • Secure • Phone or desktop',
    };
  } else if (!hasCreditAnalysis) {
    hero = {
      eyebrow: 'Mission control',
      title: 'Credit Report Uploaded',
      subtitle: 'Your analysis is the next step toward funding readiness.',
      ctaLabel: 'View Credit Analysis',
      ctaView: ViewMode.PORTAL_CREDIT,
      ctaPath: '/portal/credit',
      supportText: 'Review bureau posture, recommendations, and dispute activity.',
    };
  } else if (!hasFundingStrategy) {
    hero = {
      eyebrow: 'Mission control',
      title: 'Your Analysis Is Ready',
      subtitle: 'Review your funding strategy and see what you may qualify for.',
      ctaLabel: 'Review Funding Strategy',
      ctaView: ViewMode.PORTAL_FUNDING,
      ctaPath: '/portal/funding',
      supportText: 'Use your next best action to move from analysis into sequencing.',
    };
  } else if (!hasFundingApplication) {
    hero = {
      eyebrow: 'Mission control',
      title: 'Your Funding Strategy Is Ready',
      subtitle: 'Follow the roadmap, remove blockers, and get closer to active funding.',
      ctaLabel: 'Open Funding Engine',
      ctaView: ViewMode.PORTAL_FUNDING,
      ctaPath: '/portal/funding',
      supportText: 'Your roadmap is now sequencing the strongest next move.',
    };
  } else {
    hero = {
      eyebrow: 'Mission control',
      title: 'Keep Your Funding Momentum Moving',
      subtitle: 'Track applications, strengthen readiness, and unlock your next educational tools.',
      ctaLabel: tradingUnlocked ? 'Open Trading Academy' : 'Review Funding Strategy',
      ctaView: ViewMode.PORTAL_FUNDING,
      ctaPath: '/portal/funding',
      supportText: tradingUnlocked
        ? 'Trading remains educational-only and simulation-first inside the existing portal workflow.'
        : 'Stay current on application outcomes and remaining blockers.',
    };
  }

  const badges: JourneyBadge[] = [
    {
      key: 'credit_report_uploaded',
      label: 'Credit Report Uploaded',
      helper: 'A report is on file and your journey has started.',
      earned: hasCreditReport,
      tone: 'sky',
    },
    {
      key: 'analysis_ready',
      label: 'Analysis Ready',
      helper: 'Analysis and actionable guidance are available.',
      earned: hasCreditAnalysis,
      tone: 'violet',
    },
    {
      key: 'funding_strategy_ready',
      label: 'Funding Strategy Ready',
      helper: 'Funding roadmap steps are available for review.',
      earned: hasFundingStrategy,
      tone: 'emerald',
    },
    {
      key: 'funding_profile_improved',
      label: 'Funding Profile Improved',
      helper: 'Your readiness score reached the milestone threshold.',
      earned: (readinessScore >= 70 && businessReady) || fundingReady,
      tone: 'amber',
    },
    {
      key: 'first_approval',
      label: 'First Approval',
      helper: 'An approved outcome has been logged.',
      earned: hasApprovedFunding,
      tone: 'emerald',
    },
    {
      key: 'trading_academy_unlocked',
      label: 'Trading Academy Unlocked',
      helper: 'Educational trading progression is now available.',
      earned: tradingUnlocked,
      tone: 'violet',
    },
  ];

  const tradingChecklist = [
    { label: 'Upload Credit Report', complete: hasCreditReport },
    { label: 'Complete Analysis', complete: hasCreditAnalysis },
    { label: 'Review Funding Strategy', complete: hasFundingStrategy },
    { label: 'Reach readiness milestone', complete: hasProgressionThreshold || actualTradingReady || input.demoMode },
  ];

  const tradingHelper = tradingUnlocked
    ? actualTradingReady || input.demoMode
      ? 'Educational strategy review and paper-trading-first tools can be continued from the existing portal flow. No live broker execution is exposed here.'
      : 'Academy milestone unlocked. Advanced access still follows the existing post-funding and capital-protection safety gates.'
    : 'Unlock advanced market education after completing your funding readiness milestones.';

  return {
    hero,
    progress: {
      percent: countCompleteSteps(journeySteps) === journeySteps.length ? 100 : readinessScore,
      activeStepLabel: journeySteps[activeIndex].label,
      steps: journeySteps,
    },
    badges,
    fundingRange: fundingEstimate,
    tradingAcademy: {
      unlocked: tradingUnlocked,
      statusLabel: tradingUnlocked ? 'Unlocked' : 'Locked',
      title: tradingUnlocked ? 'Trading Academy Unlocked' : 'Trading Academy',
      subtitle: tradingUnlocked
        ? 'You now have access to the next educational trading level.'
        : 'Unlock advanced market education after completing your funding readiness milestones.',
      helper: tradingHelper,
      ctaLabel: tradingUnlocked ? 'Open Trading Academy' : 'View Unlock Path',
      checklist: tradingChecklist,
    },
    summary: {
      hasCreditReport,
      hasCreditAnalysis,
      hasFundingStrategy,
      hasFundingApplication,
      hasApprovedFunding,
      businessReady,
      businessPathSelected,
      readinessScore,
      businessProgressPercent,
    },
  };
}
