import React, { useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  CheckCircle2,
  CircleCheckBig,
  Clock3,
  CreditCard,
  Gift,
  Landmark,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import useBusinessFoundation from '../../hooks/useBusinessFoundation';
import useCreditCenter from '../../hooks/useCreditCenter';
import useFundingRoadmap from '../../hooks/useFundingRoadmap';
import usePortalTasks from '../../hooks/usePortalTasks';
import { BACKEND_CONFIG } from '../../adapters/config';
import { AgencyBranding, Contact, ViewMode } from '../../types';
import {
  GrantCatalogRow,
  GrantDraftRow,
  GrantMatchRow,
  GrantSubmissionRow,
  listGrantCatalog,
  listGrantDrafts,
  listGrantMatches,
  listGrantSubmissions,
} from '../../src/services/grantsEngineService';
import {
  fintechPrimaryButton,
  fintechSecondaryButton,
} from './fintechStyles';

type PortalModuleKey = 'overview' | 'credit' | 'funding' | 'business' | 'grants';

type PortalModuleConfig = {
  key: PortalModuleKey;
  title: string;
  description: string;
  view: ViewMode;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
};

type PortalGrantState = {
  catalog: GrantCatalogRow[];
  matches: GrantMatchRow[];
  drafts: GrantDraftRow[];
  submissions: GrantSubmissionRow[];
  loading: boolean;
  error: string;
};

const shellClass = 'rounded-[2rem] border border-[#D8E4FF] bg-white shadow-[0_24px_90px_rgba(69,99,211,0.10)]';
const insetClass = 'rounded-[1.4rem] border border-[#E4ECFF] bg-[#F8FBFF]';
const metricClass = 'rounded-[1.5rem] border border-[#DDE7FF] bg-white p-5 shadow-[0_18px_50px_rgba(86,119,232,0.08)]';
const sectionEyebrow = 'text-[11px] font-black uppercase tracking-[0.22em] text-[#5E7BCE]';
const sectionTitle = 'mt-2 text-[1.75rem] font-black leading-tight tracking-tight text-[#21356E]';
const bodyText = 'text-sm leading-6 text-[#50628F]';

const flatShellClass = 'rounded-[2rem] border border-[#D8E2F2] bg-white shadow-[0_6px_18px_rgba(35,52,96,0.04)]';
const flatInsetClass = 'rounded-[1.25rem] border border-[#DCE5F4] bg-white';
const moduleCardClass = 'rounded-[1.35rem] border px-4 py-4 text-left transition-all';
const moduleIconClass = 'flex h-10 w-10 items-center justify-center rounded-[1rem] bg-[#17233D] text-white';

const MODULES: PortalModuleConfig[] = [
  {
    key: 'overview',
    title: 'Executive Overview',
    description: 'See credit, funding, business setup, and grants in one command view.',
    view: ViewMode.PORTAL_OVERVIEW,
    path: '/portal/overview',
    icon: LayoutDashboard,
    accent: 'from-slate-100 via-white to-blue-50',
  },
  {
    key: 'credit',
    title: 'Credit Optimization',
    description: 'Track bureau readiness, recommendations, and dispute-letter activity.',
    view: ViewMode.PORTAL_CREDIT,
    path: '/portal/credit',
    icon: CreditCard,
    accent: 'from-emerald-50 via-white to-teal-50',
  },
  {
    key: 'funding',
    title: 'Funding Engine',
    description: 'Monitor readiness, blockers, submissions, and next funding actions.',
    view: ViewMode.PORTAL_FUNDING,
    path: '/portal/funding',
    icon: Landmark,
    accent: 'from-blue-50 via-white to-cyan-50',
  },
  {
    key: 'business',
    title: 'Business Setup',
    description: 'Keep formation, compliance, and operating readiness on track.',
    view: ViewMode.PORTAL_BUSINESS,
    path: '/portal/business',
    icon: BriefcaseBusiness,
    accent: 'from-amber-50 via-white to-orange-50',
  },
  {
    key: 'grants',
    title: 'Grants & Opportunities',
    description: 'Review matched programs, deadlines, drafts, and submission status.',
    view: ViewMode.PORTAL_GRANTS,
    path: '/portal/grants',
    icon: Gift,
    accent: 'from-violet-50 via-white to-fuchsia-50',
  },
];

const DEMO_CREDIT_BUREAUS = [
  { bureau: 'Experian', score: 759, band: 'Excellent', accent: 'text-[#2E6AE9]' },
  { bureau: 'Equifax', score: 745, band: 'Very Good', accent: 'text-[#8B3F7A]' },
  { bureau: 'TransUnion', score: 751, band: 'Excellent', accent: 'text-[#4B9CEB]' },
];

const DEMO_FUNDING_APPLICATIONS = [
  { applicant: 'Walter Johnson', company: 'Beta Innovations', amount: '$7,245', status: 'Pending', updated: '11h ago' },
  { applicant: 'Sarah James', company: 'Acme Inc.', amount: '$15,000', status: 'Approved', updated: '2d ago' },
  { applicant: 'Zane Williams', company: 'Orion Enterprises', amount: '$22,000', status: 'In Review', updated: '4h ago' },
  { applicant: 'Lucas Rivera', company: 'NovaTech Systems', amount: '$11,500', status: 'In Review', updated: '1d ago' },
];

function getActiveModule(currentView: ViewMode): PortalModuleKey {
  switch (currentView) {
    case ViewMode.PORTAL_CREDIT:
      return 'credit';
    case ViewMode.PORTAL_FUNDING:
      return 'funding';
    case ViewMode.PORTAL_BUSINESS:
      return 'business';
    case ViewMode.PORTAL_GRANTS:
      return 'grants';
    case ViewMode.PORTAL_OVERVIEW:
    default:
      return 'overview';
  }
}

function formatCompactDate(value?: string | null): string {
  if (!value) return 'No date logged';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No date logged';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function formatPathLabel(value?: string | null): string {
  if (!value) return 'Not selected';
  return String(value)
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatCurrencyShort(value?: number | string | null): string {
  if (value === undefined || value === null || value === '') return '$0';
  const numericValue = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(numericValue)) return String(value);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(numericValue);
}

function extractItemLabel(item: any): string {
  return String(
    item?.title
    || item?.name
    || item?.action
    || item?.step_key
    || item?.provider_name
    || item?.product_name
    || item?.summary
    || 'Pending item'
  );
}

function extractItemDetail(item: any): string {
  return String(
    item?.description
    || item?.detail
    || item?.reasoning
    || item?.notes
    || item?.status
    || 'No supporting detail yet.'
  );
}

function StatusChip(props: { tone?: 'success' | 'warning' | 'default'; children: React.ReactNode }) {
  const toneClass =
    props.tone === 'success'
      ? 'bg-[#E7F7EE] text-[#1F8D5C]'
      : props.tone === 'warning'
      ? 'bg-[#FFF3DD] text-[#B7791F]'
      : 'bg-[#EDF3FF] text-[#5677E8]';

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${toneClass}`}>{props.children}</span>;
}

function MetricCard(props: { label: string; value: string; helper: string; tone?: 'default' | 'success' | 'warning' | 'info' }) {
  const toneClass =
    props.tone === 'success'
      ? 'border-[#DCEEDB] bg-[#EFFAF1]'
      : props.tone === 'warning'
      ? 'border-[#F1E5BF] bg-[#FFF8E8]'
      : props.tone === 'info'
      ? 'border-[#D9EDF2] bg-[#ECFAFD]'
      : 'border-[#E6DFF4] bg-[#F3F0FF]';

  return (
    <article className={`rounded-[1.55rem] border px-4 py-4 sm:px-5 sm:py-5 ${toneClass}`}>
      <p className="text-[0.72rem] font-medium text-[#17233D]">{props.label}</p>
      <p className="mt-5 text-[2.1rem] font-black tracking-tight text-[#17233D] sm:text-[2.35rem]">{props.value}</p>
      <p className="mt-8 text-[0.72rem] font-medium text-[#61769D] sm:text-sm">{props.helper}</p>
    </article>
  );
}

function SectionCard(props: { eyebrow: string; title: string; helper?: string; children: React.ReactNode }) {
  return (
    <section className={`${flatShellClass} p-6`}>
      <p className={sectionEyebrow}>{props.eyebrow}</p>
      <h2 className={sectionTitle}>{props.title}</h2>
      {props.helper ? <p className={`mt-3 ${bodyText}`}>{props.helper}</p> : null}
      <div className="mt-5">{props.children}</div>
    </section>
  );
}

function EmptyState(props: { title: string; helper: string }) {
  return (
    <div className={`${flatInsetClass} flex min-h-40 flex-col items-center justify-center px-6 py-8 text-center`}>
      <ShieldCheck className="h-8 w-8 text-[#A7B8EA]" />
      <p className="mt-4 text-sm font-black uppercase tracking-[0.16em] text-[#5C77BD]">{props.title}</p>
      <p className={`mt-2 max-w-md ${bodyText}`}>{props.helper}</p>
    </div>
  );
}

export default function ClientPortalV2(props: {
  currentView: ViewMode;
  contact: Contact;
  branding: AgencyBranding;
  onLogout: () => void;
  onNavigate: (view: ViewMode, pathname?: string) => void;
  onOpenLegacyPortal: () => void;
}) {
  const { user } = useAuth();
  const demoMode = !user || BACKEND_CONFIG.mode === 'mvp_mock';
  const activeModuleKey = getActiveModule(props.currentView);
  const activeModule = MODULES.find((module) => module.key === activeModuleKey) || MODULES[0];

  const funding = useFundingRoadmap(demoMode ? undefined : props.contact.id, true);
  const tasks = usePortalTasks(demoMode ? undefined : props.contact.id, true);
  const credit = useCreditCenter(demoMode ? undefined : props.contact.id);
  const business = useBusinessFoundation(demoMode ? undefined : props.contact.id);
  const [grantState, setGrantState] = useState<PortalGrantState>({
    catalog: [],
    matches: [],
    drafts: [],
    submissions: [],
    loading: false,
    error: '',
  });

  useEffect(() => {
    let active = true;

    const loadGrantState = async () => {
      if (!user?.id) {
        if (active) {
          setGrantState({ catalog: [], matches: [], drafts: [], submissions: [], loading: false, error: '' });
        }
        return;
      }

      setGrantState((current) => ({ ...current, loading: true, error: '' }));

      const [catalogResult, matchesResult, draftsResult, submissionsResult] = await Promise.allSettled([
        listGrantCatalog(),
        listGrantMatches(user.id),
        listGrantDrafts(user.id),
        listGrantSubmissions(user.id),
      ]);

      if (!active) return;

      const failures = [catalogResult, matchesResult, draftsResult, submissionsResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => String(result.reason?.message || result.reason || 'Unable to load grants data.'));

      setGrantState({
        catalog: catalogResult.status === 'fulfilled' ? catalogResult.value : [],
        matches: matchesResult.status === 'fulfilled' ? matchesResult.value : [],
        drafts: draftsResult.status === 'fulfilled' ? draftsResult.value : [],
        submissions: submissionsResult.status === 'fulfilled' ? submissionsResult.value : [],
        loading: false,
        error: failures[0] || '',
      });
    };

    void loadGrantState();

    return () => {
      active = false;
    };
  }, [user?.id]);

  const urgentTasks = tasks.data?.urgent || [];
  const recommendedTasks = tasks.data?.recommended || [];
  const fundingBlockers = funding.data?.readiness.blockers || [];
  const fundingActions = funding.data?.recommendation.follow_up_actions || [];
  const businessCompleted = business.data?.readiness.completed_steps || [];
  const businessMissing = business.data?.readiness.missing_steps || [];
  const creditRecommendations = credit.data.recommendations?.recommendations || [];
  const creditLetters = credit.data.letters?.letters || [];
  const demoPriorityItems = [
    { module: 'Credit', title: 'Reduce utilization on 2 revolving accounts', description: 'Credit profile tuning to improve funding readiness.', signal: 'high' },
    { module: 'Funding', title: 'Upload bank statements for strongest offers', description: 'Funding review can widen matched capital ranges once statements are attached.', signal: 'high' },
    { module: 'Business', title: 'Complete annual report filing', description: 'Business compliance should be brought current before lender review.', signal: 'medium' },
    { module: 'Grants', title: 'Prepare narrative for Growth Catalyst Grant', description: 'Grants packet needs an application-ready summary and supporting materials.', signal: 'medium' },
  ];
  const nextGrantDeadline = useMemo(() => {
    const datedCatalog = grantState.catalog
      .filter((item) => item.deadline_date)
      .sort((left, right) => String(left.deadline_date).localeCompare(String(right.deadline_date)));
    return datedCatalog[0]?.deadline_date || null;
  }, [grantState.catalog]);

  const topPriorityItems = useMemo(() => {
    if (demoMode) return demoPriorityItems;
    const seeded = [...urgentTasks, ...recommendedTasks, ...fundingActions.map((action) => ({ title: action }))];
    return seeded.slice(0, 6);
  }, [demoMode, fundingActions, recommendedTasks, urgentTasks]);

  const progressBars = useMemo(() => {
    if (demoMode) {
      return [48, 62, 78, 86, 102, 116];
    }

    const creditBar = Math.min(120, Math.max(28, creditRecommendations.length > 0 ? 72 : 48));
    const fundingBar = Math.min(120, Math.max(34, funding.data?.readiness.ready ? 92 : 64));
    const businessBar = Math.min(120, Math.max(30, businessCompleted.length * 14));
    const grantsBar = Math.min(120, Math.max(26, grantState.matches.length * 16));

    return [creditBar - 10, creditBar, fundingBar, Math.max(fundingBar, businessBar), businessBar + 8, Math.max(grantsBar, businessBar + 16)];
  }, [businessCompleted.length, creditRecommendations.length, demoMode, funding.data?.readiness.ready, grantState.matches.length]);

  const renderOverview = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-[2.2rem] font-black tracking-tight text-[#17233D] sm:text-[3.1rem]">Nexus Command View</h1>
        <p className="mt-3 text-lg text-[#61769D]">A cross-module snapshot of credit, funding, business setup, and grants.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Credit"
          value={demoMode ? '684' : String(credit.data.analysis?.latest_report?.personal_score || credit.data.analysis?.latest_report?.business_score || creditRecommendations.length || '0')}
          helper={demoMode ? 'Personal + business' : creditRecommendations.length > 0 ? `${creditRecommendations.length} active recommendations` : 'Monitoring profile'}
          tone="info"
        />
        <MetricCard
          label="Funding"
          value={demoMode ? '78%' : funding.data?.stage || 'Review'}
          helper={demoMode ? '$25k-$75k range' : funding.data?.readiness.ready ? 'Ready for lender review' : 'Readiness in progress'}
          tone="success"
        />
        <MetricCard
          label="Business"
          value={demoMode ? '82%' : `${Math.round((businessCompleted.length / Math.max(1, businessCompleted.length + businessMissing.length)) * 100)}%`}
          helper={demoMode ? 'LLC active' : businessMissing.length === 0 ? 'Setup complete' : `${businessMissing.length} items remaining`}
          tone="default"
        />
        <MetricCard
          label="Grants"
          value={demoMode ? '$145k' : grantState.matches.length > 0 ? String(grantState.matches.length) : '$0'}
          helper={demoMode ? '9 matched opportunities' : nextGrantDeadline ? `Next deadline ${formatCompactDate(nextGrantDeadline)}` : 'No matched opportunities yet'}
          tone="warning"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className={`${flatShellClass} p-6`}>
          <h2 className="text-[2rem] font-black tracking-tight text-[#17233D]">Priority actions across all modules</h2>
          {topPriorityItems.length === 0 ? (
            <EmptyState title="No active tasks" helper="As client data lands, the overview will surface the next best actions here." />
          ) : (
            <div className="mt-8 space-y-3">
              {topPriorityItems.map((item, index) => (
                <div key={`${extractItemLabel(item)}-${index}`} className="flex items-center justify-between gap-4 rounded-[1.2rem] border border-[#DCE5F4] bg-[#F9FBFE] px-4 py-3">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#18233D] text-xs font-black text-white">{index + 1}</div>
                    <div className="min-w-0">
                      <p className="text-[0.78rem] font-medium text-[#7185A9]">{String((item as any).module || (index < urgentTasks.length ? 'Priority' : 'Queue'))}</p>
                      <p className="truncate text-[1.05rem] font-bold tracking-tight text-[#17233D]">{extractItemLabel(item)}</p>
                    </div>
                  </div>
                  <StatusChip tone={demoMode ? ((item as any).signal === 'high' ? 'warning' : 'default') : index < urgentTasks.length ? 'warning' : 'default'}>
                    {demoMode ? ((item as any).signal === 'high' ? 'High' : 'Medium') : index < urgentTasks.length ? 'Urgent' : 'Queued'}
                  </StatusChip>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={`${flatShellClass} p-6`}>
          <h2 className="text-[2rem] font-black tracking-tight text-[#17233D]">Overall progress</h2>
          <div className="mt-12 flex h-[250px] items-end justify-center gap-8 px-4 pb-10 sm:gap-10">
            {progressBars.map((height, index) => (
              <div key={`bar-${index}`} className="flex flex-col items-center gap-2">
                <div className="w-10 rounded-t-[0.9rem] rounded-b-[0.75rem] bg-[#31BCD8] shadow-[inset_0_-10px_18px_rgba(7,109,129,0.10)] sm:w-12" style={{ height }} />
                <span className="text-sm font-medium text-[#6F82A7]">M{index + 1}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  const renderCredit = () => {
    const latestAnalysis = credit.data.analysis?.latest_analysis;
    const latestReport = credit.data.analysis?.latest_report;
    const creditHeadline = String(
      latestAnalysis?.summary
      || latestAnalysis?.analysis_summary
      || latestReport?.bureau_summary
      || 'No bureau summary has been surfaced yet.'
    );
    const bureauSnapshot = DEMO_CREDIT_BUREAUS.map((bureau, index) => {
      const fallbackOffset = index === 0 ? 14 : index === 1 ? 0 : 6;
      const liveScore = latestReport?.personal_score || latestReport?.business_score;
      const score = demoMode ? bureau.score : Number(liveScore || bureau.score - fallbackOffset);
      return {
        ...bureau,
        score,
      };
    });
    const profileBalance = demoMode ? '$3,500' : formatCurrencyShort((latestReport as any)?.total_balance || (latestAnalysis as any)?.total_balance || 3500);
    const utilization = demoMode ? 'Very Good' : creditRecommendations.length > 2 ? 'Improving' : 'Stable';

    return (
      <div className="space-y-6">
        <section className={`${flatShellClass} p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className={sectionEyebrow}>Credit module</p>
              <h2 className="mt-2 text-[2rem] font-black tracking-tight text-[#17233D]">Credit Score Insights</h2>
              <p className="mt-2 text-sm text-[#61769D]">A cleaner view of bureau posture, profile health, and actionable score-improvement signals.</p>
            </div>
            <StatusChip tone={creditRecommendations.length > 0 ? 'warning' : 'success'}>{creditRecommendations.length > 0 ? 'Actions available' : 'Profile stable'}</StatusChip>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
            <div className="grid gap-3 sm:grid-cols-3">
              {bureauSnapshot.map((bureau) => (
                <article key={bureau.bureau} className="rounded-[1.35rem] border border-[#E1E9F6] bg-[#FBFDFF] p-4 shadow-[0_10px_28px_rgba(34,52,103,0.04)]">
                  <p className={`text-sm font-black ${bureau.accent}`}>{bureau.bureau}</p>
                  <div className="mt-4 flex items-end gap-2">
                    <span className="text-[2.8rem] font-black leading-none tracking-tight text-[#17233D]">{bureau.score}</span>
                    <span className="pb-1 text-sm font-semibold text-[#61769D]">{bureau.band}</span>
                  </div>
                </article>
              ))}
            </div>

            <div className="rounded-[1.5rem] border border-[#E1E9F6] bg-[linear-gradient(180deg,#FFFFFF_0%,#F7FBFF_100%)] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black tracking-tight text-[#17233D]">Credit profile details</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#7E90B2]">Trendline and tradeline posture</p>
                </div>
                <StatusChip tone="info">{utilization}</StatusChip>
              </div>
              <div className="mt-6 h-28 rounded-[1.2rem] bg-[linear-gradient(180deg,#F8FBFF_0%,#F0F7FF_100%)] px-4 py-4">
                <div className="flex h-full items-end gap-2">
                  {[26, 34, 40, 56, 74, 69].map((height, index) => (
                    <div key={`credit-trend-${index}`} className="flex-1 rounded-t-full bg-[linear-gradient(180deg,#94DDF0_0%,#4FA8F5_100%)]" style={{ height }} />
                  ))}
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1rem] border border-[#E6EDF8] bg-white px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7C8FB2]">Balance</p>
                  <p className="mt-2 text-lg font-black tracking-tight text-[#17233D]">{profileBalance}</p>
                </div>
                <div className="rounded-[1rem] border border-[#E6EDF8] bg-white px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7C8FB2]">Primary signal</p>
                  <p className="mt-2 text-lg font-black tracking-tight text-[#17233D]">{creditRecommendations.length > 0 ? 'Optimization window open' : 'Monitoring only'}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Reports" value={String(credit.data.analysis?.analyses.length || 0)} helper="Credit analyses currently stored for this client." tone="info" />
          <MetricCard label="Recommendations" value={String(creditRecommendations.length)} helper="Actionable items derived from the credit analysis workflow." tone={creditRecommendations.length > 0 ? 'warning' : 'default'} />
          <MetricCard label="Letters Drafted" value={String(creditLetters.length)} helper="Generated dispute-letter drafts available for review." tone={creditLetters.length > 0 ? 'success' : 'default'} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <SectionCard eyebrow="Credit Profile" title="Optimization status" helper={creditHeadline}>
            <div className="grid gap-3">
                <div className={`${flatInsetClass} px-4 py-4`}>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Latest report sync</p>
                <p className="mt-2 text-sm font-medium text-slate-700">{latestReport ? 'Report history detected for this client.' : 'No report sync recorded yet.'}</p>
              </div>
              <div className={`${flatInsetClass} px-4 py-4`}>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Recommendation engine</p>
                <p className="mt-2 text-sm font-medium text-slate-700">{creditRecommendations.length > 0 ? `${creditRecommendations.length} recommended actions are ready for review.` : 'Recommendations will appear here as soon as analysis data is available.'}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard eyebrow="Action Plan" title="Recommended next moves" helper="This list is sourced from the existing credit recommendations service.">
            {creditRecommendations.length === 0 ? (
              <EmptyState title="No credit actions yet" helper="Once recommendations are generated, this module will surface them here without replacing the legacy portal workflow." />
            ) : (
              <div className="space-y-3">
                {creditRecommendations.slice(0, 6).map((item: any, index) => (
                  <div key={`${extractItemLabel(item)}-${index}`} className={`${flatInsetClass} px-4 py-4`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-slate-900">{extractItemLabel(item)}</p>
                      <StatusChip tone="warning">Open</StatusChip>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{extractItemDetail(item)}</p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    );
  };

  const renderFunding = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Current Stage" value={funding.data?.stage || 'Review'} helper="Latest stage from the funding roadmap service." tone={funding.data?.readiness.ready ? 'success' : 'info'} />
        <MetricCard label="Blockers" value={String(fundingBlockers.length)} helper="Explicit readiness blockers currently attached to the tenant." tone={fundingBlockers.length > 0 ? 'warning' : 'success'} />
        <MetricCard label="Applications" value={String(funding.data?.applications.length || 0)} helper="Logged funding applications from the current roadmap history." tone="default" />
        <MetricCard label="Results" value={String((funding.data?.results.length || 0) + (funding.data?.legacy_outcomes.length || 0))} helper="Combined current and legacy funding outcomes." tone="default" />
      </div>

      <section className={`${flatShellClass} p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className={sectionEyebrow}>Funding module</p>
            <h2 className="mt-2 text-[2rem] font-black tracking-tight text-[#17233D]">Funding Applications</h2>
            <p className="mt-2 text-sm text-[#61769D]">A faster operating view of current applications, statuses, and funding amounts.</p>
          </div>
          <StatusChip tone={fundingBlockers.length > 0 ? 'warning' : 'success'}>{fundingBlockers.length > 0 ? 'Review blockers' : 'Pipeline moving'}</StatusChip>
        </div>

        <div className="mt-6 space-y-3">
          {(demoMode || (funding.data?.applications.length || 0) === 0
            ? DEMO_FUNDING_APPLICATIONS
            : funding.data?.applications.slice(0, 4).map((application: any, index: number) => ({
                applicant: extractItemLabel(application),
                company: String(application?.lender_name || application?.provider_name || application?.type || `Application ${index + 1}`),
                amount: formatCurrencyShort(application?.requested_amount || application?.amount || application?.approved_amount || 0),
                status: formatPathLabel(application?.status || 'review'),
                updated: formatCompactDate(application?.updated_at || application?.submitted_at || application?.created_at || null),
              }))).map((application, index) => (
            <article key={`${application.applicant}-${index}`} className="flex flex-col gap-4 rounded-[1.45rem] border border-[#DCE5F4] bg-[linear-gradient(180deg,#FFFFFF_0%,#F9FBFE_100%)] px-5 py-4 shadow-[0_10px_28px_rgba(34,52,103,0.04)] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#EAF2FF,#F9FCFF)] text-sm font-black text-[#3A66D8]">
                  {application.applicant.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[1.02rem] font-black tracking-tight text-[#17233D]">{application.applicant}</p>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${application.status === 'Approved' ? 'bg-[#E8FAEF] text-[#178D5B]' : application.status === 'Pending' ? 'bg-[#FFF3DD] text-[#B7791F]' : 'bg-[#EEF4FF] text-[#4A73DF]'}`}>
                      {application.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-[#61769D]">{application.company}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#92A2BF]">Updated {application.updated}</p>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7E90B2]">Amount</p>
                <p className="mt-2 text-[1.35rem] font-black tracking-tight text-[#1C3164]">{application.amount}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <SectionCard eyebrow="Readiness" title="Funding posture" helper={funding.data?.recommendation.reasoning_summary || 'Readiness signals will appear once funding data is loaded.'}>
          {fundingBlockers.length === 0 ? (
            <EmptyState title="No blockers recorded" helper="This client currently has no explicit blocker list from the funding roadmap service." />
          ) : (
            <div className="space-y-3">
              {fundingBlockers.map((blocker, index) => (
                <div key={`${blocker}-${index}`} className={`${insetClass} flex items-start gap-3 px-4 py-4`}>
                  <TriangleAlert className="mt-0.5 h-4 w-4 text-amber-500" />
                  <div>
                    <p className="text-sm font-black text-slate-900">Blocker {index + 1}</p>
                    <p className="mt-1 text-sm text-slate-500">{blocker}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard eyebrow="Recommended Actions" title="Next funding moves" helper="The current roadmap already produces follow-up actions. This page makes them visible in the new shell.">
          {fundingActions.length === 0 ? (
            <EmptyState title="No follow-up actions yet" helper="When the roadmap emits next steps, they will appear here." />
          ) : (
            <div className="space-y-3">
              {fundingActions.map((action, index) => (
                <div key={`${action}-${index}`} className={`${insetClass} flex items-start gap-3 px-4 py-4`}>
                  <CircleCheckBig className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <div>
                    <p className="text-sm font-black text-slate-900">{action}</p>
                    <p className="mt-1 text-sm text-slate-500">Recommended by the existing funding decision engine.</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );

  const renderBusiness = () => {
    const progressRows = business.data?.progress || [];

    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Current Path" value={formatPathLabel(business.data?.readiness.path)} helper="Business-foundation path currently selected for the tenant." tone="info" />
          <MetricCard label="Completed Steps" value={String(businessCompleted.length)} helper="Steps marked complete in the business foundation tracker." tone="success" />
          <MetricCard label="Missing Steps" value={String(businessMissing.length)} helper="Remaining steps preventing business-readiness completion." tone={businessMissing.length > 0 ? 'warning' : 'success'} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <SectionCard eyebrow="Progress" title="Business setup roadmap" helper="This is a direct light-mode wrapper over the existing business foundation data model.">
            {progressRows.length === 0 ? (
              <EmptyState title="No business steps logged" helper="Once setup progress is recorded, it will appear here with the selected path." />
            ) : (
              <div className="space-y-3">
                {progressRows.slice(0, 8).map((row: any, index) => {
                  const status = String(row?.step_status || row?.status || 'not_started');
                  const tone = status === 'completed' ? 'success' : status === 'blocked' ? 'warning' : 'default';

                  return (
                    <div key={`${extractItemLabel(row)}-${index}`} className={`${insetClass} flex items-start justify-between gap-4 px-4 py-4`}>
                      <div>
                        <p className="text-sm font-black text-slate-900">{extractItemLabel(row)}</p>
                        <p className="mt-1 text-sm text-slate-500">{extractItemDetail(row)}</p>
                      </div>
                      <StatusChip tone={tone === 'default' ? 'default' : tone}>{formatPathLabel(status)}</StatusChip>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard eyebrow="Readiness" title="What remains" helper="Missing steps and blockers are surfaced directly from the readiness object.">
            {businessMissing.length === 0 ? (
              <EmptyState title="No missing steps" helper="This business profile currently looks complete in the foundation workflow." />
            ) : (
              <div className="space-y-3">
                {businessMissing.map((step, index) => (
                  <div key={`${step}-${index}`} className={`${insetClass} flex items-start gap-3 px-4 py-4`}>
                    <Clock3 className="mt-0.5 h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-black text-slate-900">{formatPathLabel(step)}</p>
                      <p className="mt-1 text-sm text-slate-500">This step still needs completion before the business path is fully ready.</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    );
  };

  const renderGrants = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Matched Programs" value={String(grantState.matches.length)} helper="Current shortlist and matched grant opportunities." tone={grantState.matches.length > 0 ? 'success' : 'default'} />
        <MetricCard label="Drafts" value={String(grantState.drafts.length)} helper="Grant application drafts recorded for this client." tone="info" />
        <MetricCard label="Submissions" value={String(grantState.submissions.length)} helper="Tracked grant submissions visible to the current user." tone="default" />
        <MetricCard label="Next Deadline" value={nextGrantDeadline ? formatCompactDate(nextGrantDeadline) : 'TBD'} helper="Earliest visible grant catalog deadline in the current dataset." tone={nextGrantDeadline ? 'warning' : 'default'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <SectionCard eyebrow="Matched Opportunities" title="Grant pipeline" helper="This module reuses the existing grant catalog and user-level match tables.">
          {grantState.loading ? (
            <EmptyState title="Loading grants" helper="Grant matches, drafts, and submissions are loading for the current user." />
          ) : grantState.matches.length === 0 ? (
            <EmptyState title="No grant matches yet" helper="The grants engine has not surfaced matched opportunities for this user yet." />
          ) : (
            <div className="space-y-3">
              {grantState.matches.slice(0, 6).map((match) => (
                <div key={match.id} className={`${insetClass} px-4 py-4`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-black text-slate-900">{match.grants_catalog?.name || 'Grant opportunity'}</p>
                      <p className="mt-1 text-sm text-slate-500">{match.grants_catalog?.sponsor || 'Sponsor pending'} • Match score {match.match_score}</p>
                    </div>
                    <StatusChip tone={match.status === 'awarded' ? 'success' : 'default'}>{formatPathLabel(match.status)}</StatusChip>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">Deadline: {formatCompactDate(match.grants_catalog?.deadline_date || null)}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard eyebrow="Submission Status" title="Drafts and filed programs" helper="Draft and submission counts are isolated from the old portal until cutover is approved.">
          {grantState.error ? <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{grantState.error}</p> : null}
          <div className="space-y-3">
            <div className={`${insetClass} px-4 py-4`}>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Draft queue</p>
              <p className="mt-2 text-sm font-medium text-slate-700">{grantState.drafts.length > 0 ? `${grantState.drafts.length} draft packets are currently tracked.` : 'No draft packets created yet.'}</p>
            </div>
            <div className={`${insetClass} px-4 py-4`}>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Submission queue</p>
              <p className="mt-2 text-sm font-medium text-slate-700">{grantState.submissions.length > 0 ? `${grantState.submissions.length} submissions have been logged.` : 'No grant submissions logged yet.'}</p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );

  const content = (() => {
    switch (activeModuleKey) {
      case 'credit':
        return renderCredit();
      case 'funding':
        return renderFunding();
      case 'business':
        return renderBusiness();
      case 'grants':
        return renderGrants();
      case 'overview':
      default:
        return renderOverview();
    }
  })();

  const loadingAny = demoMode ? false : funding.loading || tasks.loading || credit.loading || business.loading;
  const moduleError = demoMode ? '' : funding.error || tasks.error || credit.error || business.error || grantState.error;

  return (
      <div className="min-h-full bg-[linear-gradient(180deg,#F6FAFF_0%,#EEF5FF_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-[#607CC1]">NexusOne client portal</p>
            <p className="mt-2 text-base text-[#61769D]">{demoMode ? 'Light-mode shell preview with representative data.' : 'Parallel route group using current services and additive routing.'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusChip tone={demoMode ? 'success' : moduleError ? 'warning' : 'success'}>{demoMode ? 'Demo data active' : moduleError ? 'Stable fallback mode' : 'Live data connected'}</StatusChip>
            <button type="button" onClick={props.onOpenLegacyPortal} className={fintechSecondaryButton}>
              {demoMode ? 'Back To Landing' : 'Open Legacy Workspace'}
            </button>
            {!demoMode ? (
              <button type="button" onClick={props.onLogout} className={fintechPrimaryButton}>
                <span className="inline-flex items-center gap-2"><LogOut className="h-4 w-4" /> Sign Out</span>
              </button>
            ) : null}
          </div>
        </section>

        <section className={`${flatShellClass} p-5`}>
          <h2 className="text-[2rem] font-black tracking-tight text-[#17233D]">Your Nexus Modules</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-5">
            {MODULES.map((module) => {
              const Icon = module.icon;
              const isActive = module.key === activeModuleKey;

              return (
                <button
                  key={module.key}
                  type="button"
                  onClick={() => props.onNavigate(module.view, module.path)}
                  className={`${moduleCardClass} ${isActive ? 'border-[#28C7F4] bg-[#EAFBFF] text-[#17233D]' : 'border-[#D9E2F2] bg-white text-[#17233D] hover:border-[#BFD0EC] hover:bg-[#FCFDFF]'}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={moduleIconClass}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[0.95rem] font-black tracking-tight text-[#17233D] xl:text-[1.1rem]">{module.title}</p>
                      <p className="mt-1 text-[0.82rem] leading-6 text-[#61769D] xl:text-[0.95rem]">{module.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {loadingAny ? (
          <div className={`${shellClass} flex items-center gap-3 px-5 py-4 text-sm text-[#5A72A8]`}>
            <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
            Syncing credit, funding, business, and task data for the new portal shell.
          </div>
        ) : null}

        {moduleError && !grantState.loading ? (
          <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700">
            {moduleError}
          </div>
        ) : null}

        {content}

        <section className={`${flatShellClass} flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between`}>
          <div>
            <p className={sectionEyebrow}>Parallel rollout note</p>
            <p className="mt-2 text-lg font-black tracking-tight text-[#17233D]">{demoMode ? 'Preview mode is bypassing auth for shell review.' : 'The old portal remains the default workflow.'}</p>
            <p className={`mt-2 max-w-3xl ${bodyText}`}>{demoMode ? 'Local development is using mock auth and preview data so the light-theme shell can be reviewed without captcha or hosted-auth dependencies.' : 'This route group is intentionally additive. It uses current services and data hooks, leaves admin surfaces alone, and gives you a cleaner client-facing shell to validate before any cutover decision.'}</p>
          </div>
          <button type="button" onClick={props.onOpenLegacyPortal} className={fintechSecondaryButton}>
            {demoMode ? 'Return To Landing' : 'Back To Legacy Portal'}
          </button>
        </section>
      </div>
    </div>
  );
}