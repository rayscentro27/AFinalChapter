import React, { useMemo } from 'react';
import {
  Activity,
  AlertCircle,
  BriefcaseBusiness,
  ChevronRight,
  CircleCheck,
  Gift,
  Headphones,
  Inbox,
  ShieldCheck,
  Sparkles,
  Zap,
  Users,
  WalletCards,
} from 'lucide-react';
import { Contact, ViewMode } from '../../types';

type SuperAdminHomeV2Props = {
  contacts?: Contact[];
  onNavigate?: (view: ViewMode) => void;
};

const bureauScores = [
  { bureau: 'Experian', score: 759, label: 'Excellent', tone: 'text-[#2F6BF2]' },
  { bureau: 'Equifax', score: 745, label: 'Very Good', tone: 'text-[#8A3C7A]' },
  { bureau: 'TransUnion', score: 751, label: 'Excellent', tone: 'text-[#4B9CEB]' },
];

const aiWorkforce = [
  { name: 'Nexus Founder', role: 'CEO, Agent', status: 'Active', accent: 'bg-[#FFF5D6] text-[#C28A07]', detail: '4 tasks awaiting executive review' },
  { name: 'Nexus Analyst', role: 'Evaluation', status: 'Active', accent: 'bg-[#EAF8FF] text-[#1783B9]', detail: '12 funding packets scored today' },
  { name: 'Sentinel Scout', role: 'Acquisitions', status: 'Active', accent: 'bg-[#EAF5FF] text-[#2368F2]', detail: '3 new outreach sequences running' },
  { name: 'Forensic Bot', role: 'Up-Down Writer', status: 'Attention', accent: 'bg-[#FFF3DD] text-[#C27A24]', detail: '2 document checks failed confidence thresholds' },
  { name: 'Ghost Hunter', role: 'Grant Finder', status: 'Idle', accent: 'bg-[#F4EDFF] text-[#7A52DB]', detail: 'Waiting on grant research approvals' },
];

const cardClass = 'rounded-[2rem] border border-[#E6ECF7] bg-white shadow-[0_14px_40px_rgba(36,58,114,0.06)]';

export default function SuperAdminHomeV2(props: SuperAdminHomeV2Props) {
  const contacts = props.contacts || [];

  const overview = useMemo(() => {
    const totalClients = contacts.length || 392;
    const pendingApplications = contacts.filter((contact) => contact.status === 'Negotiation' || contact.status === 'Lead').length || 128;
    const totalSubmissions = contacts.reduce((count, contact) => count + (contact.submissions?.length || 0), 0);
    const approvedSubmissions = contacts.reduce((count, contact) => count + ((contact.submissions || []).filter((submission) => submission.status === 'Approved').length), 0);
    const approvalRate = totalSubmissions > 0 ? Math.round((approvedSubmissions / totalSubmissions) * 100) : 73;
    const successfulGrants = Math.max(54, Math.round(totalClients * 0.14));
    const supportRequests = Math.max(21, contacts.filter((contact) => contact.status === 'Triage').length || 21);

    return {
      totalClients,
      pendingApplications,
      approvalRate,
      successfulGrants,
      supportRequests,
    };
  }, [contacts]);

  const activityRows = useMemo(() => {
    if (contacts.length === 0) {
      return [
        { name: 'Jared Mitchell', detail: 'Submitted Funding Application', date: 'Apr 24, 2024', icon: BriefcaseBusiness, accent: 'from-[#EAF8F5] to-[#F8FEFC]', tint: 'text-[#37BAA7]' },
        { name: 'Sarah James', detail: 'Received a $15,000 Grant', date: 'Apr 23, 2024', icon: Gift, accent: 'from-[#F2EEFF] to-[#FCFAFF]', tint: 'text-[#8773F6]' },
        { name: 'Michael Carter', detail: 'LLC Formation Completed', date: 'Apr 22, 2024', icon: ShieldCheck, accent: 'from-[#EAF2FF] to-[#F8FBFF]', tint: 'text-[#4A83F4]' },
        { name: 'Michael Carter', detail: 'Sent Support Request', date: 'Apr 21, 2024', icon: Headphones, accent: 'from-[#ECF7FF] to-[#F8FDFF]', tint: 'text-[#56A7F9]' },
      ];
    }

    return contacts.slice(0, 4).map((contact, index) => ({
      name: contact.name,
      detail: contact.notes || `${contact.company || 'Client account'} activity updated`,
      date: contact.lastContact || `Apr ${24 - index}, 2024`,
      icon: index % 2 === 0 ? BriefcaseBusiness : WalletCards,
      accent: index % 2 === 0 ? 'from-[#EAF2FF] to-[#F8FBFF]' : 'from-[#ECF7FF] to-[#F8FDFF]',
      tint: index % 2 === 0 ? 'text-[#4A83F4]' : 'text-[#56A7F9]',
    }));
  }, [contacts]);

  const clientOverviewRows = [
    { label: 'Active Clients', value: overview.totalClients },
    { label: 'New Clients (This Week)', value: 14 },
    { label: 'Churned Clients (This Week)', value: 2 },
  ];

  const fundingRows = [
    { label: 'Applications Pending', value: overview.pendingApplications },
    { label: 'Applications Approved', value: 347 },
    { label: 'Approval Rate', value: `${overview.approvalRate}%` },
  ];

  const attentionItems = [
    { title: 'Applications waiting for approval', helper: `${overview.pendingApplications} records need operator review or status updates.`, icon: <BriefcaseBusiness className="h-4 w-4 text-[#46C5B5]" /> },
    { title: 'Unread client and support updates', helper: `${overview.supportRequests} requests are still open across support and messaging.`, icon: <Inbox className="h-4 w-4 text-[#57A5F9]" /> },
    { title: 'AI workforce needs review', helper: 'Forensic Bot and grant workflows have items needing operator attention.', icon: <AlertCircle className="h-4 w-4 text-[#E27A3F]" /> },
  ];

  const quickActions = [
    { title: 'Add Client', helper: 'Open the client ledger and create a new relationship record.', icon: <Users className="h-4 w-4" />, view: ViewMode.CRM },
    { title: 'Review Applications', helper: 'Jump into the funding workflow and clear pending applications.', icon: <BriefcaseBusiness className="h-4 w-4" />, view: ViewMode.FUNDING_FLOW },
    { title: 'Open Messaging', helper: 'Resolve unread questions and document clarifications quickly.', icon: <Inbox className="h-4 w-4" />, view: ViewMode.INBOX },
    { title: 'Run Readiness Check', helper: 'Use analytics and AI workforce signals to spot blockers fast.', icon: <Zap className="h-4 w-4" />, view: ViewMode.SETTINGS },
  ];

  const workforceCounts = {
    active: aiWorkforce.filter((agent) => agent.status === 'Active').length,
    attention: aiWorkforce.filter((agent) => agent.status === 'Attention').length,
    idle: aiWorkforce.filter((agent) => agent.status === 'Idle').length,
  };

  const commandSummary = [
    { label: 'Unread queues', value: overview.supportRequests },
    { label: 'Pending approvals', value: overview.pendingApplications },
    { label: 'Active agents', value: workforceCounts.active },
  ];

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 pb-10 subpixel-antialiased">
      <section className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="space-y-3 rounded-[2rem] border border-[#E6ECF7] bg-white p-6 shadow-[0_14px_40px_rgba(36,58,114,0.06)]">
          <p className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-[#607CC1]">Admin command view</p>
          <h1 className="text-[2rem] font-black tracking-tight text-[#1B2C61] sm:text-[2.35rem]">Command Overview</h1>
          <p className="max-w-[52rem] text-base text-[#5E7096]">Monitor client growth, clear application bottlenecks, and keep the AI workforce aligned from one operating surface.</p>
          <div className="flex flex-wrap gap-3 pt-2">
            {commandSummary.map((item) => (
              <div key={item.label} className="rounded-full border border-[#DCE6F7] bg-[#F8FBFF] px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#5E7096]">
                {item.label} {item.value}
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => props.onNavigate?.(ViewMode.ADMIN_SUPER_ADMIN_COMMAND_CENTER)}
          className="rounded-[2rem] border border-[#E6ECF7] bg-white p-6 text-left shadow-[0_14px_40px_rgba(36,58,114,0.06)] transition-all hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">AI workforce</p>
              <h2 className="mt-2 text-[1.45rem] font-black tracking-tight text-[#1C2E63]">System active</h2>
              <p className="mt-2 text-sm text-[#5E7096]">AI monitoring conversations, approvals, and agent exceptions.</p>
            </div>
            <span className="rounded-full border border-[#D6E7FF] bg-[#EEF4FF] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#4578E6]">
              Open full page
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {[
              { name: 'Founder', status: 'Active', tone: 'bg-emerald-500' },
              { name: 'Analyst', status: overview.pendingApplications > 0 ? 'Reviewing' : 'Ready', tone: overview.pendingApplications > 0 ? 'bg-amber-400' : 'bg-emerald-500' },
              { name: 'Sentinel', status: workforceCounts.attention > 0 ? 'Monitoring' : 'Active', tone: workforceCounts.attention > 0 ? 'bg-amber-400' : 'bg-emerald-500' },
            ].map((agent) => (
              <div key={agent.name} className="flex items-center justify-between rounded-[1.15rem] border border-[#EEF2FA] bg-[#FBFDFF] px-4 py-3">
                <span className="text-sm font-black uppercase tracking-[0.08em] text-[#24386B]">{agent.name}</span>
                <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#5E7096]">
                  <span className={`h-2.5 w-2.5 rounded-full ${agent.tone}`} />
                  {agent.status}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[1.3rem] border border-[#FFF0DA] bg-[#FFF9EF] px-4 py-3">
            <p className="text-sm font-black tracking-tight text-[#1C2E63]">Primary focus</p>
            <p className="mt-1 text-sm text-[#5E7096]">Clear pending approvals first, then review AI workforce exceptions before moving into outbound growth work.</p>
          </div>
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={<Users className="h-9 w-9 text-[#4A87F7]" />} value={overview.totalClients} label="Total Clients" />
        <MetricCard icon={<BriefcaseBusiness className="h-9 w-9 text-[#46C5B5]" />} value={overview.pendingApplications} label="Pending Applications" />
        <MetricCard icon={<Activity className="h-9 w-9 text-[#59D0C2]" />} value={`${overview.approvalRate}%`} label="Approval Rate" />
        <MetricCard icon={<Gift className="h-9 w-9 text-[#9183FF]" />} value={overview.successfulGrants} label="Successful Grants" />
        <MetricCard icon={<Headphones className="h-9 w-9 text-[#57A5F9]" />} value={overview.supportRequests} label="Support Requests" />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ActionCard title="Manage Clients" helper="View and manage client accounts" icon={<Users className="h-10 w-10 text-[#4B86F6]" />} onClick={() => props.onNavigate?.(ViewMode.CRM)} />
        <ActionCard title="Funding Engine" helper="Process and approve funding applications" icon={<BriefcaseBusiness className="h-10 w-10 text-[#47C4B3]" />} onClick={() => props.onNavigate?.(ViewMode.FUNDING_FLOW)} />
        <ActionCard title="Credit Optimization" helper="Improve and track grant credit scores" icon={<ShieldCheck className="h-10 w-10 text-[#3C8CF5]" />} onClick={() => props.onNavigate?.(ViewMode.ADMIN_REVIEW_ANALYTICS)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className={`${cardClass} p-6`}>
          <div className="mb-5 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-[#E27A3F]" />
            <h2 className="text-[1.5rem] font-black tracking-tight text-[#1C2E63]">Needs Attention Now</h2>
          </div>
          <div className="space-y-3">
            {attentionItems.map((item) => (
              <div key={item.title} className="flex items-start gap-4 rounded-[1.35rem] border border-[#EEF2FA] bg-[#FBFDFF] px-4 py-4">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-[1rem] bg-white shadow-sm">{item.icon}</div>
                <div>
                  <p className="text-[1rem] font-black tracking-tight text-[#24386B]">{item.title}</p>
                  <p className="mt-1 text-sm text-[#5E7096]">{item.helper}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${cardClass} p-6`}>
          <div className="mb-5 flex items-center gap-3">
            <CircleCheck className="h-5 w-5 text-[#4E86F5]" />
            <h2 className="text-[1.5rem] font-black tracking-tight text-[#1C2E63]">Operator Quick Actions</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {quickActions.map((action) => (
              <button
                key={action.title}
                type="button"
                onClick={() => props.onNavigate?.(action.view)}
                className="rounded-[1.35rem] border border-[#EEF2FA] bg-[#FBFDFF] px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#D6E2F8]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-white text-[#4E86F5] shadow-sm">{action.icon}</div>
                <p className="mt-4 text-[1rem] font-black tracking-tight text-[#24386B]">{action.title}</p>
                <p className="mt-1 text-sm text-[#5E7096]">{action.helper}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <div className={`${cardClass} p-6`}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[1.55rem] font-black tracking-tight text-[#1C2E63]">Latest Client Activity</h2>
              <button type="button" className="rounded-full bg-[#EEF4FF] px-4 py-2 text-sm font-bold text-[#4578E6]">View All</button>
            </div>
            <div className="space-y-4">
              {activityRows.map((row, index) => (
                <div key={`${row.name}-${index}`} className="flex items-center gap-4 rounded-[1.4rem] border border-[#EEF2FA] px-4 py-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,#EAF2FF,#F7FBFF)] text-sm font-black text-[#3B65D8]">
                    {row.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-black tracking-tight text-[#24386B]">{row.name}</p>
                    <p className="truncate text-sm font-medium text-[#5E7096]">{row.detail}</p>
                  </div>
                  <div className="hidden items-center gap-3 lg:flex">
                    <p className="text-sm font-medium text-[#697DA6]">{row.date}</p>
                    <div className={`flex h-11 w-11 items-center justify-center rounded-[1rem] bg-[linear-gradient(135deg,var(--tw-gradient-stops))] ${row.accent}`}>
                      <row.icon className={`h-5 w-5 ${row.tint}`} />
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#A6B4D1]" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${cardClass} grid gap-0 overflow-hidden xl:grid-cols-2`}>
            <SummaryPanel title="Clients Overview" rows={clientOverviewRows} accent="text-[#4378E9]" />
            <SummaryPanel title="Funding Insights" rows={fundingRows} accent="text-[#42BFAE]" />
          </div>
        </div>

        <div className="space-y-6">
          <div className={`${cardClass} p-6`}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[1.5rem] font-black tracking-tight text-[#1C2E63]">Credit Score Snapshot</h2>
              <button type="button" className="rounded-full bg-[#EEF4FF] px-4 py-2 text-sm font-bold text-[#4578E6]">View All</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {bureauScores.map((bureau) => (
                <div key={bureau.bureau} className="rounded-[1.35rem] border border-[#EEF2FA] bg-[#FBFDFF] p-4">
                  <p className={`text-sm font-black ${bureau.tone}`}>{bureau.bureau}</p>
                  <div className="mt-4 flex items-end gap-2">
                    <span className="text-5xl font-black tracking-tight text-[#213266]">{bureau.score}</span>
                    <span className="pb-1 text-sm font-semibold text-[#61759B]">{bureau.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${cardClass} p-6`}>
            <div className="mb-5 flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-[#4E86F5]" />
              <h2 className="text-[1.5rem] font-black tracking-tight text-[#1C2E63]">AI Workforce</h2>
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.15rem] border border-[#EEF2FA] bg-[#FBFDFF] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Active agents</p>
                <p className="mt-2 text-xl font-black tracking-tight text-[#17233D]">{workforceCounts.active}</p>
              </div>
              <div className="rounded-[1.15rem] border border-[#EEF2FA] bg-[#FBFDFF] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Needs review</p>
                <p className="mt-2 text-xl font-black tracking-tight text-[#C27A24]">{workforceCounts.attention}</p>
              </div>
              <div className="rounded-[1.15rem] border border-[#EEF2FA] bg-[#FBFDFF] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Idle</p>
                <p className="mt-2 text-xl font-black tracking-tight text-[#6A7B9F]">{workforceCounts.idle}</p>
              </div>
            </div>
            <div className="space-y-3">
              {aiWorkforce.map((agent) => (
                <div key={agent.name} className="flex items-center justify-between rounded-[1.3rem] border border-[#EDF2FB] px-4 py-3">
                  <div>
                    <p className="text-lg font-black tracking-tight text-[#213266]">{agent.name}</p>
                    <p className="text-sm text-[#6479A0]">{agent.role}</p>
                    <p className="mt-1 text-xs text-[#7B8DAC]">{agent.detail}</p>
                  </div>
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${agent.accent}`}>
                    <span className="h-2 w-2 rounded-full bg-current opacity-80" />
                    {agent.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard(props: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <article className="rounded-[1.9rem] border border-[#E8EEF9] bg-white px-5 py-6 shadow-[0_14px_40px_rgba(36,58,114,0.06)]">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-[1.3rem] bg-[linear-gradient(135deg,#EEF4FF,#FFFFFF)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">{props.icon}</div>
        <div>
          <p className="text-[2.3rem] font-black leading-none tracking-tight text-[#213266]">{props.value}</p>
          <p className="mt-2 text-sm font-semibold text-[#5D7298]">{props.label}</p>
        </div>
      </div>
    </article>
  );
}

function ActionCard(props: { title: string; helper: string; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={props.onClick} className="rounded-[1.9rem] border border-[#E7EDF8] bg-white px-6 py-5 text-left shadow-[0_14px_40px_rgba(36,58,114,0.05)] transition-all hover:-translate-y-0.5">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-[linear-gradient(135deg,#EFF5FF,#FFFFFF)]">{props.icon}</div>
        <div>
          <p className="text-[1.3rem] font-black tracking-tight text-[#24386B]">{props.title}</p>
          <p className="mt-1 text-sm font-medium text-[#5F7297]">{props.helper}</p>
        </div>
      </div>
    </button>
  );
}

function SummaryPanel(props: { title: string; rows: Array<{ label: string; value: string | number }>; accent: string }) {
  return (
    <div className="border-r border-[#EEF2FA] p-6 last:border-r-0 xl:last:border-r-0">
      <h3 className="text-[1.4rem] font-black tracking-tight text-[#203266]">{props.title}</h3>
      <div className="mt-5 space-y-4">
        {props.rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 text-sm">
            <span className="font-semibold text-[#4E638B]">{row.label}</span>
            <span className={`text-[1.15rem] font-black ${props.accent}`}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}