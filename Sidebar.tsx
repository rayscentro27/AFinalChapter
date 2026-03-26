
import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  FileText,
  Gift,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { ViewMode, AgencyBranding, Contact } from './types';

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  pendingDocCount?: number; 
  onLogout: () => void | Promise<void>;
  branding?: AgencyBranding;
  contacts?: Contact[];
  onOpenVoiceAssistant?: () => void;
  userRole?: 'admin' | 'supervisor' | 'salesperson' | 'client' | 'partner' | 'sales';
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

  const handleNav = (view: ViewMode) => {
    window.location.hash = view.toLowerCase();
    setIsMobileOpen(false);
  };

  const derivedPendingDocCount = pendingDocCount || contacts.flatMap(c => c.documents || []).filter(d => d.status === 'Pending Review').length || 0;

  const navItems = useMemo(() => {
    if (userRole === 'client') {
      return [
        { view: ViewMode.PORTAL, label: 'Home', icon: Home },
        { view: ViewMode.PORTAL_CREDIT, label: 'Credit Scores', icon: ShieldCheck },
        { view: ViewMode.PORTAL_FUNDING, label: 'Funding Options', icon: WalletCards },
        { view: ViewMode.PORTAL_BUSINESS, label: 'Business Setup', icon: Building2 },
        { view: ViewMode.PORTAL_GRANTS, label: 'Grants Discovery', icon: Gift },
        { view: ViewMode.COMMUNICATION_PREFERENCES, label: 'Support', icon: Sparkles },
        { view: ViewMode.KNOWLEDGE_HUB, label: 'NexusOne Labs', icon: Search },
      ];
    }

    return [
      { view: ViewMode.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
      { view: ViewMode.CRM, label: 'Clients', icon: Users, badge: contacts.length || 392 },
      { view: ViewMode.FUNDING_FLOW, label: 'Funding Applications', icon: BriefcaseBusiness },
      { view: ViewMode.ADMIN_REVIEW_ANALYTICS, label: 'Credit Optimization', icon: ShieldCheck },
      { view: ViewMode.ADMIN_SBA, label: 'Business Builder', icon: Building2 },
      { view: ViewMode.GRANTS, label: 'Grants & Opportunities', icon: Gift },
      { view: ViewMode.RESEARCH_DASHBOARD, label: 'Analytics', icon: BarChart3 },
      { view: ViewMode.DOCUMENTS, label: 'Document Vault', icon: FileText, badge: derivedPendingDocCount || undefined },
      { view: ViewMode.ADMIN_SUPER_ADMIN_COMMAND_CENTER, label: 'AI Workforce', icon: Sparkles },
      { view: ViewMode.SETTINGS, label: 'Settings', icon: Settings },
    ];
  }, [contacts.length, derivedPendingDocCount, userRole]);

  return (
    <>
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="fixed left-4 top-4 z-[60] rounded-xl border border-[#D8E6FF] bg-white p-2.5 text-[#3A66D3] shadow-lg transition-all active:scale-95 md:hidden"
      >
        {isMobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <div className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col overflow-hidden border-r border-[#A8C7FF]/20 bg-[linear-gradient(180deg,#2E57C9_0%,#345FD5_36%,#27469E_100%)] text-white shadow-[0_18px_60px_rgba(28,54,141,0.28)] transition-transform duration-500 ease-in-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
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

        <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {navItems.map((item) => (
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
