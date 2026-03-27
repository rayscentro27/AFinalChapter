import React, { useMemo } from 'react';
import {
  Activity,
  BriefcaseBusiness,
  ChevronRight,
  Gift,
  Headphones,
  ShieldCheck,
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

const cardClass = 'rounded-[1.65rem] border border-[#E6ECF6] bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(252,253,255,0.98)_100%)] shadow-[0_10px_28px_rgba(36,58,114,0.045)]';

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

  const summaryMetrics = [
    { label: 'Active Clients', value: overview.totalClients, sublabel: '' },
    { label: 'New Clients', value: 14, sublabel: '(This Week)' },
    { label: 'Churned Clients', value: 2, sublabel: '(This Week)' },
    { label: 'Support Requests', value: overview.supportRequests, sublabel: 'Open' },
  ];

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

  const quickActions = [
    { title: 'Manage Clients', helper: 'View and manage client accounts', icon: <Users className="h-10 w-10 text-[#4B86F6]" />, onClick: () => props.onNavigate?.(ViewMode.CRM) },
    { title: 'Review Applications', helper: 'Process and approve funding applications', icon: <BriefcaseBusiness className="h-10 w-10 text-[#47C4B3]" />, onClick: () => props.onNavigate?.(ViewMode.FUNDING_FLOW) },
    { title: 'Grant Discovery Insights', helper: 'Identify and track grant opportunities', icon: <ShieldCheck className="h-10 w-10 text-[#3C8CF5]" />, onClick: () => props.onNavigate?.(ViewMode.ADMIN_REVIEW_ANALYTICS) },
  ];

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 pb-10 subpixel-antialiased">
      <section className="px-1 pt-2">
        <h1 className="text-[1.72rem] font-black tracking-[-0.04em] text-[#1B2C61] sm:text-[2.02rem]">Welcome to the SuperAdmin Portal!</h1>
      </section>

      <section className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={<Users className="h-9 w-9 text-[#4A87F7]" />} value={overview.totalClients} label="Total Clients" />
        <MetricCard icon={<BriefcaseBusiness className="h-9 w-9 text-[#46C5B5]" />} value={overview.pendingApplications} label="Pending Applications" />
        <MetricCard icon={<Activity className="h-9 w-9 text-[#59D0C2]" />} value={`${overview.approvalRate}%`} label="Approval Rate" />
        <MetricCard icon={<Gift className="h-9 w-9 text-[#9183FF]" />} value={overview.successfulGrants} label="Successful Grants" />
        <MetricCard icon={<Headphones className="h-9 w-9 text-[#57A5F9]" />} value={overview.supportRequests} label="Support Requests" />
      </section>

      <section className="grid gap-3.5 xl:grid-cols-3">
        {quickActions.map((action) => (
          <ActionCard key={action.title} title={action.title} helper={action.helper} icon={action.icon} onClick={action.onClick} />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <div className={`${cardClass} p-6`}>
          <div className="mb-5 flex items-center gap-3">
            <h2 className="text-[1.35rem] font-black tracking-tight text-[#1C2E63]">Latest Client Activity</h2>
            <button type="button" className="ml-auto rounded-full border border-[#DEE7F6] bg-[#F7FAFF] px-3.5 py-1.5 text-[0.82rem] font-bold text-[#5B79B0]">View All</button>
          </div>
          <div className="space-y-3">
            {activityRows.map((row, index) => (
              <div key={`${row.name}-${index}`} className="flex items-center gap-4 rounded-[1.15rem] border border-[#EDF2F9] bg-[rgba(255,255,255,0.6)] px-4 py-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,#EAF2FF,#F7FBFF)] text-sm font-black text-[#3B65D8]">
                  {row.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.98rem] font-black tracking-tight text-[#24386B]">{row.name}</p>
                  <p className="truncate text-[0.84rem] font-medium text-[#65789D]">{row.detail}</p>
                </div>
                <div className="hidden items-center gap-3 lg:flex">
                  <p className="text-[0.82rem] font-medium text-[#7A8CAE]">{row.date}</p>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-[1rem] bg-[linear-gradient(135deg,var(--tw-gradient-stops))] ${row.accent}`}>
                    <row.icon className={`h-5 w-5 ${row.tint}`} />
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#A6B4D1]" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className={`${cardClass} overflow-hidden`}>
            <div className="grid gap-0 sm:grid-cols-4">
              {summaryMetrics.map((metric, index) => (
                <div key={metric.label} className={`p-5 ${index > 0 ? 'border-l border-[#EDF2F9]' : ''}`}>
                  <p className="text-[1.9rem] font-black leading-none tracking-[-0.04em] text-[#223569]">{metric.value}</p>
                  <p className="mt-2 text-[0.82rem] font-black text-[#516893]">{metric.label}</p>
                  <p className="text-[0.76rem] font-medium text-[#7A8CAE]">{metric.sublabel}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={`${cardClass} p-6`}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[1.35rem] font-black tracking-tight text-[#1C2E63]">Credit Score Snapshot</h2>
              <button type="button" className="rounded-full border border-[#DEE7F6] bg-[#F7FAFF] px-3.5 py-1.5 text-[0.82rem] font-bold text-[#5B79B0]">View All</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {bureauScores.map((bureau) => (
                <div key={bureau.bureau} className="rounded-[1.1rem] border border-[#EDF2F9] bg-[linear-gradient(180deg,#FCFDFF_0%,#F9FBFF_100%)] p-4">
                  <p className={`text-sm font-black ${bureau.tone}`}>{bureau.bureau}</p>
                  <div className="mt-4 flex items-end gap-2">
                    <span className="text-[2.7rem] font-black tracking-tight text-[#213266]">{bureau.score}</span>
                    <span className="pb-1 text-[0.82rem] font-semibold text-[#61759B]">{bureau.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={`${cardClass} grid gap-0 overflow-hidden xl:grid-cols-3`}>
        <SummaryPanel title="Clients Overview" rows={clientOverviewRows} accent="text-[#4378E9]" />
        <SummaryPanel title="Funding Insights" rows={fundingRows} accent="text-[#42BFAE]" />
        <div className="border-l border-[#EEF2FA] p-6">
          <h3 className="text-[1.2rem] font-black tracking-tight text-[#203266]">Credit Score Snapshot</h3>
          <div className="mt-5 grid gap-3">
            {bureauScores.map((bureau) => (
              <div key={bureau.bureau} className="rounded-[1rem] border border-[#EDF2F9] bg-[linear-gradient(180deg,#FCFDFF_0%,#F9FBFF_100%)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className={`text-[0.82rem] font-black ${bureau.tone}`}>{bureau.bureau}</p>
                  <span className="text-[0.78rem] font-semibold text-[#61759B]">{bureau.label}</span>
                </div>
                <p className="mt-2 text-[2rem] font-black leading-none tracking-[-0.04em] text-[#213266]">{bureau.score}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard(props: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <article className="flex h-full items-center rounded-[1.35rem] border border-[#E6ECF6] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(251,253,255,0.99)_100%)] px-5 py-5 shadow-[0_8px_24px_rgba(36,58,114,0.04)]">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/70 bg-[linear-gradient(135deg,#EEF4FF,#FFFFFF)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">{props.icon}</div>
        <div>
          <p className="text-[2.15rem] font-black leading-none tracking-[-0.04em] text-[#213266]">{props.value}</p>
          <p className="mt-1.5 text-[0.84rem] font-semibold text-[#6A7D9F]">{props.label}</p>
        </div>
      </div>
    </article>
  );
}

function ActionCard(props: { title: string; helper: string; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={props.onClick} className="rounded-[1.35rem] border border-[#E6ECF6] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(251,253,255,0.99)_100%)] px-5 py-4.5 text-left shadow-[0_8px_24px_rgba(36,58,114,0.04)] transition-all hover:-translate-y-0.5">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] border border-white/70 bg-[linear-gradient(135deg,#EFF5FF,#FFFFFF)]">{props.icon}</div>
        <div>
          <p className="text-[1.12rem] font-black tracking-tight text-[#24386B]">{props.title}</p>
          <p className="mt-0.5 text-[0.84rem] font-medium text-[#697C9F]">{props.helper}</p>
        </div>
      </div>
    </button>
  );
}

function SummaryPanel(props: { title: string; rows: Array<{ label: string; value: string | number }>; accent: string }) {
  return (
    <div className="border-r border-[#EEF2FA] p-6 last:border-r-0 xl:last:border-r-0">
      <h3 className="text-[1.2rem] font-black tracking-tight text-[#203266]">{props.title}</h3>
      <div className="mt-5 space-y-4">
        {props.rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 text-sm">
            <span className="font-semibold text-[#65789D]">{row.label}</span>
            <span className={`text-[1.05rem] font-black ${props.accent}`}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
