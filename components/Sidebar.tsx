
import React, { useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  CreditCard,
  Crown,
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
  Search,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
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

  const clientSections = useMemo<NavSection[]>(() => {
    if (userRole === 'client') {
      return [
        {
          label: 'Portal',
          items: [
            { view: ViewMode.PORTAL, label: 'Next Action', icon: Home },
            { view: ViewMode.PORTAL_BUSINESS, label: 'Business Setup', icon: Building2 },
            { view: ViewMode.PORTAL_CREDIT, label: 'Credit Profile', icon: ShieldCheck },
            { view: ViewMode.PORTAL_FUNDING, label: 'Funding Readiness', icon: WalletCards },
            { view: ViewMode.PORTAL_GRANTS, label: 'Grants', icon: Gift },
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
    { view: ViewMode.INBOX, label: 'Inbox', icon: Inbox, badge: unreadMessages || undefined },
    { view: ViewMode.ADMIN_CEO_BRIEFING, label: 'Founder', icon: Crown, adminOnly: true },
  ].filter((item) => !item.adminOnly || isAdmin);

  const operationsItems = [
    { view: ViewMode.CRM, label: 'Clients', icon: Users, badge: contacts.length || undefined },
    { view: ViewMode.FUNDING_FLOW, label: 'Funding', icon: WalletCards },
    { view: ViewMode.REVIEW_QUEUE, label: 'Approvals', icon: FileText, badge: derivedPendingDocCount || undefined },
    { view: ViewMode.SUPERVISOR_TRIAGE, label: 'Alerts', icon: ShieldAlert, badge: triageCount || undefined },
    { view: ViewMode.DOCUMENTS, label: 'Documents', icon: FileText },
    { view: ViewMode.GRANTS, label: 'Grants', icon: Gift },
  ];

  const growthItems = [
    { view: ViewMode.LEAD_SCOUT, label: 'Opportunities', icon: Search, badge: contacts.filter((contact) => contact.status === 'Lead').length || undefined },
    { view: ViewMode.POWER_DIALER, label: 'Outreach', icon: Phone },
  ];

  const advancedItems: NavItem[] = [
    { view: ViewMode.CALENDAR, label: 'Calendar', icon: Calendar },
    { view: ViewMode.SCENARIO_RUNNER, label: 'Simulations', icon: Workflow },
  ];

  const aiItems: NavItem[] = [
    { view: ViewMode.ADMIN_SUPER_ADMIN_COMMAND_CENTER, label: 'AI Employees', icon: Workflow },
  ];

  const systemItems: NavItem[] = [
    { view: ViewMode.ADMIN_CONTROL_PLANE, label: 'Platform', icon: Server, adminOnly: true },
    { view: ViewMode.BILLING, label: 'Billing', icon: CreditCard },
  ].filter((item) => !item.adminOnly || isAdmin);

  const toggleSection = (key: CollapsibleKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <>
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="fixed left-4 top-4 z-[60] rounded-[1rem] border border-[#D8E6FF] bg-white p-2.5 text-[#3A66D3] shadow-[0_12px_30px_rgba(34,66,152,0.12)] transition-all active:scale-95 md:hidden"
      >
        {isMobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <div className={`fixed left-0 top-0 z-50 flex h-screen w-60 flex-col overflow-hidden border-r border-white/10 bg-[linear-gradient(180deg,#2E57C9_0%,#315DD0_34%,#27489F_100%)] text-white shadow-[0_18px_56px_rgba(28,54,141,0.22)] transition-transform duration-500 ease-in-out subpixel-antialiased ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.95rem] bg-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
              <Crown className="h-4.5 w-4.5 fill-white text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[1.32rem] font-black tracking-[-0.05em] text-white">{branding?.name?.replace(' OS', '').replace('OS', '') || 'NexusOne'}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3.5 py-5">
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

              <SidebarSection label="Operations">
                {operationsItems.map((item) => (
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
                title="Growth"
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

              <SidebarSection label="AI">
                {aiItems.map((item) => (
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

              <SidebarSection label="System">
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
              </SidebarSection>

              <CollapsibleSidebarSection
                label="Advanced"
                title="Advanced"
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
            </>
          )}
        </nav>

        <div className="mt-auto border-t border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.02)_0%,rgba(255,255,255,0.06)_100%)] px-5 py-5 text-white/75">
          <div className="mb-4 flex items-center justify-between text-[0.68rem] font-black uppercase tracking-[0.22em]">
            <span>NexusOne</span>
            <span>Live</span>
          </div>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-[1rem] border border-white/10 bg-white/10 px-4 py-3 text-left text-[0.72rem] font-black uppercase tracking-[0.18em] text-white transition-all hover:bg-white/14"
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
    <section className="space-y-2.5">
      <p className="px-4 text-[0.58rem] font-bold uppercase tracking-[0.26em] text-white/50">{props.label}</p>
      <div className="space-y-2">{props.children}</div>
    </section>
  );
}

function CollapsibleSidebarSection(props: { label: string; title: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <p className="px-4 text-[0.58rem] font-bold uppercase tracking-[0.26em] text-white/50">{props.label}</p>
      <button
        type="button"
        onClick={props.onToggle}
        className="flex w-full items-center justify-between rounded-[1rem] px-4 py-2 text-left text-[0.61rem] font-black uppercase tracking-[0.2em] text-white/68 transition-all hover:bg-white/7 hover:text-white"
      >
        <span>{props.title}</span>
        <ChevronDown size={14} className={`transition-transform ${props.isOpen ? 'rotate-180' : ''}`} />
      </button>
      {props.isOpen ? <div className="space-y-2">{props.children}</div> : null}
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
      className={`group relative flex w-full items-center justify-between rounded-[1.05rem] px-3.5 py-2.5 transition-all duration-300 ${
        isActive
          ? 'border border-white/12 bg-[linear-gradient(180deg,rgba(129,176,255,0.22),rgba(255,255,255,0.10))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_12px_24px_rgba(37,74,176,0.18)]'
          : 'text-white/84 hover:bg-white/7'
      }`}
    >
      <div className="flex items-center gap-2.5 overflow-hidden">
        <div className={`flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[0.85rem] ${isActive ? 'bg-white/14' : 'bg-transparent'}`}>
          <Icon size={16} className={isActive ? 'text-white' : 'text-white/82'} />
        </div>
        <span className="truncate text-[0.84rem] font-bold tracking-tight">
          {label}
        </span>
      </div>

      {badge !== undefined ? (
        <div className={`min-w-[1.3rem] rounded-full px-1.5 py-0.5 text-center text-[0.6rem] font-black ${isActive ? 'bg-white text-[#2C56C7]' : 'bg-white/14 text-white'}`}>
          {badge}
        </div>
      ) : null}
    </button>
  );
};

export default Sidebar;

