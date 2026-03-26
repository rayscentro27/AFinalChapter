import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Lock, LogOut, RefreshCw, Sparkles } from 'lucide-react';
import { AgencyBranding, Contact, PortalExperienceTarget } from '../types';
import MessageCenter from './MessageCenter';
import ClientDocumentWorkspace from './documents/ClientDocumentWorkspace';
import BusinessProfile from './BusinessProfile';
import SubscriptionManager from './SubscriptionManager';
import CapitalProtectionPanel from './CapitalProtectionPanel';
import CapitalAllocationPanel from './CapitalAllocationPanel';
import InvestmentLab from './InvestmentLab';
import useFundingRoadmap from '../hooks/useFundingRoadmap';
import usePortalTasks from '../hooks/usePortalTasks';
import useCreditCenter from '../hooks/useCreditCenter';
import useBusinessFoundation from '../hooks/useBusinessFoundation';
import usePortalAI from '../hooks/usePortalAI';
import useCapitalReadiness from '../hooks/useCapitalReadiness';
import useTradingAccess from '../hooks/useTradingAccess';
import useLifecycleReminders from '../hooks/useLifecycleReminders';
import useInternalThreads from '../hooks/useInternalThreads';
import useClientActivityFeed from '../hooks/useClientActivityFeed';
import useClientExperience from '../hooks/useClientExperience';
import TaskLinkedMessageCard from './internalComms/TaskLinkedMessageCard';
import DealTimelinePage from './timeline/DealTimelinePage';
import {
  FundingDecisionStatus,
  getFundingHistory,
  logFundingApplyEvent,
} from '../services/fundingFoundationService';
import { formatClientProfileType } from '../services/clientExperienceService';
import {
  fintechHero,
  fintechInput,
  fintechInset,
  fintechMetric,
  fintechPrimaryButton,
  fintechSecondaryButton,
  fintechShell,
  fintechTextarea,
  fintechTertiaryButton,
} from './portal/fintechStyles';

const shellClass = fintechShell;
const softPanelClass = fintechInset;
const buttonPrimaryClass = fintechPrimaryButton;
const buttonSecondaryClass = fintechSecondaryButton;
const buttonTertiaryClass = fintechTertiaryButton;

type PortalTab =
  | 'home'
  | 'fundingRoadmap'
  | 'actionCenter'
  | 'activity'
  | 'messages'
  | 'documents'
  | 'account'
  | 'creditCenter'
  | 'businessFoundation'
  | 'capitalProtection'
  | 'capitalAllocation'
  | 'tradingAccess';

type ApplyFormState = {
  provider_name: string;
  product_name: string;
  bureau_used: string;
  decision_status: FundingDecisionStatus;
  approved_amount: string;
  notes: string;
  inquiry_detected: boolean;
};

const NEW_BUSINESS_STEPS = [
  'llc_setup',
  'ein_setup',
  'business_address',
  'business_phone',
  'business_website',
  'naics_classification',
  'business_bank_account',
];

const EXISTING_BUSINESS_STEPS = [
  'review_current_setup',
  'update_business_address',
  'align_irs_ein',
  'update_bank_records',
  'website_phone_consistency',
  'final_consistency_check',
];

function toLabel(step: string): string {
  return step
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function PrimaryCard(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className={`${shellClass} p-6`}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#607CC1]">{props.title}</p>
      {props.subtitle ? <h3 className="mt-2 text-[2rem] font-black tracking-tight text-[#17233D] leading-tight">{props.subtitle}</h3> : null}
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function ExecutiveStat(props: { label: string; value: string; tone?: 'default' | 'success' | 'info' }) {
  const toneClass =
    props.tone === 'success'
      ? 'text-emerald-700 border-[#DCEEDB] bg-[#EFFAF1]'
      : props.tone === 'info'
      ? 'text-blue-700 border-[#D9EDF2] bg-[#ECFAFD]'
      : 'text-slate-900 border-[#E6DFF4] bg-[#F3F0FF]';

  return (
    <div className={`${fintechMetric} ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{props.label}</p>
      <p className="mt-2 text-lg font-black tracking-tight">{props.value}</p>
    </div>
  );
}

function TaskPill({ status }: { status: string }) {
  const normalized = String(status || '').toLowerCase();
  const cls =
    normalized === 'completed'
      ? 'bg-emerald-100 text-emerald-700'
      : normalized === 'urgent'
      ? 'bg-red-100 text-red-700'
      : 'bg-amber-100 text-amber-700';
  return <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${cls}`}>{status}</span>;
}

function AssistantPanel(props: {
  title: string;
  loading: boolean;
  error: string;
  answer: string;
  onAsk: () => Promise<void>;
}) {
  return (
    <section className={`${shellClass} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Portal AI</p>
          <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">{props.title}</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">Keep guidance secondary to the workflow. Use it when you need the next best action clarified.</p>
        </div>
        <button
          type="button"
          onClick={() => void props.onAsk()}
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700"
        >
          {props.loading ? 'Loading Guidance...' : 'Refresh Guidance'}
        </button>
      </div>
      {props.error ? <p className="mt-4 text-sm font-medium text-red-600">{props.error}</p> : null}
      {props.answer ? (
        <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{props.answer}</pre>
      ) : null}
    </section>
  );
}

export default function FundingJourneyWorkspace(props: {
  contact: Contact;
  onUpdateContact: (contact: Contact) => void;
  branding: AgencyBranding;
  onLogout: () => void;
}) {
  const { contact, onUpdateContact, branding, onLogout } = props;
  const [activeTab, setActiveTab] = useState<PortalTab>('home');
  const [history, setHistory] = useState<{ applications: any[]; results: any[]; legacy_outcomes: any[] } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applySaving, setApplySaving] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applyForm, setApplyForm] = useState<ApplyFormState>({
    provider_name: '',
    product_name: '',
    bureau_used: '',
    decision_status: 'submitted',
    approved_amount: '',
    notes: '',
    inquiry_detected: false,
  });

  const isFunded = contact.status === 'Closed' || Boolean(contact.fundedDeals?.length);

  const roadmap = useFundingRoadmap(contact.id, false);
  const tasks = usePortalTasks(contact.id, true);
  const credit = useCreditCenter(contact.id);
  const business = useBusinessFoundation(contact.id);
  const capital = useCapitalReadiness(contact.id, true);
  const trading = useTradingAccess(contact.id, { reconcileOnFetch: true });
  const lifecycleReminders = useLifecycleReminders(contact.id, contact.company || contact.name);
  const internalThreads = useInternalThreads(contact, lifecycleReminders.reminders);
  const activityFeed = useClientActivityFeed({
    contact,
    currentStage: roadmap.data?.stage,
    portalTasks: tasks.data,
    fundingHistory: history,
    business: business.data,
    credit: credit.data,
    capital: capital.data,
    loadingStates: [roadmap.loading, tasks.loading, historyLoading, business.loading, credit.loading, capital.loading],
    errorStates: [roadmap.error, tasks.error, historyError, business.error, credit.error, capital.error],
    visibility: 'client',
  });
  const experience = useClientExperience({
    contact,
    roadmap: roadmap.data,
    tasks: tasks.data,
    business: business.data,
    credit: credit.data,
    capital: capital.data,
    isFunded,
  });

  const fundingAI = usePortalAI(contact.id, 'funding_guide');
  const creditAI = usePortalAI(contact.id, 'credit_advisor');
  const businessAI = usePortalAI(contact.id, 'business_setup_advisor');

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await getFundingHistory(contact.id);
      setHistory({
        applications: response.applications,
        results: response.results,
        legacy_outcomes: response.legacy_outcomes,
      });
    } catch (err: any) {
      setHistoryError(String(err?.message || 'Unable to load history.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [contact.id]);

  React.useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (!internalThreads.needsHistorySync) return;
    onUpdateContact({
      ...contact,
      messageHistory: internalThreads.syncedHistory,
    });
  }, [contact, internalThreads.needsHistorySync, internalThreads.syncedHistory, onUpdateContact]);

  const navItems: Array<{ key: PortalTab; label: string }> = [
    { key: 'home', label: 'Home' },
    { key: 'fundingRoadmap', label: 'Funding Roadmap' },
    { key: 'actionCenter', label: 'Action Center' },
    { key: 'activity', label: 'Activity' },
    { key: 'messages', label: 'Messages' },
    { key: 'documents', label: 'Documents' },
    { key: 'account', label: 'Account' },
  ];

  const quickItems = [
    { key: 'creditCenter' as PortalTab, label: 'Credit Center' },
    { key: 'businessFoundation' as PortalTab, label: 'Business Foundation' },
    ...(isFunded
      ? [
          { key: 'capitalProtection' as PortalTab, label: 'Capital Protection' },
          { key: 'capitalAllocation' as PortalTab, label: 'Capital Allocation' },
          { key: 'tradingAccess' as PortalTab, label: 'Trading Access' },
        ]
      : []),
  ];
  const orderedQuickItems = useMemo(
    () => experience.sortTargets(quickItems, experience.experienceConfig),
    [experience, quickItems]
  );

  const activeLabel = [...navItems, ...quickItems].find((item) => item.key === activeTab)?.label || 'Home';
  const topTaskTitle = tasks.data?.top_task?.title || experience.experienceConfig.emphasis.primaryGoal || 'Review your guided next step';
  const topTaskType = tasks.data?.top_task?.type || experience.experienceConfig.emphasis.statusLabel || 'workflow';
  const stageLabel = (roadmap.data?.stage || 'starting').replace(/_/g, ' ');

  const currentPathSteps = useMemo(() => {
    const path = business.data?.readiness?.path;
    if (path === 'new_business') return NEW_BUSINESS_STEPS;
    if (path === 'existing_business_optimization') return EXISTING_BUSINESS_STEPS;
    return [];
  }, [business.data?.readiness?.path]);

  const progressMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of business.data?.progress || []) {
      map.set(String(row.step_key), row);
    }
    return map;
  }, [business.data?.progress]);

  async function submitApplyLog() {
    setApplySaving(true);
    setApplyError('');
    try {
      await logFundingApplyEvent({
        tenant_id: contact.id,
        provider_name: applyForm.provider_name || undefined,
        product_name: applyForm.product_name || undefined,
        bureau_used: applyForm.bureau_used || undefined,
        decision_status: applyForm.decision_status,
        approved_amount: applyForm.approved_amount ? Number(applyForm.approved_amount) : null,
        notes: applyForm.notes || null,
        inquiry_detected: applyForm.inquiry_detected,
      });

      await Promise.all([
        roadmap.refresh(),
        tasks.refresh(),
        credit.refresh(),
        business.refresh(),
        capital.refresh(),
        trading.refresh(),
        fetchHistory(),
      ]);

      setShowApplyModal(false);
      setApplyForm({
        provider_name: '',
        product_name: '',
        bureau_used: '',
        decision_status: 'submitted',
        approved_amount: '',
        notes: '',
        inquiry_detected: false,
      });
    } catch (err: any) {
      setApplyError(String(err?.message || 'Unable to log funding application outcome.'));
    } finally {
      setApplySaving(false);
    }
  }

  function openReminderTarget(target: string) {
    if (target === 'grants') {
      window.location.hash = 'grants';
      return;
    }
    setActiveTab(target as PortalTab);
  }

  function openExperienceTarget(target: PortalExperienceTarget) {
    openReminderTarget(target);
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_55%,#f8fafc_100%)] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-8">
          <div className={`${fintechHero} flex items-start justify-between gap-4 flex-wrap px-5 py-5 md:px-6`}>
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{experience.experienceConfig.hero.eyebrow} · {branding.name || 'Nexus Portal'}</p>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">{experience.experienceConfig.hero.title}</h1>
              <p className="max-w-2xl text-sm text-slate-600">
                {experience.experienceConfig.hero.subtitle}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Current View: {activeLabel}</span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">Stage: {stageLabel}</span>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">Next Task: {topTaskType}</span>
                <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-fuchsia-700">Profile: {formatClientProfileType(experience.experienceConfig.profileType)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Priority Focus</p>
                <p className="mt-1 text-sm font-black text-slate-900">{topTaskTitle}</p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className={buttonSecondaryClass + ' inline-flex items-center gap-2 text-xs'}
              >
                <LogOut size={14} /> Logout
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-[1.75rem] border border-slate-200 bg-slate-50/80 p-2 shadow-sm">
            <div className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest ${
                  activeTab === item.key
                    ? 'bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.12)]'
                    : 'border border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white'
                }`}
              >
                {item.label}
              </button>
            ))}
            </div>
          </div>

          {orderedQuickItems.length ? (
            <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-white/85 p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Specialized Workspaces</p>
                  <p className="mt-1 text-sm text-slate-500">Ordered by your current client profile so the highest-emphasis workspaces stay at the front.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {orderedQuickItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveTab(item.key)}
                      className={`rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${
                        activeTab === item.key
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8">
        {activeTab === 'home' ? (
          <>
            <PrimaryCard title="Executive Summary" subtitle={(roadmap.data?.stage || 'starting').replace(/_/g, ' ')}>
              {roadmap.loading ? (
                <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="animate-spin" size={14} /> Loading funding stage...
                </div>
              ) : roadmap.error ? (
                <p className="text-sm font-medium text-red-600">{roadmap.error}</p>
              ) : (
                <>
                  <p className="text-sm text-slate-600">
                    {roadmap.data?.recommendation.reasoning_summary || 'Your next action is determined by readiness and recent results.'}
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <ExecutiveStat label="Readiness" value={roadmap.data?.readiness.ready ? 'Ready To Advance' : 'Needs Attention'} tone={roadmap.data?.readiness.ready ? 'success' : 'default'} />
                    <ExecutiveStat label="Top Task" value={tasks.data?.top_task?.title || 'No active task'} tone="info" />
                    <ExecutiveStat label="Recent Decisions" value={`${history?.results?.slice(0, 3).length || 0} logged`} />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('actionCenter')}
                      className={buttonPrimaryClass}
                    >
                      {tasks.data?.top_task?.title ? `Do Next: ${tasks.data.top_task.title}` : 'Open Action Center'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('fundingRoadmap')}
                      className={buttonSecondaryClass}
                    >
                      Open Funding Roadmap
                    </button>
                    {isFunded ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab('capitalProtection')}
                        className={buttonSecondaryClass}
                      >
                        Capital Protection
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-6 grid gap-4 xl:grid-cols-[1.3fr_1fr]">
                    <div className="rounded-[1.7rem] border border-[#E4ECF8] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-5 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Current funding posture</p>
                      <div className="mt-4 space-y-3">
                        {(roadmap.data?.readiness.blockers || []).slice(0, 3).map((blocker: string) => (
                          <div key={blocker} className="rounded-[1.1rem] border border-[#F5E3BE] bg-[#FFF4E2] px-4 py-3 text-sm font-medium text-[#8F641B]">
                            {blocker}
                          </div>
                        ))}
                        {!(roadmap.data?.readiness.blockers || []).length ? (
                          <div className="rounded-[1.1rem] border border-[#CBEFD9] bg-[#E8FAEF] px-4 py-3 text-sm font-medium text-[#178D5B]">
                            No blockers are currently stopping the funding sequence.
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-[1.7rem] border border-[#E4ECF8] bg-white p-5 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Recent application activity</p>
                      <div className="mt-4 space-y-3">
                        {(history?.applications || []).slice(0, 3).map((row: any) => (
                          <div key={row.id} className="rounded-[1.1rem] border border-[#EEF2FA] bg-[#FBFDFF] px-4 py-3">
                            <p className="text-sm font-black text-[#17233D]">{row.provider_name || 'Provider pending'} · {row.product_name || 'Product'}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#9AA9C3]">{row.decision_status || 'submitted'}</p>
                          </div>
                        ))}
                        {!(history?.applications || []).length ? <p className="text-sm text-[#61769D]">No application activity logged yet.</p> : null}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </PrimaryCard>

            <section className={`${shellClass} p-5`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Experience Mode</p>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">{experience.experienceConfig.emphasis.primaryGoal}</h3>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">{experience.experienceConfig.messaging.summary}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Messaging Tone</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{experience.experienceConfig.messaging.toneLabel}</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Task Priority Model</p>
                <p className="mt-2 text-sm text-slate-600">{experience.experienceConfig.taskPriority.explanation}</p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {experience.experienceConfig.recommendations.map((recommendation) => (
                  <button
                    key={recommendation.id}
                    type="button"
                    onClick={() => openExperienceTarget(recommendation.target)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left shadow-sm"
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Recommended Focus</p>
                    <p className="mt-2 text-sm font-black text-slate-900">{recommendation.title}</p>
                    <p className="mt-2 text-sm text-slate-600">{recommendation.body}</p>
                  </button>
                ))}
              </div>
            </section>

            <TaskLinkedMessageCard
              messages={internalThreads.actionableMessages}
              loading={lifecycleReminders.loading}
              error={lifecycleReminders.error}
              onOpenTarget={(message) => {
                openReminderTarget(message.destination);
                if (message.reminderId) lifecycleReminders.updateReminder(message.reminderId, 'mark_sent');
              }}
              onOpenThread={() => setActiveTab('messages')}
              onDismiss={(message) => {
                if (message.reminderId) lifecycleReminders.updateReminder(message.reminderId, 'dismiss');
              }}
            />

            <AssistantPanel
              title="Funding Guide"
              loading={fundingAI.loading}
              error={fundingAI.error}
              answer={fundingAI.data?.answer || ''}
              onAsk={async () => {
                await fundingAI.ask({
                  coaching_goal: 'What should I focus on next?',
                });
              }}
            />
          </>
        ) : null}

        {activeTab === 'actionCenter' ? (
          <>
            <PrimaryCard title="Action Center" subtitle="Task Brain">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Action Center Mode</p>
                <p className="mt-2 text-sm font-black text-slate-900">{experience.experienceConfig.emphasis.statusLabel}</p>
                <p className="mt-1 text-sm text-slate-600">{experience.experienceConfig.taskPriority.explanation}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void tasks.refresh()}
                  className={buttonSecondaryClass + ' inline-flex items-center gap-1 py-2'}
                >
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>

              {tasks.loading ? (
                <div className="mt-4 inline-flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="animate-spin" size={14} /> Loading tasks...
                </div>
              ) : tasks.error ? (
                <p className="mt-4 text-sm font-medium text-red-600">{tasks.error}</p>
              ) : (
                <div className="mt-4 space-y-4">
                  <TaskLinkedMessageCard
                    messages={internalThreads.actionableMessages}
                    loading={lifecycleReminders.loading}
                    error={lifecycleReminders.error}
                    onOpenTarget={(message) => {
                      openReminderTarget(message.destination);
                      if (message.reminderId) lifecycleReminders.updateReminder(message.reminderId, 'mark_sent');
                    }}
                    onOpenThread={() => setActiveTab('messages')}
                    onDismiss={(message) => {
                      if (message.reminderId) lifecycleReminders.updateReminder(message.reminderId, 'dismiss');
                    }}
                  />

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-[1.75rem] border border-red-100 bg-red-50/85 p-4 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-widest text-red-600">Urgent</p>
                      <div className="mt-3 space-y-2">
                        {experience.sortedUrgent.slice(0, 6).map((task: any) => (
                          <button
                            key={task.task_id || task.id}
                            type="button"
                            onClick={() => {
                              const category = String(task.task_category || task.meta?.category || '');
                              if (category.includes('credit')) setActiveTab('creditCenter');
                              else if (category.includes('business')) setActiveTab('businessFoundation');
                              else if (category.includes('capital')) setActiveTab('capitalProtection');
                              else setActiveTab('fundingRoadmap');
                            }}
                            className="w-full rounded-xl border border-red-200 bg-white p-3 text-left"
                          >
                            <p className="text-xs font-black text-slate-900">{task.title}</p>
                            <p className="mt-1 text-xs text-slate-600">{task.description}</p>
                          </button>
                        ))}
                        {!experience.sortedUrgent.length ? <p className="text-xs text-red-700">No urgent tasks.</p> : null}
                      </div>
                    </div>

                    <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50/85 p-4 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Recommended</p>
                      <div className="mt-3 space-y-2">
                        {experience.sortedRecommended.slice(0, 6).map((task: any) => (
                          <div key={task.task_id || task.id} className="rounded-xl border border-amber-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-black text-slate-900">{task.title}</p>
                              <TaskPill status={String(task.priority || 'recommended')} />
                            </div>
                            <p className="mt-1 text-xs text-slate-600">{task.description}</p>
                          </div>
                        ))}
                        {!experience.sortedRecommended.length ? <p className="text-xs text-amber-700">No recommended tasks.</p> : null}
                      </div>
                    </div>

                    <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50/85 p-4 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Completed</p>
                      <div className="mt-3 space-y-2">
                        {experience.sortedCompleted.slice(0, 6).map((task: any) => (
                          <div key={task.task_id || task.id} className="rounded-xl border border-emerald-200 bg-white p-3">
                            <p className="text-xs font-black text-slate-900">{task.title}</p>
                          </div>
                        ))}
                        {!experience.sortedCompleted.length ? <p className="text-xs text-emerald-700">Nothing completed yet.</p> : null}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </PrimaryCard>

            <AssistantPanel
              title="Funding Guide"
              loading={fundingAI.loading}
              error={fundingAI.error}
              answer={fundingAI.data?.answer || ''}
              onAsk={async () => {
                await fundingAI.ask({
                  coaching_goal: 'Help me understand these tasks.',
                });
              }}
            />
          </>
        ) : null}

        {activeTab === 'fundingRoadmap' ? (
          <>
            <PrimaryCard title="Funding Roadmap" subtitle={(roadmap.data?.stage || 'funding_roadmap').replace(/_/g, ' ')}>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void roadmap.refresh()}
                  className={buttonSecondaryClass + ' inline-flex items-center gap-1 py-2'}
                >
                  <RefreshCw size={12} /> Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setShowApplyModal(true)}
                  className={buttonPrimaryClass + ' py-2'}
                >
                  Log Application Result
                </button>
              </div>

              {roadmap.loading ? (
                <div className="mt-4 inline-flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="animate-spin" size={14} /> Loading roadmap...
                </div>
              ) : roadmap.error ? (
                <p className="mt-4 text-sm font-medium text-red-600">{roadmap.error}</p>
              ) : (
                <>
                  <div className={`mt-4 ${softPanelClass} p-5`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Next Recommendation</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{roadmap.data?.recommendation.top_recommendation?.title || 'No recommendation yet'}</p>
                    <p className="mt-1 text-sm text-slate-600">{roadmap.data?.recommendation.top_recommendation?.action || 'Log activity to continue sequencing.'}</p>
                  </div>

                  {(roadmap.data?.readiness.blockers || []).length ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Blockers</p>
                      <ul className="mt-2 space-y-1 text-sm text-amber-800">
                        {(roadmap.data?.readiness.blockers || []).map((blocker: string) => (
                          <li key={blocker} className="flex items-start gap-2">
                            <AlertTriangle size={14} className="mt-0.5" />
                            <span>{blocker}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-[1.8rem] border border-[#E4ECF8] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#91A1BC]">Recent Applications</p>
                          <p className="mt-1 text-sm text-[#61769D]">Latest outbound activity and application status.</p>
                        </div>
                        <span className="rounded-full border border-[#D5E4FF] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#4677E6]">{(history?.applications || []).length} Logged</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {(history?.applications || []).length ? (
                          <div className="hidden grid-cols-[1.15fr,0.85fr,0.7fr] gap-3 rounded-[1rem] border border-[#EEF2FA] bg-white px-4 py-2 lg:grid">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Provider</p>
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Bureau</p>
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC] text-right">Status</p>
                          </div>
                        ) : null}
                        {(history?.applications || []).slice(0, 5).map((row: any) => (
                          <div key={row.id} className="grid gap-3 rounded-[1.15rem] border border-[#EEF2FA] bg-white p-4 lg:grid-cols-[1.15fr,0.85fr,0.7fr] lg:items-center">
                            <div>
                              <p className="text-sm font-black text-[#17233D]">{row.provider_name || 'Unknown provider'}</p>
                              <p className="mt-1 text-xs text-[#61769D]">{row.product_name || 'Product'}</p>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-[#17233D]">{row.bureau_used || 'Not logged'}</p>
                              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#91A1BC]">Credit bureau used</p>
                            </div>
                            <div className="flex items-center justify-between gap-3 lg:justify-end">
                              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#91A1BC]">{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : 'Pending date'}</p>
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${String(row.decision_status || '').includes('approved') ? 'border-[#CBEFD9] bg-[#E8FAEF] text-[#178D5B]' : 'border-[#D5E4FF] bg-[#EEF4FF] text-[#4677E6]'}`}>{row.decision_status || 'submitted'}</span>
                            </div>
                          </div>
                        ))}
                        {!(history?.applications || []).length ? <p className="text-sm text-[#61769D]">No applications logged yet.</p> : null}
                      </div>
                    </div>
                    <div className="rounded-[1.8rem] border border-[#E4ECF8] bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#91A1BC]">Recent Results</p>
                          <p className="mt-1 text-sm text-[#61769D]">Funding outcomes and notes from recent decisions.</p>
                        </div>
                        <span className="rounded-full border border-[#E6DFF4] bg-[#F3F0FF] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#7A52DB]">{(history?.results || []).length} Outcomes</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {(history?.results || []).length ? (
                          <div className="hidden grid-cols-[0.9fr,1.4fr] gap-3 rounded-[1rem] border border-[#EEF2FA] bg-[#FBFDFF] px-4 py-2 lg:grid">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Outcome</p>
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Decision notes</p>
                          </div>
                        ) : null}
                        {(history?.results || []).slice(0, 5).map((row: any) => (
                          <div key={row.id} className="grid gap-3 rounded-[1.15rem] border border-[#EEF2FA] bg-[#FBFDFF] p-4 lg:grid-cols-[0.9fr,1.4fr] lg:items-center">
                            <div>
                              <p className="text-sm font-black text-[#17233D]">{row.result_status || 'submitted'}</p>
                              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#91A1BC]">{row.outcome_at ? new Date(row.outcome_at).toLocaleDateString() : 'Outcome pending'}</p>
                            </div>
                            <p className="text-sm text-[#61769D]">{row.result_notes || 'No notes provided.'}</p>
                          </div>
                        ))}
                        {historyLoading ? <p className="text-sm text-[#61769D]">Loading history...</p> : null}
                        {historyError ? <p className="text-sm text-red-600">{historyError}</p> : null}
                        {!historyLoading && !(history?.results || []).length ? <p className="text-sm text-[#61769D]">No results logged yet.</p> : null}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </PrimaryCard>

            <AssistantPanel
              title="Funding Guide"
              loading={fundingAI.loading}
              error={fundingAI.error}
              answer={fundingAI.data?.answer || ''}
              onAsk={async () => {
                await fundingAI.ask({
                  coaching_goal: 'Explain my next funding move.',
                });
              }}
            />
          </>
        ) : null}

        {activeTab === 'creditCenter' ? (
          <>
            <PrimaryCard title="Credit Center" subtitle="Credit Optimization Before Applications">
              {credit.loading ? (
                <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="animate-spin" size={14} /> Loading credit data...
                </div>
              ) : credit.error ? (
                <p className="text-sm font-medium text-red-600">{credit.error}</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Report</p>
                      <p className="mt-1 text-sm font-black text-slate-900">
                        {credit.data.analysis?.latest_report ? 'Uploaded' : 'Not uploaded yet'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Analysis</p>
                      <p className="mt-1 text-sm font-black text-slate-900">
                        {credit.data.analysis?.latest_analysis ? 'Available' : 'Pending'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Recommendations</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{credit.data.recommendations?.recommendations?.length || 0}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href="/credit-report-upload"
                      className={buttonPrimaryClass + ' py-2'}
                    >
                      Upload Credit Report
                    </a>
                    <button
                      type="button"
                      onClick={() => void credit.refresh()}
                      className={buttonSecondaryClass + ' py-2'}
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dispute Recommendations</p>
                      <div className="mt-2 space-y-2">
                        {(credit.data.recommendations?.recommendations || []).slice(0, 10).map((rec: any) => (
                          <div key={rec.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-black text-slate-900">{rec.title || rec.item_key || 'Recommendation'}</p>
                            <p className="mt-1 text-xs text-slate-600">{rec.recommended_action || rec.reasoning || 'Review this item.'}</p>
                            <button
                              type="button"
                              onClick={() =>
                                void credit.createLetter({
                                  recommendation_id: rec.id,
                                  title: rec.title || 'Dispute Letter Draft',
                                  summary: rec.recommended_action || rec.reasoning || 'Dispute item review requested.',
                                })
                              }
                              className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700"
                            >
                              Generate Draft Letter
                            </button>
                          </div>
                        ))}
                        {!(credit.data.recommendations?.recommendations || []).length ? (
                          <p className="text-xs text-slate-500">No recommendations yet.</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Generated Letters</p>
                      <div className="mt-2 space-y-2">
                        {(credit.data.letters?.letters || []).slice(0, 10).map((letter: any) => (
                          <div key={letter.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-black text-slate-900">{letter.title || 'Dispute Letter'}</p>
                            <p className="mt-1 text-xs text-slate-600">Status: {letter.status || 'pending_review'}</p>
                          </div>
                        ))}
                        {!(credit.data.letters?.letters || []).length ? (
                          <p className="text-xs text-slate-500">No letters generated yet.</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </PrimaryCard>

            <AssistantPanel
              title="Credit Advisor"
              loading={creditAI.loading}
              error={creditAI.error}
              answer={creditAI.data?.answer || ''}
              onAsk={async () => {
                await creditAI.ask({
                  coaching_goal: 'Explain my credit recommendations.',
                });
              }}
            />
          </>
        ) : null}

        {activeTab === 'businessFoundation' ? (
          <>
            <PrimaryCard title="Business Foundation" subtitle="New Business or Existing Optimization Path">
              {business.loading ? (
                <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="animate-spin" size={14} /> Loading business foundation...
                </div>
              ) : business.error ? (
                <p className="text-sm font-medium text-red-600">{business.error}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void business.setPath('new_business')}
                      className={buttonSecondaryClass + ' py-2'}
                    >
                      New Business Path
                    </button>
                    <button
                      type="button"
                      onClick={() => void business.setPath('existing_business_optimization')}
                      className={buttonSecondaryClass + ' py-2'}
                    >
                      Existing Business Optimization
                    </button>
                    <button
                      type="button"
                      onClick={() => void business.refresh()}
                      className={buttonTertiaryClass + ' py-2'}
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Path</p>
                    <p className="mt-1 text-sm font-black text-slate-900">
                      {business.data?.readiness.path ? business.data.readiness.path.replace(/_/g, ' ') : 'Path not selected'}
                    </p>
                    {(business.data?.readiness.blockers || []).length ? (
                      <ul className="mt-2 space-y-1 text-xs text-amber-700">
                        {(business.data?.readiness.blockers || []).map((blocker: string) => (
                          <li key={blocker} className="flex items-start gap-1">
                            <AlertTriangle size={12} className="mt-0.5" />
                            <span>{blocker}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-emerald-700">Business foundation blockers are clear.</p>
                    )}
                  </div>

                  {currentPathSteps.length ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Checklist</p>
                      <div className="mt-3 space-y-2">
                        {currentPathSteps.map((step) => {
                          const row = progressMap.get(step);
                          const completed = row?.step_status === 'completed';
                          return (
                            <div key={step} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div>
                                <p className="text-xs font-black text-slate-900">{toLabel(step)}</p>
                                <p className="text-xs text-slate-600">{completed ? 'Completed' : 'Pending'}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  void business.setProgress({
                                    step_key: step,
                                    step_status: completed ? 'in_progress' : 'completed',
                                  })
                                }
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700"
                              >
                                {completed ? 'Mark In Progress' : 'Mark Complete'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      Select a business path to start readiness tracking.
                    </div>
                  )}
                </>
              )}
            </PrimaryCard>

            <AssistantPanel
              title="Business Setup Advisor"
              loading={businessAI.loading}
              error={businessAI.error}
              answer={businessAI.data?.answer || ''}
              onAsk={async () => {
                await businessAI.ask({
                  coaching_goal: 'Help me finish setup correctly.',
                });
              }}
            />
          </>
        ) : null}

        {activeTab === 'capitalProtection' ? (
          <CapitalProtectionPanel contact={contact} onOpenAllocation={() => setActiveTab('capitalAllocation')} />
        ) : null}

        {activeTab === 'capitalAllocation' ? (
          <CapitalAllocationPanel
            contact={contact}
            onOpenProtection={() => setActiveTab('capitalProtection')}
            onOpenSimulator={() => setActiveTab('capitalAllocation')}
            onOpenTrading={() => setActiveTab('tradingAccess')}
            onOpenGrants={() => {
              window.location.hash = 'GRANTS';
            }}
          />
        ) : null}

        {activeTab === 'tradingAccess' ? (
          <>
            <PrimaryCard title="Trading Access" subtitle="Optional Advanced Path (Gated)">
              {trading.loading ? (
                <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="animate-spin" size={14} /> Loading trading access...
                </div>
              ) : trading.error ? (
                <p className="text-sm font-medium text-red-600">{trading.error}</p>
              ) : (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Eligibility</p>
                    <p className="mt-1 text-sm font-black text-slate-900">
                      {trading.snapshot?.eligible ? 'Eligible' : 'Locked'}
                    </p>
                    {(trading.snapshot?.blockers || []).length ? (
                      <ul className="mt-2 space-y-1 text-xs text-amber-700">
                        {(trading.snapshot?.blockers || []).map((blocker) => (
                          <li key={blocker} className="flex items-start gap-1">
                            <Lock size={12} className="mt-0.5" />
                            <span>{blocker}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <button
                      type="button"
                      disabled={!trading.snapshot?.eligible || !!trading.snapshot?.opted_in}
                      onClick={() => void trading.optIn()}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 disabled:opacity-50"
                    >
                      {trading.snapshot?.opted_in ? 'Opted In' : '1) Opt In'}
                    </button>
                    <button
                      type="button"
                      disabled={!trading.snapshot?.opted_in || !!trading.snapshot?.video_complete}
                      onClick={() => void trading.completeVideo()}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 disabled:opacity-50"
                    >
                      {trading.snapshot?.video_complete ? 'Video Complete' : '2) Mark Video Complete'}
                    </button>
                    <button
                      type="button"
                      disabled={!trading.snapshot?.video_complete || !!trading.snapshot?.disclaimer_complete}
                      onClick={() => void trading.acceptDisclaimer()}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 disabled:opacity-50"
                    >
                      {trading.snapshot?.disclaimer_complete ? 'Disclaimer Accepted' : '3) Accept Disclaimer'}
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                    Paper-trading-first posture: practice in simulation before any advanced live strategy.
                  </div>

                  {trading.snapshot?.access_ready ? (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-sm font-bold text-emerald-700">Access ready. Advanced education content is unlocked.</p>
                    </div>
                  ) : null}
                </>
              )}
            </PrimaryCard>

            <InvestmentLab contact={contact} onUpdateContact={onUpdateContact} />
          </>
        ) : null}

        {activeTab === 'messages' ? (
          <div className={`${shellClass} h-[72vh] overflow-hidden p-2`}>
            <MessageCenter contact={contact} onUpdateContact={onUpdateContact} currentUserRole="client" onNavigateToAction={(target) => openReminderTarget(target as PortalTab)} experienceConfig={experience.experienceConfig} />
          </div>
        ) : null}

        {activeTab === 'activity' ? (
          <DealTimelinePage
            currentStageLabel={activityFeed.currentStageLabel}
            nextStepLabel={activityFeed.nextStepLabel}
            events={activityFeed.events}
            categories={activityFeed.availableCategories}
            actors={activityFeed.availableActors}
            loading={activityFeed.loading}
            error={activityFeed.error}
            onOpenDestination={(target) => openReminderTarget(target)}
          />
        ) : null}

        {activeTab === 'documents' ? (
          <ClientDocumentWorkspace contact={contact} onUpdateContact={onUpdateContact} currentStage={roadmap.data?.stage} experienceConfig={experience.experienceConfig} />
        ) : null}

        {activeTab === 'account' ? (
          <div className="space-y-4">
            <div className={`${shellClass} p-4`}>
              <BusinessProfile contact={contact} onUpdateContact={onUpdateContact} />
            </div>
            <div className={`${shellClass} p-4`}>
              <SubscriptionManager contact={contact} onUpdateContact={onUpdateContact} branding={branding} />
            </div>
          </div>
        ) : null}
      </main>

      {showApplyModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className={`w-full max-w-xl ${shellClass} p-6`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Apply / Log Result</p>
                <h3 className="mt-1 text-xl font-black tracking-tight text-slate-900">Log Funding Application Outcome</h3>
                <p className="mt-2 text-sm text-slate-500">Capture the lender decision clearly so roadmap sequencing and action priorities stay accurate.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowApplyModal(false)}
                className={buttonSecondaryClass + ' px-3 py-1 text-xs'}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">
                Provider
                <input
                  value={applyForm.provider_name}
                  onChange={(e) => setApplyForm((prev) => ({ ...prev, provider_name: e.target.value }))}
                  className={fintechInput}
                  placeholder="Provider name"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Product
                <input
                  value={applyForm.product_name}
                  onChange={(e) => setApplyForm((prev) => ({ ...prev, product_name: e.target.value }))}
                  className={fintechInput}
                  placeholder="Product name"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Bureau
                <input
                  value={applyForm.bureau_used}
                  onChange={(e) => setApplyForm((prev) => ({ ...prev, bureau_used: e.target.value }))}
                  className={fintechInput}
                  placeholder="Experian / Equifax / TransUnion"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Decision Status
                <select
                  value={applyForm.decision_status}
                  onChange={(e) => setApplyForm((prev) => ({ ...prev, decision_status: e.target.value as FundingDecisionStatus }))}
                  className={fintechInput}
                >
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="denied">Denied</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>

              <label className="text-xs font-bold text-slate-700 md:col-span-2">
                Approved Amount (optional)
                <input
                  value={applyForm.approved_amount}
                  onChange={(e) => setApplyForm((prev) => ({ ...prev, approved_amount: e.target.value }))}
                  className={fintechInput}
                  placeholder="15000"
                />
              </label>

              <label className="text-xs font-bold text-slate-700 md:col-span-2">
                Notes
                <textarea
                  value={applyForm.notes}
                  onChange={(e) => setApplyForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className={fintechTextarea}
                  placeholder="Notes about outcome or follow-up"
                />
              </label>
            </div>

            <label className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={applyForm.inquiry_detected}
                onChange={(e) => setApplyForm((prev) => ({ ...prev, inquiry_detected: e.target.checked }))}
              />
              Inquiry detected
            </label>

            {applyError ? <p className="mt-3 text-sm text-red-600">{applyError}</p> : null}

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void submitApplyLog()}
                disabled={applySaving}
                className={buttonPrimaryClass + ' py-2 disabled:opacity-60'}
              >
                {applySaving ? 'Saving...' : 'Submit Log'}
              </button>
              <button
                type="button"
                onClick={() => setShowApplyModal(false)}
                className={buttonSecondaryClass + ' py-2'}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="mx-auto mt-6 max-w-7xl px-4 pb-8 text-xs text-slate-500 md:px-8">
        <div className="flex items-center gap-2">
          <Sparkles size={12} />
          {experience.experienceConfig.emphasis.primaryGoal}
        </div>
        {capital.data?.readiness?.ready ? (
          <div className="mt-2 inline-flex items-center gap-1 text-emerald-700">
            <CheckCircle2 size={12} /> Capital protection marked ready.
          </div>
        ) : isFunded ? (
          <div className="mt-2 inline-flex items-center gap-1 text-amber-700">
            <Clock3 size={12} /> Capital protection in progress.
          </div>
        ) : null}
      </footer>
    </div>
  );
}
