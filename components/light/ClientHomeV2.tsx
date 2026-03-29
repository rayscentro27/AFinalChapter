import React from 'react';
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  FileText,
  Gift,
  LayoutDashboard,
  ShieldCheck,
  Landmark,
  MessageSquare,
} from 'lucide-react';
import { Contact, ViewMode } from '../../types';

type ClientHomeV2Props = {
  contact: Contact;
  onNavigate?: (view: ViewMode, pathname?: string) => void;
};

const modules = [
  {
    key: 'overview',
    title: 'Executive Overview',
    description: 'See all major areas in one command view',
    icon: <LayoutDashboard className="h-4 w-4" />,
    view: ViewMode.PORTAL_OVERVIEW,
    path: '/portal/overview',
    active: true,
  },
  {
    key: 'credit',
    title: 'Credit Optimization',
    description: 'Improve personal & business credit profiles',
    icon: <ShieldCheck className="h-4 w-4" />,
    view: ViewMode.PORTAL_CREDIT,
    path: '/portal/credit',
  },
  {
    key: 'funding',
    title: 'Funding Engine',
    description: 'Get matched with funding & capital options',
    icon: <Landmark className="h-4 w-4" />,
    view: ViewMode.PORTAL_FUNDING,
    path: '/portal/funding',
  },
  {
    key: 'business',
    title: 'Business Setup',
    description: 'Build and structure your business correctly',
    icon: <BriefcaseBusiness className="h-4 w-4" />,
    view: ViewMode.PORTAL_BUSINESS,
    path: '/portal/business',
  },
  {
    key: 'grants',
    title: 'Grants & Opportunities',
    description: 'Discover grants and hidden funding programs',
    icon: <Gift className="h-4 w-4" />,
    view: ViewMode.PORTAL_GRANTS,
    path: '/portal/grants',
  },
];

const overviewMetrics = [
  { label: 'Credit', value: '684', helper: 'Personal + business', tone: 'bg-[#EAF7FB]' },
  { label: 'Funding', value: '78%', helper: '$25k-$75k range', tone: 'bg-[#EDF9EE]' },
  { label: 'Business', value: '82%', helper: 'LLC active', tone: 'bg-[#F2EFFF]' },
  { label: 'Grants', value: '$145k', helper: '9 matched opportunities', tone: 'bg-[#FFF8E8]' },
];

const priorityActions = [
  { module: 'Credit', title: 'Reduce utilization on 2 revolving accounts', signal: 'High' },
  { module: 'Funding', title: 'Upload bank statements for strongest offers', signal: 'High' },
  { module: 'Business', title: 'Complete annual report filing', signal: 'Medium' },
  { module: 'Grants', title: 'Prepare narrative for Growth Catalyst Grant', signal: 'Medium' },
];

const progressBars = [48, 62, 78, 86, 102, 116];

export default function ClientHomeV2(props: ClientHomeV2Props) {
  const displayName = props.contact.name || 'Client';
  const documents = props.contact.documents || [];
  const missingDocuments = documents.filter((document) => document.required && document.status === 'Missing').length;
  const unreadMessages = (props.contact.messageHistory || []).filter((message) => message.sender !== 'client' && !message.read).length;
  const pendingTasks = (props.contact.clientTasks || []).filter((task) => task.status === 'pending');
  const nextTask = pendingTasks[0] || null;
  const nextMilestoneLabel = nextTask?.title || 'Open funding and review your strongest offers';
  const nextMilestoneHelper = nextTask?.description || 'Start with the highest-priority action below so your capital path stays clear.';

  const clarityCards = [
    {
      label: 'Where am I?',
      title: 'Executive overview',
      helper: 'You are looking at the cross-module command view for credit, funding, business setup, and grants.',
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      label: 'What is blocking me?',
      title: missingDocuments ? `${missingDocuments} required document${missingDocuments === 1 ? '' : 's'} missing` : 'No document blockers right now',
      helper: missingDocuments ? 'Upload the missing records to keep funding and grant workflows moving.' : 'Your document requirements look clear for the current stage.',
      icon: <FileText className="h-4 w-4" />,
    },
    {
      label: 'What do I do next?',
      title: nextTask?.title || 'Review your top funding and credit actions',
      helper: nextTask?.description || 'Start with the highest-priority action below so your next milestone stays obvious.',
      icon: <ArrowRight className="h-4 w-4" />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1320px] space-y-6 pb-10 subpixel-antialiased">
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <p className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-[#607CC1]">Client dashboard</p>
          <h1 className="text-[2.6rem] font-black tracking-tight text-[#1B2C61] sm:text-[3.1rem]">Welcome Back, {displayName}</h1>
          <p className="text-base text-[#61769D]">Your command view for credit, funding, business setup, and grants.</p>
        </div>

        <div className="rounded-[2rem] border border-[#DFE7F4] bg-white p-5 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#607CC1]">Next milestone</p>
              <h2 className="mt-2 text-[1.55rem] font-black tracking-tight text-[#17233D]">Keep your funding path moving</h2>
            </div>
            <span className="rounded-full border border-[#D5E4FF] bg-[#EEF4FF] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#4677E6]">
              {pendingTasks.length} pending
            </span>
          </div>
          <div className="mt-5 space-y-3">
            <div className="rounded-[1.4rem] border border-[#DCE5F4] bg-[#F9FBFE] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Do this next</p>
              <p className="mt-2 text-base font-black tracking-tight text-[#17233D]">{nextMilestoneLabel}</p>
              <p className="mt-1 text-sm text-[#61769D]">{nextMilestoneHelper}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => props.onNavigate?.(ViewMode.PORTAL_FUNDING, '/portal/funding')}
                className="rounded-[1.2rem] bg-[#17233D] px-4 py-3 text-left text-white shadow-[0_14px_28px_rgba(23,35,61,0.18)] transition-all hover:bg-[#4677E6]"
              >
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/70">Primary action</p>
                <p className="mt-2 text-sm font-black tracking-tight">Open Funding</p>
              </button>
              <div className="rounded-[1.2rem] border border-[#E4ECF8] bg-[#FBFDFF] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">Attention</p>
                <p className="mt-2 text-sm font-black tracking-tight text-[#17233D]">{unreadMessages} unread updates</p>
                <p className="mt-1 text-sm text-[#61769D]">{missingDocuments} missing required docs</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-[#DFE7F4] bg-white px-5 py-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
        <h2 className="text-[2rem] font-black tracking-tight text-[#17233D]">Your Nexus Modules</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          {modules.map((module) => (
            <button
              key={module.key}
              type="button"
              onClick={() => props.onNavigate?.(module.view, module.path)}
              className={`rounded-[1.35rem] border px-4 py-4 text-left transition-all ${module.active ? 'border-[#24C7F4] bg-[#E9FAFE]' : 'border-[#D9E2F2] bg-white hover:border-[#BFD0EC] hover:bg-[#FCFDFF]'}`}
            >
              <div className="flex items-start gap-4 overflow-hidden">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] bg-[#17233D] text-white">
                  {module.icon}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[1rem] font-black tracking-tight text-[#17233D] xl:text-[1.1rem]">{module.title}</p>
                  <p className="mt-1 line-clamp-2 text-[0.84rem] leading-6 text-[#61769D] xl:text-[0.95rem]">{module.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-[2.4rem] font-black tracking-tight text-[#17233D]">Nexus Command View</h2>
          <p className="mt-2 text-lg text-[#61769D]">A cross-module snapshot of credit, funding, business setup, and grants.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {overviewMetrics.map((metric) => (
            <article key={metric.label} className={`rounded-[1.7rem] border border-[#E4ECF8] p-5 shadow-sm ${metric.tone}`}>
              <p className="text-lg font-black text-[#29417E]">{metric.label}</p>
              <p className="mt-5 text-[3rem] font-black leading-none tracking-tight text-[#17233D]">{metric.value}</p>
              <p className="mt-10 text-sm font-medium text-[#61769D]">{metric.helper}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[2rem] border border-[#DFE7F4] bg-white p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
          <h2 className="text-[2rem] font-black tracking-tight text-[#17233D]">Priority actions across all modules</h2>
          <div className="mt-8 space-y-3">
            {priorityActions.map((item, index) => (
              <div key={item.title} className="flex items-center justify-between gap-4 rounded-[1.2rem] border border-[#DCE5F4] bg-[#F9FBFE] px-4 py-3">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#18233D] text-xs font-black text-white">{index + 1}</div>
                  <div className="min-w-0">
                    <p className="text-[0.78rem] font-medium text-[#7185A9]">{item.module}</p>
                    <p className="truncate text-[1.05rem] font-bold tracking-tight text-[#17233D]">{item.title}</p>
                  </div>
                </div>
                <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${item.signal === 'High' ? 'bg-[#FFECEF] text-[#E25A74]' : 'bg-[#FFF3DD] text-[#C27A24]'}`}>
                  {item.signal}
                </span>
              </div>
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

      <section className="grid gap-4 md:grid-cols-3">
        {clarityCards.map((card) => (
          <article key={card.label} className="rounded-[1.7rem] border border-[#DFE7F4] bg-white p-5 shadow-[0_16px_44px_rgba(36,58,114,0.04)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-[#EEF4FF] text-[#4677E6]">
              {card.icon}
            </div>
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-[#91A1BC]">{card.label}</p>
            <p className="mt-2 text-[1.05rem] font-black tracking-tight text-[#17233D]">{card.title}</p>
            <p className="mt-2 text-sm text-[#61769D]">{card.helper}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-[#DFE7F4] bg-white p-6 shadow-[0_16px_44px_rgba(36,58,114,0.05)]">
        <h2 className="text-[1.55rem] font-black tracking-tight text-[#17233D]">Attention rail</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="flex items-start gap-3 rounded-[1.2rem] border border-[#FFE1E7] bg-[#FFF6F8] px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 text-[#E25A74]" />
            <div>
              <p className="text-sm font-black tracking-tight text-[#17233D]">Funding is strongest after required uploads are complete</p>
              <p className="mt-1 text-sm text-[#61769D]">Missing statements and identity records will slow lender and grant progress.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-[1.2rem] border border-[#E4ECF8] bg-[#FBFDFF] px-4 py-3">
            <MessageSquare className="mt-0.5 h-4 w-4 text-[#4677E6]" />
            <div>
              <p className="text-sm font-black tracking-tight text-[#17233D]">Messaging is your workflow hub</p>
              <p className="mt-1 text-sm text-[#61769D]">Use advisor updates to clarify missing items and confirm your next milestone.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}