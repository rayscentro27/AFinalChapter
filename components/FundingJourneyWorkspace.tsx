import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Lock, LogOut, RefreshCw, Sparkles } from 'lucide-react';
import { AgencyBranding, Contact } from '../types';
import MessageCenter from './MessageCenter';
import DocumentVault from './DocumentVault';
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
import {
  FundingDecisionStatus,
  getFundingHistory,
  logFundingApplyEvent,
} from '../services/fundingFoundationService';

type PortalTab =
  | 'home'
  | 'fundingRoadmap'
  | 'actionCenter'
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
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{props.title}</p>
      {props.subtitle ? <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{props.subtitle}</h3> : null}
      <div className="mt-4">{props.children}</div>
    </section>
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
    <PrimaryCard title="Portal AI" subtitle={props.title}>
      <button
        type="button"
        onClick={() => void props.onAsk()}
        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700"
      >
        {props.loading ? 'Loading Guidance...' : 'Get Guidance'}
      </button>
      {props.error ? <p className="mt-3 text-sm font-medium text-red-600">{props.error}</p> : null}
      {props.answer ? (
        <pre className="mt-3 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{props.answer}</pre>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Assistant stays secondary to your main workflow and focuses on the next action.</p>
      )}
    </PrimaryCard>
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

  const navItems: Array<{ key: PortalTab; label: string }> = [
    { key: 'home', label: 'Home' },
    { key: 'fundingRoadmap', label: 'Funding Roadmap' },
    { key: 'actionCenter', label: 'Action Center' },
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{branding.name || 'Nexus Portal'}</p>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Funding-First Client Journey</h1>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
            >
              <LogOut size={14} /> Logout
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest ${
                  activeTab === item.key
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-slate-100 text-slate-700 hover:bg-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {quickItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8">
        {activeTab === 'home' ? (
          <>
            <PrimaryCard title="Stage" subtitle={(roadmap.data?.stage || 'starting').replace(/_/g, ' ')}>
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
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ready</p>
                      <p className="mt-1 text-xl font-black text-slate-900">
                        {roadmap.data?.readiness.ready ? 'Yes' : 'Blocked'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Top Task</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{tasks.data?.top_task?.title || 'No active task'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Recent Decisions</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{history?.results?.slice(0, 3).length || 0} logged</p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('actionCenter')}
                      className="rounded-xl bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white"
                    >
                      {tasks.data?.top_task?.title ? `Do Next: ${tasks.data.top_task.title}` : 'Open Action Center'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('fundingRoadmap')}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700"
                    >
                      Open Funding Roadmap
                    </button>
                    {isFunded ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab('capitalProtection')}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700"
                      >
                        Capital Protection
                      </button>
                    ) : null}
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
                  coaching_goal: 'What should I focus on next?',
                });
              }}
            />
          </>
        ) : null}

        {activeTab === 'actionCenter' ? (
          <>
            <PrimaryCard title="Action Center" subtitle="Task Brain">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void tasks.refresh()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700"
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
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-600">Urgent</p>
                    <div className="mt-3 space-y-2">
                      {(tasks.data?.urgent || []).slice(0, 6).map((task: any) => (
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
                      {!(tasks.data?.urgent || []).length ? <p className="text-xs text-red-700">No urgent tasks.</p> : null}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Recommended</p>
                    <div className="mt-3 space-y-2">
                      {(tasks.data?.recommended || []).slice(0, 6).map((task: any) => (
                        <div key={task.task_id || task.id} className="rounded-xl border border-amber-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-black text-slate-900">{task.title}</p>
                            <TaskPill status={String(task.priority || 'recommended')} />
                          </div>
                          <p className="mt-1 text-xs text-slate-600">{task.description}</p>
                        </div>
                      ))}
                      {!(tasks.data?.recommended || []).length ? <p className="text-xs text-amber-700">No recommended tasks.</p> : null}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Completed</p>
                    <div className="mt-3 space-y-2">
                      {(tasks.data?.completed || []).slice(0, 6).map((task: any) => (
                        <div key={task.task_id || task.id} className="rounded-xl border border-emerald-200 bg-white p-3">
                          <p className="text-xs font-black text-slate-900">{task.title}</p>
                        </div>
                      ))}
                      {!(tasks.data?.completed || []).length ? <p className="text-xs text-emerald-700">Nothing completed yet.</p> : null}
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
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700"
                >
                  <RefreshCw size={12} /> Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setShowApplyModal(true)}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white"
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
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Recent Applications</p>
                      <div className="mt-2 space-y-2">
                        {(history?.applications || []).slice(0, 5).map((row: any) => (
                          <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-black text-slate-900">{row.provider_name || 'Unknown provider'} · {row.product_name || 'Product'}</p>
                            <p className="mt-1 text-xs text-slate-600">Status: {row.decision_status || 'submitted'}</p>
                          </div>
                        ))}
                        {!(history?.applications || []).length ? <p className="text-xs text-slate-500">No applications logged yet.</p> : null}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Recent Results</p>
                      <div className="mt-2 space-y-2">
                        {(history?.results || []).slice(0, 5).map((row: any) => (
                          <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-black text-slate-900">{row.result_status || 'submitted'}</p>
                            <p className="mt-1 text-xs text-slate-600">{row.result_notes || 'No notes provided.'}</p>
                          </div>
                        ))}
                        {historyLoading ? <p className="text-xs text-slate-500">Loading history...</p> : null}
                        {historyError ? <p className="text-xs text-red-600">{historyError}</p> : null}
                        {!historyLoading && !(history?.results || []).length ? <p className="text-xs text-slate-500">No results logged yet.</p> : null}
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
                      className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white"
                    >
                      Upload Credit Report
                    </a>
                    <button
                      type="button"
                      onClick={() => void credit.refresh()}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700"
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
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700"
                    >
                      New Business Path
                    </button>
                    <button
                      type="button"
                      onClick={() => void business.setPath('existing_business_optimization')}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700"
                    >
                      Existing Business Optimization
                    </button>
                    <button
                      type="button"
                      onClick={() => void business.refresh()}
                      className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700"
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
          />
        ) : null}

        {activeTab === 'tradingAccess' ? <InvestmentLab contact={contact} /> : null}

        {activeTab === 'messages' ? (
          <div className="h-[72vh] overflow-hidden rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
            <MessageCenter contact={contact} onUpdateContact={onUpdateContact} currentUserRole="client" />
          </div>
        ) : null}

        {activeTab === 'documents' ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <DocumentVault contact={contact} onUpdateContact={onUpdateContact} readOnly={true} />
          </div>
        ) : null}

        {activeTab === 'account' ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <BusinessProfile contact={contact} onUpdateContact={onUpdateContact} />
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <SubscriptionManager contact={contact} onUpdateContact={onUpdateContact} branding={branding} />
            </div>
          </div>
        ) : null}
      </main>

      {showApplyModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Apply / Log Result</p>
                <h3 className="mt-1 text-xl font-black tracking-tight text-slate-900">Log Funding Application Outcome</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowApplyModal(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700"
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
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Provider name"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Product
                <input
                  value={applyForm.product_name}
                  onChange={(e) => setApplyForm((prev) => ({ ...prev, product_name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Product name"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Bureau
                <input
                  value={applyForm.bureau_used}
                  onChange={(e) => setApplyForm((prev) => ({ ...prev, bureau_used: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Experian / Equifax / TransUnion"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Decision Status
                <select
                  value={applyForm.decision_status}
                  onChange={(e) => setApplyForm((prev) => ({ ...prev, decision_status: e.target.value as FundingDecisionStatus }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="15000"
                />
              </label>

              <label className="text-xs font-bold text-slate-700 md:col-span-2">
                Notes
                <textarea
                  value={applyForm.notes}
                  onChange={(e) => setApplyForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
                className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-60"
              >
                {applySaving ? 'Saving...' : 'Submit Log'}
              </button>
              <button
                type="button"
                onClick={() => setShowApplyModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700"
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
          Funding-first workflow active. Optional paths remain gated until reserve-first readiness is complete.
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
