
import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  Calendar,
  CreditCard,
  ChevronDown,
  FileText,
  Gift,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Phone,
  Rocket,
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

type CollapsibleKey = 'growth' | 'advanced' | 'system';

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
  const [openSections, setOpenSections] = useState<Record<CollapsibleKey, boolean>>({
    growth: true,
    advanced: false,
    system: false,
  });
  const isAdmin = ['admin', 'super_admin'].includes(String(userRole || '').toLowerCase());

  const handleNav = (view: ViewMode) => {
    onViewChange(view);
    setIsMobileOpen(false);
  };

  const derivedPendingDocCount = pendingDocCount || contacts.flatMap(c => c.documents || []).filter(d => d.status === 'Pending Review').length || 0;
  const unreadMessages = contacts.reduce((count, contact) => count + (contact.messageHistory?.filter((message) => !message.read && message.sender === 'client').length || 0), 0);
  const triageCount = contacts.filter((contact) => contact.status === 'Triage' || contact.automationMetadata?.sentiment === 'Critical').length;
  const activeAiCount = contacts.filter((contact) => contact.automationMetadata?.intensity && contact.status !== 'Closed').length;

  const clientSections = useMemo<NavSection[]>(() => {
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
    return [];
  }, [userRole]);

  const commandItems = [
    { view: ViewMode.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { view: ViewMode.INBOX, label: 'Unified Inbox', icon: Inbox, badge: unreadMessages || undefined },
    { view: ViewMode.ADMIN_SUPER_ADMIN_COMMAND_CENTER, label: 'AI Workforce', icon: Sparkles, badge: activeAiCount || undefined, adminOnly: true },
    { view: ViewMode.REVIEW_QUEUE, label: 'Approvals', icon: FileText, badge: derivedPendingDocCount || undefined },
    { view: ViewMode.SUPERVISOR_TRIAGE, label: 'Triage Hub', icon: ShieldAlert, badge: triageCount || undefined },
  ].filter((item) => !item.adminOnly || isAdmin);

  const growthItems = [
    { view: ViewMode.LEAD_SCOUT, label: 'Leads', icon: Search },
    { view: ViewMode.CRM, label: 'Clients', icon: Users, badge: contacts.length || undefined },
    { view: ViewMode.MESSAGING_BRIDGE, label: 'Outreach', icon: MessageSquare },
  ];

  const advancedItems = [
    { view: ViewMode.CALENDAR, label: 'Calendar', icon: Calendar },
    { view: ViewMode.AUTOMATION, label: 'Automation', icon: Workflow },
    { view: ViewMode.STRATEGY_SANDBOX, label: 'Strategy Sandbox', icon: Rocket },
    { view: ViewMode.POWER_DIALER, label: 'Dialer', icon: Phone },
    { view: ViewMode.SALES_TRAINER, label: 'Sales Trainer', icon: MessageSquare },
    { view: ViewMode.MARKETING, label: 'Marketing', icon: Send },
    { view: ViewMode.FUNDING_FLOW, label: 'Funding Applications', icon: WalletCards },
    { view: ViewMode.GRANTS, label: 'Grants', icon: Gift },
    { view: ViewMode.DOCUMENTS, label: 'Document Vault', icon: FileText },
    { view: ViewMode.UPLOAD_CREDIT_REPORT, label: 'Credit Upload', icon: ShieldCheck },
    { view: ViewMode.BILLING, label: 'Billing', icon: CreditCard },
  ];

  const systemItems = [
    { view: ViewMode.ADMIN_CEO_BRIEFING, label: 'CEO Briefing', icon: Sparkles, adminOnly: true },
    { view: ViewMode.ADMIN_COMMAND_INBOX, label: 'Command Inbox', icon: Inbox, adminOnly: true },
    { view: ViewMode.RESEARCH_DASHBOARD, label: 'Analytics', icon: BarChart3 },
    { view: ViewMode.KNOWLEDGE_HUB, label: 'Knowledge Hub', icon: Search },
    { view: ViewMode.INFRA_MONITOR, label: 'Infrastructure', icon: Server },
    { view: ViewMode.ADMIN_EXECUTIVE_DASHBOARD, label: 'Executive Dashboard', icon: Building2, adminOnly: true },
    { view: ViewMode.ADMIN_CONTROL_PLANE, label: 'Control Plane', icon: ShieldAlert, adminOnly: true },
    { view: ViewMode.ADMIN_HEALTH, label: 'Gateway Health', icon: Server, adminOnly: true },
    { view: ViewMode.SETTINGS, label: 'Settings', icon: Settings },
  ].filter((item) => !item.adminOnly || isAdmin);

  const toggleSection = (key: CollapsibleKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
          {userRole === 'client' ? clientSections.map((section) => (
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
          )) : (
            <>
              <SidebarSection label="Command">
                {commandItems.map((item) => (
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

              <CollapsibleSidebarSection
                label="Growth"
                title="Daily growth"
                isOpen={openSections.growth || growthItems.some((item) => item.view === currentView)}
                onToggle={() => toggleSection('growth')}
              >
                {growthItems.map((item) => (
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
              </CollapsibleSidebarSection>

              <CollapsibleSidebarSection
                label="Advanced"
                title="Occasional tools"
                isOpen={openSections.advanced || advancedItems.some((item) => item.view === currentView)}
                onToggle={() => toggleSection('advanced')}
              >
                {advancedItems.map((item) => (
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
              </CollapsibleSidebarSection>

              <CollapsibleSidebarSection
                label="System"
                title="Platform controls"
                isOpen={openSections.system || systemItems.some((item) => item.view === currentView)}
                onToggle={() => toggleSection('system')}
              >
                {systemItems.map((item) => (
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
              </CollapsibleSidebarSection>
            </>
          )}
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

function CollapsibleSidebarSection(props: { label: string; title: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="px-4 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white/55">{props.label}</p>
      <button
        type="button"
        onClick={props.onToggle}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-2 text-left text-[0.68rem] font-black uppercase tracking-[0.18em] text-white/70 transition-all hover:bg-white/8 hover:text-white"
      >
        <span>{props.title}</span>
        <ChevronDown size={14} className={`transition-transform ${props.isOpen ? 'rotate-180' : ''}`} />
      </button>
      {props.isOpen ? <div className="space-y-1.5">{props.children}</div> : null}
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
