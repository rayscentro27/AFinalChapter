
import React, { useState } from 'react';
import { 
  LayoutDashboard, Users, Globe, Settings, LogOut, Hexagon, 
  Inbox, Calendar, Zap, Mic, Phone, Search, Megaphone, 
  Store, Shield, ShieldCheck, TrendingUp, Scale, Briefcase, 
  FileText, Fingerprint, Brain, Cpu, List, Box, ShieldAlert,
  ChevronRight, Facebook, Instagram, Linkedin, MessageCircle, 
  Music, Menu, X, AlertCircle, BrainCircuit, Smartphone, FlaskConical
} from 'lucide-react';
import { ViewMode, AgencyBranding, Contact } from '../types';

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  pendingDocCount?: number; 
  onLogout: () => void | Promise<void>;
  branding?: AgencyBranding;
  contacts?: Contact[];
  onOpenVoiceAssistant?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onViewChange, 
  pendingDocCount = 0, 
  onLogout, 
  branding,
  contacts = [],
  onOpenVoiceAssistant
}) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleNav = (view: ViewMode) => {
    window.location.hash = view.toLowerCase();
    setIsMobileOpen(false);
  };

  // Institutional Emerald
  const emerald = "#059669";

  // Consolidate unread and triage metrics
  const derivedPendingDocCount = pendingDocCount || contacts.flatMap(c => c.documents || []).filter(d => d.status === 'Pending Review').length || 0;
  const triageCount = contacts.filter(c => c.status === 'Triage' || c.automationMetadata?.sentiment === 'Critical').length;

  // Social Bridge logic for footer
  const corePlatforms = ['facebook', 'instagram', 'linkedin'];
  const socialStates = branding?.socialConnections || [];
  const connectedSocials = socialStates.filter(s => corePlatforms.includes(s.platform.toLowerCase()) && s.connected);
  const disconnectedCount = corePlatforms.filter(p => !socialStates.find(s => s.platform.toLowerCase() === p && s.connected)).length;

  const getSocialIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'facebook': return <Facebook size={14} />;
      case 'instagram': return <Instagram size={14} />;
      case 'linkedin': return <Linkedin size={14} />;
      default: return null;
    }
  };

  return (
    <>
      {/* Mobile Toggle */}
      <button 
        onClick={() => setIsMobileOpen(!isMobileOpen)} 
        className="md:hidden fixed top-4 left-4 z-[60] p-2.5 bg-slate-950 text-white rounded-xl shadow-lg border border-white/10 hover:bg-slate-900 transition-all active:scale-95"
      >
        {isMobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Sidebar Container */}
      <div className={`fixed top-0 left-0 h-screen w-64 bg-[#0B0C10] text-white flex flex-col shadow-2xl z-50 transition-transform duration-500 ease-in-out border-r border-white/5 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        
        {/* Header Section */}
        <div className="p-8 flex items-center gap-4 bg-[#0B0C10] relative overflow-hidden flex-shrink-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#059669]/5 blur-3xl pointer-events-none rounded-full"></div>
          <div className="bg-[#059669] p-2.5 rounded-2xl shadow-2xl shadow-[#059669]/20 transform -rotate-3 transition-transform hover:rotate-0">
            <Hexagon className="text-slate-950 fill-slate-950/10" size={24} />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-black tracking-tighter uppercase leading-none text-white">
              {branding?.name.split(' ')[0] || 'Nexus'}<span className="text-[#059669]">{branding?.name.split(' ')[1] || 'OS'}</span>
            </span>
            <div className="flex items-center gap-1.5 mt-1.5">
               <div className="w-1 h-1 rounded-full bg-[#059669] animate-pulse"></div>
               <span className="text-[8px] text-slate-500 font-black uppercase tracking-[0.2em]">Institutional HUD v2.5</span>
            </div>
          </div>
        </div>

        {/* Scrollable Nav Area */}
        <nav className="flex-1 py-4 px-4 space-y-8 overflow-y-auto custom-scrollbar scroll-smooth">
          
          <SidebarSection label="Strategic Ops">
            <SidebarItem id={ViewMode.DASHBOARD} label="Executive Desk" icon={LayoutDashboard} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.STRATEGY_SANDBOX} label="War Room" icon={Box} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.INBOX} label="Unified Inbox" icon={Inbox} currentView={currentView} onViewChange={handleNav} badge={3} />
            <SidebarItem id={ViewMode.SUPERVISOR_TRIAGE} label="Triage Hub" icon={ShieldAlert} currentView={currentView} onViewChange={handleNav} badge={triageCount || undefined} badgeColor="bg-red-600" />
            <SidebarItem id={ViewMode.CALENDAR} label="Smart Calendar" icon={Calendar} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.AUTOMATION} label="Sentinel Engine" icon={Zap} currentView={currentView} onViewChange={handleNav} />
          </SidebarSection>

          <SidebarSection label="Acquisition">
            <SidebarItem id={ViewMode.LEAD_SCOUT} label="Neural Scout" icon={Search} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.CRM} label="Pipeline Matrix" icon={Users} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.POWER_DIALER} label="Power Dialer" icon={Phone} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.SALES_TRAINER} label="Combat Coach" icon={BrainCircuit} currentView={currentView} onViewChange={handleNav} />
            {/* Added Smartphone icon to resolved error */}
            <SidebarItem id={ViewMode.MESSAGING_BRIDGE} label="Mobile Bridge" icon={Smartphone} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.MARKETING} label="Content Factory" icon={Megaphone} currentView={currentView} onViewChange={handleNav} />
          </SidebarSection>

          <SidebarSection label="Capital Lab">
            <SidebarItem id={ViewMode.PARTNER_MARKETPLACE} label="Tool Vault" icon={Store} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.FORENSIC_HUB} label="Forensic Hub" icon={ShieldCheck} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.WEALTH_MANAGER} label="Wealth Alpha" icon={TrendingUp} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.LENDER_ROOM} label="Lender Room" icon={Scale} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.DOC_GENERATOR} label="Doc Draftsman" icon={FileText} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.REVIEW_QUEUE} label="Review Queue" icon={Fingerprint} currentView={currentView} onViewChange={handleNav} badge={derivedPendingDocCount || undefined} badgeColor="bg-amber-600" />
          </SidebarSection>

          <SidebarSection label="Infrastructure">
            <SidebarItem id={ViewMode.KNOWLEDGE_HUB} label="Neural Training" icon={Brain} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.SCENARIO_RUNNER} label="Scenario Runner" icon={FlaskConical} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.INFRA_MONITOR} label="Engine Room" icon={Cpu} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.SITEMAP} label="Core Sitemap" icon={List} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.CHANNEL_MAPPER} label="Channel Mapper" icon={MessageCircle} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.CONTACT_MERGE} label="Contact Merge" icon={Users} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.MERGE_JOBS} label="Merge Jobs" icon={List} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.MERGE_QUEUE} label="Merge Queue" icon={List} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.TEAM_MEMBERS} label="Team Members" icon={Users} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.ON_CALL} label="On-Call" icon={Calendar} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.CHANNEL_POOLS} label="Channel Pools" icon={Briefcase} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.DEAD_LETTERS} label="Dead Letters" icon={AlertCircle} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.ADMIN_HEALTH} label="Gateway Health" icon={Shield} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.SRE_DASHBOARD} label="SRE Dashboard" icon={Cpu} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.OUTBOX} label="Outbox" icon={Inbox} currentView={currentView} onViewChange={handleNav} />
            <SidebarItem id={ViewMode.SETTINGS} label="OS Settings" icon={Settings} currentView={currentView} onViewChange={handleNav} />
          </SidebarSection>
        </nav>
        
        {/* Sidebar Footer / Vitals */}
        <div className="p-6 border-t border-white/5 bg-[#0B0C10]/80 backdrop-blur-xl space-y-6">
          
          {/* Social Bridge Mini-HUD */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Neural Bridge</span>
              <span className={`text-[8px] font-black uppercase ${disconnectedCount > 0 ? 'text-amber-500' : 'text-[#059669]'}`}>
                {3 - disconnectedCount}/3 Sync
              </span>
            </div>
            <div className="flex items-center gap-2">
              {corePlatforms.map((p) => {
                const isConnected = socialStates.find(s => s.platform.toLowerCase() === p && s.connected);
                return (
                  <div 
                    key={p} 
                    className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
                      isConnected ? 'bg-[#059669]/10 border-[#059669]/30 text-[#059669]' : 'bg-white/5 border-white/5 text-slate-600 grayscale'
                    }`}
                  >
                    {getSocialIcon(p)}
                  </div>
                );
              })}
              {disconnectedCount > 0 && (
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center animate-pulse">
                  <AlertCircle size={14} />
                </div>
              )}
            </div>
          </div>

          {/* Operational Progress */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest">
              <span className="text-slate-500">Neural Load</span>
              <span className="text-[#059669]">Stable</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
              <div className="h-full bg-[#059669] w-1/3 shadow-[0_0_10px_rgba(5,150,105,0.4)]"></div>
            </div>
          </div>

          {/* Logout Action */}
          <button 
            onClick={onLogout} 
            className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:text-red-500 transition-all w-full rounded-xl hover:bg-red-500/5 font-black text-[10px] uppercase tracking-widest group border border-transparent hover:border-red-500/20"
          >
            <LogOut size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Terminate Session</span>
          </button>
        </div>
      </div>
      
      {/* Overlay for mobile */}
      {isMobileOpen && <div className="fixed inset-0 z-40 bg-slate-950/60 md:hidden backdrop-blur-sm transition-all" onClick={() => setIsMobileOpen(false)}></div>}
    </>
  );
};

const SidebarSection: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <section className="space-y-1.5">
    <div className="px-3 mb-2 flex items-center justify-between">
      <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.25em]">{label}</span>
      <div className="h-px bg-white/5 flex-1 ml-4 opacity-50"></div>
    </div>
    {children}
  </section>
);

interface SidebarItemProps {
  id: ViewMode;
  label: string;
  icon: React.ElementType;
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  badge?: number;
  badgeColor?: string;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ id, label, icon: Icon, currentView, onViewChange, badge, badgeColor = 'bg-blue-600' }) => {
  const isActive = currentView === id;

  return (
    <button 
      onClick={() => onViewChange(id)}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-300 group relative ${
        isActive 
          ? 'bg-[#059669]/10 text-[#059669] border border-[#059669]/20 shadow-[inset_0_0_15px_rgba(5,150,105,0.05)]' 
          : 'text-slate-50 hover:bg-white/5 hover:text-slate-200 border border-transparent'
      }`}
    >
      {/* Active Indicator Bar */}
      {isActive && <div className="absolute left-0 top-2.5 bottom-2.5 w-0.5 bg-[#059669] rounded-full shadow-[0_0_10px_#059669]"></div>}

      <div className="flex items-center gap-3 overflow-hidden">
        <div className={`flex-shrink-0 transition-all duration-500 ${isActive ? 'scale-110 rotate-0' : 'group-hover:scale-110 group-hover:-rotate-3'}`}>
          <Icon 
            size={18}
            strokeWidth={isActive ? 2.5 : 2}
            className={isActive ? 'text-[#059669] drop-shadow-[0_0_5px_rgba(5,150,105,0.5)]' : 'text-slate-600 group-hover:text-slate-300 transition-colors'} 
          />
        </div>
        <span className={`font-black text-[10px] uppercase tracking-wider truncate transition-all duration-300 ${isActive ? 'translate-x-1' : 'translate-x-0'}`}>
          {label}
        </span>
      </div>

      {badge !== undefined ? (
        <div className={`px-1.5 py-0.5 rounded-md text-[9px] font-black min-w-[1.25rem] text-center shadow-lg ${isActive ? 'bg-[#059669] text-slate-950' : `${badgeColor} text-white`}`}>
          {badge}
        </div>
      ) : (
        <ChevronRight size={12} className={`opacity-0 -translate-x-2 transition-all group-hover:opacity-40 group-hover:translate-x-0 ${isActive ? 'text-[#059669]' : 'text-slate-700'}`} />
      )}
    </button>
  );
};

export default Sidebar;
