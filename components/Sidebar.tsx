
import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Calendar,
  CreditCard,
  FileText,
  Gift,
  Globe2,
  Home,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Network,
  Phone,
  Rocket,
  Scale,
  Search,
  Send,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  Workflow,
  Wrench,
  X,
} from 'lucide-react';
import { ViewMode, AgencyBranding, Contact } from '../types';

type NavItem = {
  view: ViewMode;
  label: string;
  icon: React.ElementType;
  badge?: number;
  adminOnly?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  pendingDocCount?: number; 
  onLogout: () => void | Promise<void>;
  branding?: AgencyBranding;
  contacts?: Contact[];
  userRole?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onViewChange, 
  pendingDocCount = 0, 
  onLogout, 
  branding,
  contacts = [],
  userRole
}) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const isAdmin = ['admin', 'super_admin'].includes(String(userRole || '').toLowerCase());

  const handleNav = (view: ViewMode) => {
    window.location.hash = view.toLowerCase();
    setIsMobileOpen(false);
  };

  const derivedPendingDocCount = pendingDocCount || contacts.flatMap(c => c.documents || []).filter(d => d.status === 'Pending Review').length || 0;

  const navSections = useMemo<NavSection[]>(() => {
    if (userRole === 'client') {
      return [
        {
          label: 'Portal',
          items: [
            { view: ViewMode.PORTAL, label: 'Home', icon: Home },
            { view: ViewMode.PORTAL_CREDIT, label: 'Credit Scores', icon: ShieldCheck },
            { view: ViewMode.PORTAL_FUNDING, label: 'Funding Options', icon: WalletCards },
            { view: ViewMode.PORTAL_BUSINESS, label: 'Business Setup', icon: Building2 },
            { view: ViewMode.PORTAL_GRANTS, label: 'Grants Discovery', icon: Gift },
          ],
        },
        {
          label: 'Account',
          items: [
            { view: ViewMode.DOCUMENTS, label: 'Documents', icon: FileText },
            { view: ViewMode.BILLING, label: 'Billing', icon: CreditCard },
            { view: ViewMode.COMMUNICATION_PREFERENCES, label: 'Support', icon: MessageSquare },
            { view: ViewMode.SECURITY_SETTINGS, label: 'Security', icon: ShieldAlert },
            { view: ViewMode.KNOWLEDGE_HUB, label: 'NexusOne Labs', icon: Search },
            { view: ViewMode.SETTINGS, label: 'Settings', icon: Settings },
          ],
        },
      ];
    }

    const sections: NavSection[] = [
      {
        label: 'Command',
        items: [
          { view: ViewMode.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
          { view: ViewMode.ADMIN_CEO_BRIEFING, label: 'CEO Briefing', icon: Sparkles, adminOnly: true },
          { view: ViewMode.ADMIN_SUPER_ADMIN_COMMAND_CENTER, label: 'AI Workforce', icon: Sparkles, adminOnly: true },
          { view: ViewMode.ADMIN_COMMAND_INBOX, label: 'Command Inbox', icon: Inbox, adminOnly: true },
          { view: ViewMode.INBOX, label: 'Unified Inbox', icon: Inbox, badge: 3 },
          { view: ViewMode.SUPERVISOR_TRIAGE, label: 'Triage Hub', icon: ShieldAlert },
          { view: ViewMode.CALENDAR, label: 'Calendar', icon: Calendar },
          { view: ViewMode.AUTOMATION, label: 'Automation', icon: Workflow },
          { view: ViewMode.STRATEGY_SANDBOX, label: 'Strategy Sandbox', icon: Rocket },
        ],
      },
      {
        label: 'Pipeline',
        items: [
          { view: ViewMode.LEAD_SCOUT, label: 'Lead Scout', icon: Search },
          { view: ViewMode.CRM, label: 'Clients', icon: Users, badge: contacts.length || 392 },
          { view: ViewMode.POWER_DIALER, label: 'Power Dialer', icon: Phone },
          { view: ViewMode.SALES_TRAINER, label: 'Sales Trainer', icon: MessageSquare },
          { view: ViewMode.MESSAGING_BRIDGE, label: 'Messaging Bridge', icon: MessageSquare },
          { view: ViewMode.MARKETING, label: 'Marketing', icon: Send },
          { view: ViewMode.ADMIN_FUNNEL_CONTROL_CENTER, label: 'Funnel Control', icon: Network, adminOnly: true },
          { view: ViewMode.ADMIN_FUNNEL_SEQUENCES, label: 'Funnel Sequences', icon: Workflow, adminOnly: true },
          { view: ViewMode.ADMIN_FUNNEL_LEADS, label: 'Funnel Leads', icon: Users, adminOnly: true },
          { view: ViewMode.ADMIN_FUNNEL_METRICS, label: 'Funnel Metrics', icon: BarChart3, adminOnly: true },
        ],
      },
      {
        label: 'Capital',
        items: [
          { view: ViewMode.FUNDING_FLOW, label: 'Funding Applications', icon: BriefcaseBusiness },
          { view: ViewMode.FUNDING_RESEARCH, label: 'Funding Research', icon: Search },
          { view: ViewMode.FUNDING_OUTCOMES, label: 'Funding Outcomes', icon: WalletCards },
          { view: ViewMode.WEALTH_MANAGER, label: 'Capital Planning', icon: WalletCards },
          { view: ViewMode.ADMIN_REVIEW_ANALYTICS, label: 'Credit Optimization', icon: ShieldCheck },
          { view: ViewMode.ADMIN_SBA, label: 'Business Builder', icon: Building2 },
          { view: ViewMode.GRANTS, label: 'Grants & Opportunities', icon: Gift },
          { view: ViewMode.ADMIN_FUNDING_CATALOG, label: 'Funding Catalog', icon: BriefcaseBusiness, adminOnly: true },
          { view: ViewMode.ADMIN_GRANTS_CATALOG, label: 'Grants Catalog', icon: Gift, adminOnly: true },
          { view: ViewMode.ADMIN_GRANTS_TRACKING, label: 'Grants Tracking', icon: FileText, adminOnly: true },
          { view: ViewMode.PARTNER_MARKETPLACE, label: 'Marketplace', icon: Globe2 },
          { view: ViewMode.FORENSIC_HUB, label: 'Forensic Hub', icon: ShieldCheck },
          { view: ViewMode.LENDER_ROOM, label: 'Lender Room', icon: Scale },
          { view: ViewMode.DOC_GENERATOR, label: 'Document Builder', icon: FileText },
          { view: ViewMode.UPLOAD_CREDIT_REPORT, label: 'Credit Upload', icon: FileText },
          { view: ViewMode.REVIEW_QUEUE, label: 'Review Queue', icon: FileText, badge: derivedPendingDocCount || undefined },
          { view: ViewMode.DOCUMENTS, label: 'Document Vault', icon: FileText },
        ],
      },
      {
        label: 'Operations',
        items: [
          { view: ViewMode.RESEARCH_DASHBOARD, label: 'Analytics', icon: BarChart3 },
          { view: ViewMode.KNOWLEDGE_HUB, label: 'Knowledge Hub', icon: Search },
          { view: ViewMode.SCENARIO_RUNNER, label: 'Scenario Runner', icon: Workflow },
          { view: ViewMode.INFRA_MONITOR, label: 'Infrastructure', icon: Server },
          { view: ViewMode.SITEMAP, label: 'Sitemap', icon: Network },
          { view: ViewMode.CHANNEL_MAPPER, label: 'Channel Mapper', icon: Network, adminOnly: true },
          { view: ViewMode.CONTACT_MERGE, label: 'Contact Merge', icon: Users, adminOnly: true },
          { view: ViewMode.MERGE_JOBS, label: 'Merge Jobs', icon: Workflow, adminOnly: true },
          { view: ViewMode.MERGE_QUEUE, label: 'Merge Queue', icon: Workflow, adminOnly: true },
          { view: ViewMode.SUGGESTIONS, label: 'Suggestions', icon: Sparkles, adminOnly: true },
          { view: ViewMode.TEAM_MEMBERS, label: 'Team Members', icon: Users, adminOnly: true },
          { view: ViewMode.ON_CALL, label: 'On Call', icon: Calendar, adminOnly: true },
          { view: ViewMode.CHANNEL_POOLS, label: 'Channel Pools', icon: Network, adminOnly: true },
          { view: ViewMode.DEAD_LETTERS, label: 'Dead Letters', icon: Mail, adminOnly: true },
          { view: ViewMode.ADMIN_HEALTH, label: 'Gateway Health', icon: Server, adminOnly: true },
          { view: ViewMode.ADMIN_AUTONOMY, label: 'Autonomy Dashboard', icon: Sparkles, adminOnly: true },
          { view: ViewMode.ADMIN_CONTROL_PLANE, label: 'Control Plane', icon: ShieldAlert, adminOnly: true },
          { view: ViewMode.SRE_DASHBOARD, label: 'SRE Dashboard', icon: Server, adminOnly: true },
          { view: ViewMode.CHANNEL_HEALTH, label: 'Channel Health', icon: Server, adminOnly: true },
          { view: ViewMode.OUTBOX, label: 'Outbox', icon: Send, adminOnly: true },
          { view: ViewMode.PUBLIC_API, label: 'Public API', icon: Globe2, adminOnly: true },
        ],
      },
      {
        label: 'Admin',
        items: [
          { view: ViewMode.ADMIN_ORGANIZATION_DASHBOARD, label: 'Organization Admin', icon: Building2, adminOnly: true },
          { view: ViewMode.ADMIN_WHITE_LABEL_SETTINGS, label: 'White Label', icon: Settings, adminOnly: true },
          { view: ViewMode.ADMIN_SOURCE_REGISTRY, label: 'Source Registry', icon: Globe2, adminOnly: true },
          { view: ViewMode.ADMIN_MONETIZATION_OPPORTUNITIES, label: 'Revenue Ops', icon: WalletCards, adminOnly: true },
          { view: ViewMode.ADMIN_AUTONOMOUS_EXPANSION, label: 'Expansion', icon: Rocket, adminOnly: true },
          { view: ViewMode.ADMIN_EXECUTIVE_DASHBOARD, label: 'Executive Dashboard', icon: BarChart3, adminOnly: true },
          { view: ViewMode.ADMIN_NEXUS_ONE, label: 'Nexus One', icon: Rocket, adminOnly: true },
          { view: ViewMode.ADMIN_CREDENTIALS, label: 'Credentials', icon: KeyRound, adminOnly: true },
          { view: ViewMode.ADMIN_DEAL_ESCALATIONS, label: 'Deal Escalations', icon: ShieldAlert, adminOnly: true },
          { view: ViewMode.ADMIN_LIFECYCLE_AUTOMATION, label: 'Lifecycle Automation', icon: Workflow, adminOnly: true },
          { view: ViewMode.ADMIN_ROLES, label: 'Roles', icon: Users, adminOnly: true },
          { view: ViewMode.ADMIN_MEMBERS, label: 'Members', icon: Users, adminOnly: true },
          { view: ViewMode.ADMIN_POLICIES, label: 'Policies', icon: ShieldCheck, adminOnly: true },
          { view: ViewMode.ADMIN_CONSENTS, label: 'Consents', icon: ShieldCheck, adminOnly: true },
          { view: ViewMode.ADMIN_SUBSCRIPTIONS, label: 'Subscriptions', icon: CreditCard, adminOnly: true },
          { view: ViewMode.ADMIN_DOCUMENTS, label: 'Admin Documents', icon: FileText, adminOnly: true },
          { view: ViewMode.BILLING, label: 'Billing', icon: CreditCard },
          { view: ViewMode.BILLING_COMMISSIONS, label: 'Commission Billing', icon: CreditCard },
          { view: ViewMode.ADMIN_MAILING_QUEUE, label: 'Mailing Queue', icon: Mail, adminOnly: true },
          { view: ViewMode.ADMIN_MAILING_DASHBOARD, label: 'Mailing Dashboard', icon: Mail, adminOnly: true },
          { view: ViewMode.ADMIN_LEGAL_DOCS, label: 'Legal Publisher', icon: FileText, adminOnly: true },
          { view: ViewMode.ADMIN_EMAIL_PROVIDERS, label: 'Email Providers', icon: Mail, adminOnly: true },
          { view: ViewMode.ADMIN_EMAIL_ROUTING, label: 'Email Routing', icon: Mail, adminOnly: true },
          { view: ViewMode.ADMIN_EMAIL_LOGS, label: 'Email Logs', icon: Inbox, adminOnly: true },
          { view: ViewMode.ADMIN_WORKFLOWS, label: 'Workflows', icon: Workflow, adminOnly: true },
          { view: ViewMode.ADMIN_COMMISSIONS, label: 'Commission Admin', icon: CreditCard, adminOnly: true },
          { view: ViewMode.SETTINGS, label: 'Settings', icon: Settings },
        ],
      },
    ];

    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !item.adminOnly || isAdmin),
      }))
      .filter((section) => section.items.length > 0);
  }, [contacts.length, derivedPendingDocCount, isAdmin, userRole]);

  return (
    <>
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="fixed left-4 top-4 z-[60] rounded-xl border border-[#D8E6FF] bg-white p-2.5 text-[#3A66D3] shadow-lg transition-all active:scale-95 md:hidden"
      >
        {isMobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <div className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col overflow-hidden border-r border-[#A8C7FF]/20 bg-[linear-gradient(180deg,#2E57C9_0%,#345FD5_36%,#27469E_100%)] text-white shadow-[0_18px_60px_rgba(28,54,141,0.28)] transition-transform duration-500 ease-in-out subpixel-antialiased ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="px-7 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[1.85rem] font-black tracking-tight text-white">{branding?.name?.replace(' OS', '').replace('OS', '') || 'NexusOne'}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
          {navSections.map((section) => (
            <SidebarSection key={section.label} label={section.label}>
              {section.items.map((item) => (
                <SidebarItem
                  key={item.label}
                  id={item.view}
                  label={item.label}
                  icon={item.icon}
                  currentView={currentView}
                  onViewChange={handleNav}
                  badge={item.badge}
                />
              ))}
            </SidebarSection>
          ))}
        </nav>

        <div className="mt-auto px-5 py-6 text-white/75">
          <div className="mb-4 flex items-center justify-between text-[0.72rem] font-black uppercase tracking-[0.18em]">
            <span>NexusOne</span>
            <span>Live</span>
          </div>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-xl bg-white/10 px-4 py-3 text-left text-[0.72rem] font-black uppercase tracking-[0.18em] text-white transition-all hover:bg-white/16"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </div>

      {isMobileOpen && <div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm md:hidden" onClick={() => setIsMobileOpen(false)}></div>}
    </>
  );
};

function SidebarSection(props: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="px-4 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white/55">{props.label}</p>
      <div className="space-y-1.5">{props.children}</div>
    </section>
  );
}

interface SidebarItemProps {
  id: ViewMode;
  label: string;
  icon: React.ElementType;
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  badge?: number;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ id, label, icon: Icon, currentView, onViewChange, badge }) => {
  const isActive = currentView === id;

  return (
    <button
      onClick={() => onViewChange(id)}
      className={`group relative flex w-full items-center justify-between rounded-2xl px-4 py-3 transition-all duration-300 ${
        isActive
          ? 'bg-[linear-gradient(180deg,rgba(108,160,255,0.28),rgba(255,255,255,0.10))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_18px_40px_rgba(37,74,176,0.24)]'
          : 'text-white/88 hover:bg-white/8'
      }`}
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-white/16' : 'bg-transparent'}`}>
          <Icon size={18} className={isActive ? 'text-white' : 'text-white/88'} />
        </div>
        <span className="truncate text-sm font-bold tracking-tight">
          {label}
        </span>
      </div>

      {badge !== undefined ? (
        <div className={`min-w-[1.45rem] rounded-full px-2 py-0.5 text-center text-[0.68rem] font-black ${isActive ? 'bg-white text-[#2C56C7]' : 'bg-white/18 text-white'}`}>
          {badge}
        </div>
      ) : null}
    </button>
  );
};

export default Sidebar;
