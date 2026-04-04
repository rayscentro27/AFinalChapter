import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  FileText,
  Gift,
  Landmark,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import { Contact, ViewMode } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { BACKEND_CONFIG } from '../../adapters/config';
import useFundingRoadmap from '../../hooks/useFundingRoadmap';
import useCreditCenter from '../../hooks/useCreditCenter';
import useBusinessFoundation from '../../hooks/useBusinessFoundation';
import useCapitalReadiness from '../../hooks/useCapitalReadiness';
import useTradingAccess from '../../hooks/useTradingAccess';
import AchievementBadges from '../portal/AchievementBadges';
import BusinessOpportunitiesSection from '../portal/BusinessOpportunitiesSection';
import EstimatedFundingRangeCard from '../portal/EstimatedFundingRangeCard';
import FundingJourneyHero from '../portal/FundingJourneyHero';
import FundingProgressBar from '../portal/FundingProgressBar';
import FundingProgressSection from '../portal/FundingProgressSection';
import PortalChatPanel from '../portal/PortalChatPanel';
import ReferralCard from '../portal/ReferralCard';
import TradingAcademyUnlockCard from '../portal/TradingAcademyUnlockCard';
import JourneyRetentionCard from '../portal/JourneyRetentionCard';
import { deriveClientJourneyState } from '../portal/clientJourneyState';
import useBusinessOpportunityMatches from '../../hooks/useBusinessOpportunityMatches';
import useReferralJourney from '../../hooks/useReferralJourney';
import { JourneyRetentionEventType, logJourneyRetentionEvent } from '../../src/services/journeyRetentionService';
import useJourneyRetentionSummary from '../../hooks/useJourneyRetentionSummary';

type ClientHomeV2Props = {
  contact: Contact;
  onNavigate?: (view: ViewMode, pathname?: string) => void;
};

const modules = [
  {
    key: 'overview',
    kind: 'panel' as const,
    title: 'Executive Overview',
    description: 'See all major areas in one command view',
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    key: 'messages',
    kind: 'panel' as const,
    title: 'Messages',
    description: 'Open first-party portal chat and keep conversations durable',
    icon: <MessageSquare className="h-4 w-4" />,
  },
  {
    key: 'credit',
    kind: 'route' as const,
    title: 'Credit Optimization',
    description: 'Improve personal and business credit profiles',
    icon: <ShieldCheck className="h-4 w-4" />,
    view: ViewMode.PORTAL_CREDIT,
    path: '/portal/credit',
  },
  {
    key: 'funding',
    kind: 'route' as const,
    title: 'Funding Engine',
    description: 'Review readiness, funding path, and next offers',
    icon: <Landmark className="h-4 w-4" />,
    view: ViewMode.PORTAL_FUNDING,
    path: '/portal/funding',
  },
  {
    key: 'business',
    kind: 'route' as const,
    title: 'Business Setup',
    description: 'Keep structure, compliance, and foundations in order',
    icon: <BriefcaseBusiness className="h-4 w-4" />,
    view: ViewMode.PORTAL_BUSINESS,
    path: '/portal/business',
  },
  {
    key: 'grants',
    kind: 'route' as const,
    title: 'Grants and Opportunities',
    description: 'Discover grants and hidden funding programs',
    icon: <Gift className="h-4 w-4" />,
    view: ViewMode.PORTAL_GRANTS,
    path: '/portal/grants',
  },
];

const priorityActions = [
  { module: 'Credit', title: 'Reduce utilization on 2 revolving accounts', signal: 'High', view: ViewMode.PORTAL_CREDIT, path: '/portal/credit', next: 'Next step: update credit actions and review analysis.' },
  { module: 'Funding', title: 'Upload bank statements for strongest offers', signal: 'High', view: ViewMode.PORTAL_FUNDING, path: '/portal/funding', next: 'Next step: move stronger offers into review.' },
  { module: 'Business', title: 'Complete annual report filing', signal: 'Medium', view: ViewMode.PORTAL_BUSINESS, path: '/portal/business', next: 'Next step: clear compliance blockers in business setup.' },
  { module: 'Grants', title: 'Prepare narrative for Growth Catalyst Grant', signal: 'Medium', view: ViewMode.PORTAL_GRANTS, path: '/portal/grants', next: 'Next step: improve grant application readiness.' },
];

const progressBars = [48, 62, 78, 86, 102, 116];

export default function ClientHomeV2(props: ClientHomeV2Props) {
  const { user } = useAuth();
  const [selectedSection, setSelectedSection] = useState<'overview' | 'messages'>('overview');
  const [portalMessages, setPortalMessages] = useState(props.contact.messageHistory || []);
  const tenantId =
    props.contact.tenantId
    || user?.tenantId
    || props.contact.inboxRouting?.tenant_id
    || props.contact.inboxRouting?.tenantId
    || '';
  const demoMode = !user || BACKEND_CONFIG.mode === 'mvp_mock' || !tenantId;
  const funding = useFundingRoadmap(demoMode ? undefined : tenantId, true);
  const credit = useCreditCenter(demoMode ? undefined : tenantId);
  const business = useBusinessFoundation(demoMode ? undefined : tenantId);
  const capital = useCapitalReadiness(demoMode ? undefined : tenantId, true);
  const trading = useTradingAccess(demoMode ? undefined : tenantId, { reconcileOnFetch: true });
  const opportunities = useBusinessOpportunityMatches(demoMode ? undefined : tenantId);
  const documents = props.contact.documents || [];
  const missingDocuments = documents.filter((document) => document.required && document.status === 'Missing').length;
  const unreadMessages = portalMessages.filter((message) => message.sender !== 'client' && !message.read).length;
  const pendingTasks = (props.contact.clientTasks || []).filter((task) => task.status === 'pending');
  const nextTask = pendingTasks[0] || null;

  useEffect(() => {
    setPortalMessages(props.contact.messageHistory || []);
  }, [props.contact.id, props.contact.messageHistory]);

  const journey = useMemo(
    () =>
      deriveClientJourneyState({
        contact: props.contact,
        demoMode,
        credit: credit.data,
        funding: funding.data,
        business: business.data,
        capital: capital.data,
        trading: trading.snapshot,
      }),
    [props.contact, demoMode, credit.data, funding.data, business.data, capital.data, trading.snapshot]
  );

  const referralPromptUnlocked = journey.fundingRange.unlocked || journey.summary.hasApprovedFunding;
  const referralData = useReferralJourney({
    contact: props.contact,
    userId: user?.id,
    promptUnlocked: referralPromptUnlocked,
  });
  const retentionSummary = useJourneyRetentionSummary(demoMode ? undefined : tenantId, user?.id);

  const fundingRangeLabel =
    journey.fundingRange.unlocked && journey.fundingRange.min !== null && journey.fundingRange.max !== null
      ? `$${journey.fundingRange.min.toLocaleString()} – $${journey.fundingRange.max.toLocaleString()}`
      : 'Complete credit upload to unlock estimate';
  const fundingRangeHelper = journey.fundingRange.unlocked
    ? 'Approval odds are based on readiness and profile signals.'
    : 'Upload a report to unlock the educational funding estimate.';
  const fundingHighlights = journey.summary.hasCreditAnalysis
    ? [
        `${credit.data?.recommendations?.recommendations?.length || 3} dispute opportunities identified`,
        'Utilization signals flagged for improvement',
        'Accounts to validate before applications',
        'Funding readiness cues are now active',
      ]
    : journey.summary.hasCreditReport
      ? [
          'Report received and queued for AI analysis',
          'Next: review your funding strategy',
          'Dispute opportunities will appear here',
          'Funding estimate unlocks after analysis',
        ]
      : [
          'Upload a report to unlock analysis',
          'Secure and encrypted workflow',
          'Phone or desktop friendly',
          'Funding strategy unlocks next',
        ];
  const primaryFundingAction = !journey.summary.hasCreditReport
    ? { label: 'Upload Credit Report', view: ViewMode.UPLOAD_CREDIT_REPORT, path: '/credit-report-upload' }
    : journey.summary.hasCreditAnalysis
      ? { label: 'Generate My Dispute Letters', view: ViewMode.PORTAL_CREDIT, path: '/portal/credit' }
      : { label: 'View Credit Analysis', view: ViewMode.PORTAL_CREDIT, path: '/portal/credit' };
  const secondaryFundingAction = journey.summary.hasCreditAnalysis ? 'Download Letters' : undefined;
  const tertiaryFundingAction = journey.summary.hasCreditAnalysis ? 'Send Certified via DocuPost' : undefined;

  const handlePortalNavigate = (view?: ViewMode, pathname?: string) => {
    if (!view) return;
    if (!demoMode && tenantId && pathname?.startsWith('/portal/grants')) {
      void logJourneyRetentionEvent({
        tenantId,
        userId: user?.id,
        eventType: 'grant_section_viewed',
        metadata: {
          route: pathname,
          source: 'client_home',
        },
      });
    }
    props.onNavigate?.(view, pathname);
  };

  useEffect(() => {
    if (demoMode || !tenantId) return;
    if (typeof window === 'undefined') return;

    const eventChecks: Array<[JourneyRetentionEventType, boolean, Record<string, unknown>]> = [
      ['first_login', true, { route: '/portal' }],
      ['credit_report_uploaded', journey.summary.hasCreditReport, { route: '/portal', readiness_score: journey.summary.readinessScore }],
      ['analysis_viewed', journey.summary.hasCreditAnalysis, { route: '/portal/credit', readiness_score: journey.summary.readinessScore }],
      ['funding_strategy_viewed', journey.summary.hasFundingStrategy, { route: '/portal/funding', readiness_score: journey.summary.readinessScore }],
      ['funding_readiness_viewed', journey.fundingRange.unlocked, { route: '/portal/funding', funding_range_unlocked: true }],
      ['application_started', journey.summary.hasFundingApplication, { route: '/portal/funding' }],
      ['application_outcome_logged', journey.summary.hasApprovedFunding, { route: '/portal/funding', approved: true }],
      ['trading_academy_unlocked', journey.tradingAcademy.unlocked, { route: '/portal/funding', unlocked: true }],
      ['referral_prompt_shown', referralData.data.promptUnlocked, { route: '/portal', trigger: referralData.data.triggerLabel }],
    ];

    eventChecks.forEach(([eventType, condition, metadata]) => {
      if (!condition) return;
      const storageKey = `journey-retention:${tenantId}:${user?.id || 'anon'}:${eventType}`;
      if (window.localStorage.getItem(storageKey) === '1') return;
      window.localStorage.setItem(storageKey, '1');
      void logJourneyRetentionEvent({
        tenantId,
        userId: user?.id,
        eventType,
        metadata,
      });
    });
  }, [
    demoMode,
    tenantId,
    user?.id,
    journey.summary.hasCreditReport,
    journey.summary.hasCreditAnalysis,
    journey.summary.hasFundingStrategy,
    journey.summary.hasFundingApplication,
    journey.summary.hasApprovedFunding,
    journey.summary.readinessScore,
    journey.fundingRange.unlocked,
    journey.tradingAcademy.unlocked,
    referralData.data.promptUnlocked,
    referralData.data.triggerLabel,
  ]);

  const overviewMetrics = [
    {
      label: 'Credit',
      value: demoMode
        ? '684'
        : String(
            credit.data.analysis?.latest_report?.personal_score
            || credit.data.analysis?.latest_report?.business_score
            || credit.data.recommendations?.recommendations?.length
            || 0
          ),
      helper: journey.summary.hasCreditAnalysis ? 'Analysis active' : 'Upload + analysis needed',
      tone: 'bg-[#EAF7FB]',
      view: ViewMode.PORTAL_CREDIT,
      path: '/portal/credit',
      action: journey.summary.hasCreditAnalysis ? 'Open Credit Analysis' : 'Upload Credit Report',
    },
    {
      label: 'Funding',
      value: `${journey.progress.percent}%`,
      helper:
        journey.fundingRange.unlocked && journey.fundingRange.min !== null && journey.fundingRange.max !== null
          ? `$${journey.fundingRange.min.toLocaleString()}-$${journey.fundingRange.max.toLocaleString()} range`
          : 'Estimate locked',
      tone: 'bg-[#EDF9EE]',
      view: ViewMode.PORTAL_FUNDING,
      path: '/portal/funding',
      action: 'Open Funding Engine',
    },
    {
      label: 'Business',
      value: `${journey.summary.businessProgressPercent}%`,
      helper: business.data?.readiness.ready ? 'Foundation ready' : 'Readiness in progress',
      tone: 'bg-[#F2EFFF]',
      view: ViewMode.PORTAL_BUSINESS,
      path: '/portal/business',
      action: 'Continue Setup',
    },
    {
      label: 'Unlocks',
      value: `${journey.badges.filter((badge) => badge.earned).length}`,
      helper: journey.tradingAcademy.unlocked ? 'Trading academy unlocked' : 'More rewards ahead',
      tone: 'bg-[#FFF8E8]',
      view: ViewMode.PORTAL_FUNDING,
      path: '/portal/funding',
      action: journey.tradingAcademy.unlocked ? 'Open Unlock Path' : 'View Unlock Path',
    },
  ];

  const clarityCards = [
    {
      label: 'Where am I?',
      title: 'Guided command center',
      helper: 'Your dashboard now leads with one story across credit, funding, rewards, and unlocks.',
      icon: <LayoutDashboard className="h-4 w-4" />,
      actionLabel: 'Open Funding Path',
      next: 'Next step: follow the highest-priority milestone.',
      onAction: () => props.onNavigate?.(ViewMode.PORTAL_FUNDING, '/portal/funding'),
    },
    {
      label: 'What is blocking me?',
      title: missingDocuments ? `${missingDocuments} required document${missingDocuments === 1 ? '' : 's'} missing` : 'No document blockers right now',
      helper: missingDocuments ? 'Upload the missing records to keep funding and grant workflows moving.' : 'Your document requirements look clear for the current stage.',
      icon: <FileText className="h-4 w-4" />,
      actionLabel: missingDocuments ? 'Review Documents' : 'Open Business Setup',
      next: missingDocuments ? 'Next step: clear upload blockers before funding review.' : 'Next step: keep readiness current in business setup.',
      onAction: () => props.onNavigate?.(missingDocuments ? ViewMode.PORTAL_CREDIT : ViewMode.PORTAL_BUSINESS, missingDocuments ? '/portal/credit' : '/portal/business'),
    },
    {
      label: 'What do I do next?',
      title: nextTask?.title || journey.hero.ctaLabel,
      helper: nextTask?.description || journey.hero.subtitle,
      icon: <ArrowRight className="h-4 w-4" />,
      actionLabel: journey.hero.ctaLabel,
      next: 'Next step: complete this action to unlock the next milestone.',
      onAction: () => props.onNavigate?.(journey.hero.ctaView, journey.hero.ctaPath),
    },
  ];

  if (selectedSection === 'messages') {
    return (
      <div className="mx-auto max-w-[1320px] space-y-6 pb-10 subpixel-antialiased">
        <section className="flex flex-col gap-4 rounded-[2rem] border border-[#DFE7F4] bg-white p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-[#607CC1]">Client dashboard</p>
            <h1 className="mt-2 text-[2.2rem] font-black tracking-tight text-[#1B2C61]">Messages</h1>
            <p className="mt-2 max-w-2xl text-base text-[#61769D]">
              First-party portal chat is durable. Messages are written into the shared Nexus inbox model and rehydrate on reload.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedSection('overview')}
            className="inline-flex items-center justify-center rounded-full border border-[#D5E4FF] bg-[#EEF4FF] px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#4677E6]"
          >
            Back to Overview
          </button>
        </section>

        <PortalChatPanel
          contact={props.contact}
          messages={portalMessages}
          onMessagesChange={setPortalMessages}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1320px] space-y-6 pb-10 subpixel-antialiased">
      <FundingJourneyHero
        eyebrow={journey.hero.eyebrow}
        title={journey.hero.title}
        subtitle={journey.hero.subtitle}
        ctaLabel={journey.hero.ctaLabel}
        supportText={journey.hero.supportText}
        onAction={() => handlePortalNavigate(journey.hero.ctaView, journey.hero.ctaPath)}
        onSecondaryAction={() => setSelectedSection('messages')}
      />

      <FundingProgressBar
        percent={journey.progress.percent}
        activeStepLabel={journey.progress.activeStepLabel}
        steps={journey.progress.steps}
        onStepAction={(step) => handlePortalNavigate(step.ctaView, step.ctaPath)}
        onOverviewAction={() => handlePortalNavigate(ViewMode.PORTAL_FUNDING, '/portal/funding')}
      />

      <AchievementBadges
        badges={journey.badges}
        onBadgeAction={(badge) => handlePortalNavigate(badge.ctaView, badge.ctaPath)}
      />

      <FundingProgressSection
        title={journey.summary.hasCreditAnalysis ? 'Your Credit Analysis Is Ready' : journey.summary.hasCreditReport ? 'Credit Report Uploaded' : 'Step 1: Upload Your Credit Report'}
        subtitle={journey.summary.hasCreditAnalysis
          ? 'Review your findings, generate dispute letters, and keep funding readiness moving.'
          : journey.summary.hasCreditReport
            ? 'Analysis is processing. Funding strategy and estimate unlock next.'
            : 'This unlocks your funding strategy, estimated funding range, and next approvals.'}
        readinessPercent={journey.summary.readinessScore}
        rangeLabel={fundingRangeLabel}
        rangeHelper={fundingRangeHelper}
        highlights={fundingHighlights}
        primaryActionLabel={primaryFundingAction.label}
        secondaryActionLabel={secondaryFundingAction}
        tertiaryActionLabel={tertiaryFundingAction}
        onPrimaryAction={() => handlePortalNavigate(primaryFundingAction.view, primaryFundingAction.path)}
        onSecondaryAction={secondaryFundingAction ? () => handlePortalNavigate(ViewMode.PORTAL_CREDIT, '/portal/credit') : undefined}
        onTertiaryAction={tertiaryFundingAction ? () => handlePortalNavigate(ViewMode.PORTAL_CREDIT, '/portal/credit') : undefined}
      />

      <BusinessOpportunitiesSection
        matches={opportunities.data?.matches || []}
        loading={opportunities.loading}
        error={opportunities.error}
        readinessScore={journey.summary.readinessScore}
        estimatedFundingUnlocked={journey.fundingRange.unlocked}
        onNavigate={handlePortalNavigate}
      />

      <section className="grid gap-6 xl:grid-cols-2">
        <EstimatedFundingRangeCard
          unlocked={journey.fundingRange.unlocked}
          min={journey.fundingRange.min}
          max={journey.fundingRange.max}
          helper={journey.fundingRange.helper}
          onPrimaryAction={() =>
            handlePortalNavigate(
              journey.fundingRange.unlocked ? ViewMode.PORTAL_FUNDING : ViewMode.UPLOAD_CREDIT_REPORT,
              journey.fundingRange.unlocked ? '/portal/funding' : '/credit-report-upload'
            )
          }
          onSecondaryAction={() => handlePortalNavigate(ViewMode.PORTAL_FUNDING, '/portal/funding')}
        />
        <TradingAcademyUnlockCard
          unlocked={journey.tradingAcademy.unlocked}
          statusLabel={journey.tradingAcademy.statusLabel}
          title={journey.tradingAcademy.title}
          subtitle={journey.tradingAcademy.subtitle}
          helper={journey.tradingAcademy.helper}
          ctaLabel={journey.tradingAcademy.ctaLabel}
          checklist={journey.tradingAcademy.checklist}
          onAction={() => handlePortalNavigate(ViewMode.PORTAL_FUNDING, '/portal/funding')}
        />
      </section>

      <ReferralCard
        unlocked={referralData.data.promptUnlocked}
        triggerLabel={referralData.data.triggerLabel}
        referralLink={referralData.data.referralLink}
        totalClicks={referralData.data.totalClicks}
        totalSignups={referralData.data.totalSignups}
        fundedReferrals={referralData.data.fundedReferrals}
        activeReferrals={referralData.data.activeReferrals}
        commissionPending={referralData.data.commissionPending}
        commissionPaid={referralData.data.commissionPaid}
        estimatedEarnings={referralData.data.estimatedEarnings}
        level={referralData.data.level}
        progressPercent={referralData.data.progressPercent}
        nextTierLabel={referralData.data.nextTierLabel}
        loading={referralData.loading}
        error={referralData.error}
        onCopyLink={() => {
          if (demoMode || !tenantId) return;
          void logJourneyRetentionEvent({
            tenantId,
            userId: user?.id,
            eventType: 'referral_link_copied',
            metadata: {
              route: '/portal',
              referral_level: referralData.data.level,
            },
          });
        }}
      />

      <section className="rounded-[2rem] border border-[#DFE7F4] bg-white px-5 py-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#91A1BC]">Existing modules</p>
            <h2 className="mt-2 text-[2rem] font-black tracking-tight text-[#17233D]">Portal Modules</h2>
          </div>
          <p className="text-sm text-[#61769D]">All existing features remain connected below the guided journey.</p>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-6">
          {modules.map((module) => (
            <button
              key={module.key}
              type="button"
              onClick={() => {
                if (module.kind === 'panel') {
                  setSelectedSection(module.key === 'messages' ? 'messages' : 'overview');
                  return;
                }
                handlePortalNavigate(module.view, module.path);
              }}
              className={`rounded-[1.35rem] border px-4 py-4 text-left transition-all ${
                (module.key === 'overview' && selectedSection === 'overview') || (module.key === 'messages' && selectedSection === 'messages')
                  ? 'border-[#24C7F4] bg-[#E9FAFE]'
                  : 'border-[#D9E2F2] bg-white hover:border-[#BFD0EC] hover:bg-[#FCFDFF]'
              }`}
            >
              <div className="flex items-start gap-4 overflow-hidden">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] bg-[#17233D] text-white">
                  {module.icon}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[1rem] font-black tracking-tight text-[#17233D] xl:text-[1.1rem]">{module.title}</p>
                  <p className="mt-1 line-clamp-2 text-[0.84rem] leading-6 text-[#61769D] xl:text-[0.95rem]">{module.description}</p>
                  <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#5C77BD]">
                    Next step: {module.kind === 'route' ? 'open module workflow' : 'switch dashboard context'}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#91A1BC]">Supporting detail</p>
          <h2 className="mt-2 text-[2.4rem] font-black tracking-tight text-[#17233D]">Nexus Command View</h2>
          <p className="mt-2 text-lg text-[#61769D]">Existing cross-module tools stay available beneath the journey layer.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {overviewMetrics.map((metric) => (
            <article key={metric.label} className={`rounded-[1.7rem] border border-[#E4ECF8] p-5 shadow-sm ${metric.tone}`}>
              <p className="text-lg font-black text-[#29417E]">{metric.label}</p>
              <p className="mt-5 text-[3rem] font-black leading-none tracking-tight text-[#17233D]">{metric.value}</p>
              <p className="mt-10 text-sm font-medium text-[#61769D]">{metric.helper}</p>
              <button
                type="button"
                onClick={() => handlePortalNavigate(metric.view, metric.path)}
                className="mt-4 inline-flex items-center rounded-full border border-[#D5E4FF] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#4677E6]"
              >
                {metric.action}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[2rem] border border-[#DFE7F4] bg-white p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
          <h2 className="text-[2rem] font-black tracking-tight text-[#17233D]">Priority actions across all modules</h2>
          <div className="mt-8 space-y-3">
            {priorityActions.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={() => handlePortalNavigate(item.view, item.path)}
                className="flex w-full items-center justify-between gap-4 rounded-[1.2rem] border border-[#DCE5F4] bg-[#F9FBFE] px-4 py-3 text-left transition-all hover:border-[#BFD0EC] hover:bg-[#FCFDFF]"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#18233D] text-xs font-black text-white">{index + 1}</div>
                  <div className="min-w-0">
                    <p className="text-[0.78rem] font-medium text-[#7185A9]">{item.module}</p>
                    <p className="truncate text-[1.05rem] font-bold tracking-tight text-[#17233D]">{item.title}</p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#5C77BD]">{item.next}</p>
                  </div>
                </div>
                <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${item.signal === 'High' ? 'bg-[#FFECEF] text-[#E25A74]' : 'bg-[#FFF3DD] text-[#C27A24]'}`}>
                  {item.signal}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-[#DFE7F4] bg-white p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
            <h2 className="text-[2rem] font-black tracking-tight text-[#17233D]">Overall progress</h2>
            <div className="mt-12 flex h-[250px] items-end justify-center gap-8 px-4 pb-10 sm:gap-10">
              {progressBars.map((height, index) => (
                <div key={`progress-${index}`} className="flex flex-col items-center gap-2">
                  <div className="w-10 rounded-t-[0.9rem] rounded-b-[0.75rem] bg-[#31BCD8] shadow-[inset_0_-10px_18px_rgba(7,109,129,0.10)] sm:w-12" style={{ height }} />
                  <span className="text-sm font-medium text-[#6F82A7]">M{index + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {clarityCards.map((card) => (
          <article key={card.label} className="rounded-[1.7rem] border border-[#DFE7F4] bg-white p-5 shadow-[0_16px_44px_rgba(36,58,114,0.04)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-[#EEF4FF] text-[#4677E6]">
              {card.icon}
            </div>
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">{card.label}</p>
            <p className="mt-2 text-[1.05rem] font-black tracking-tight text-[#17233D]">{card.title}</p>
            <p className="mt-2 text-sm text-[#61769D]">{card.helper}</p>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#5C77BD]">{card.next}</p>
            <button
              type="button"
              onClick={card.onAction}
              className="mt-4 inline-flex items-center rounded-full border border-[#D5E4FF] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#4677E6]"
            >
              {card.actionLabel}
            </button>
          </article>
        ))}
        <JourneyRetentionCard
          summary={retentionSummary.data}
          loading={retentionSummary.loading}
          error={retentionSummary.error}
        />
      </section>

      <section className="rounded-[2rem] border border-[#DFE7F4] bg-white p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
        <h2 className="text-[1.55rem] font-black tracking-tight text-[#17233D]">Attention rail</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => handlePortalNavigate(ViewMode.PORTAL_FUNDING, '/portal/funding')}
            className="flex items-start gap-3 rounded-[1.2rem] border border-[#FFE1E7] bg-[#FFF6F8] px-4 py-3 text-left transition-all hover:border-[#FFC9D5]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 text-[#E25A74]" />
            <div>
              <p className="text-sm font-black tracking-tight text-[#17233D]">Funding is strongest after required uploads are complete</p>
              <p className="mt-1 text-sm text-[#61769D]">Missing statements and identity records will slow lender and grant progress.</p>
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#C75873]">Next step: open funding blockers and clear uploads</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setSelectedSection('messages')}
            className="flex items-start gap-3 rounded-[1.2rem] border border-[#E4ECF8] bg-[#FBFDFF] px-4 py-3 text-left transition-all hover:border-[#C8D8F4]"
          >
            <MessageSquare className="mt-0.5 h-4 w-4 text-[#4677E6]" />
            <div>
              <p className="text-sm font-black tracking-tight text-[#17233D]">Messaging is your workflow hub</p>
              <p className="mt-1 text-sm text-[#61769D]">{unreadMessages} unread updates are waiting in the portal inbox.</p>
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#5C77BD]">Next step: open messages and respond to updates</p>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
