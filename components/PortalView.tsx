
import React, { useState, useMemo, useEffect } from 'react';
import { 
    CheckCircle, Clock, FileText, MessageSquare, ExternalLink, 
    Target, Wallet as WalletIcon, X, CreditCard, 
    Upload, RefreshCw, LayoutDashboard, 
    Layers, ArrowRight, ShieldCheck, Activity, BrainCircuit, AlertTriangle, Star,
    // Added Sparkles and Users to imports
    Mic, UserCheck, Zap, Search, Trophy, Hammer, Building2, LogOut, Sparkles, Users, DollarSign, Receipt
} from 'lucide-react';
import { Contact, AgencyBranding, Course } from '../types';
import DocumentVault from './DocumentVault';
import BusinessProfile from './BusinessProfile';
import OfferManager from './OfferManager';
import MessageCenter from './MessageCenter';
import SubscriptionManager from './SubscriptionManager';
import Tier2Strategy from './Tier2Strategy';
import InvestmentLab from './InvestmentLab';
import ReferralHub from './ReferralHub';
import NexusPulse from './NexusPulse';
import FundabilityDashboard from './FundabilityDashboard';
import CapitalAllocationSimulator from './CapitalAllocationSimulator';
import VoiceConcierge from './VoiceConcierge';
import IdentityVerification from './IdentityVerification';
import CreditRepairAI from './CreditRepairAI';
import OnboardingWizard from './OnboardingWizard';
import ClientInvoices from './ClientInvoices';
import ClientCardSuggestions from './ClientCardSuggestions';
import { supabase } from '../lib/supabaseClient';
import NotificationBell from './NotificationBell';
import ClientPortalDashboard from './ClientPortalDashboard';

interface PortalViewProps {
  contact: Contact;
  onUpdateContact: (contact: Contact) => void;
  branding: AgencyBranding;
  onLogout: () => void;
  isAdminPreview?: boolean;
  availableCourses?: Course[];
}

const PortalView: React.FC<PortalViewProps> = ({ contact, onUpdateContact, branding, onLogout, isAdminPreview = false }) => {
  const [activeTab, setActiveTab] = useState<'messages' | 'pulse' | 'tasks' | 'fundability' | 'simulator' | 'repair' | 'profile' | 'roadmap' | 'vault' | 'offers' | 'cards' | 'subscription' | 'settlement' | 'invest' | 'partner' | 'kyc'>('pulse');
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  
  const isFunded = contact.status === 'Closed' || (contact.fundedDeals && contact.fundedDeals.length > 0);
  const pendingInvoices = contact.invoices?.filter(i => i.status !== 'Paid').length || 0;

  const roadmapSteps = [
    { phase: 1, title: 'Genesis Audit', desc: 'Forensic credit and entity validation.', icon: <Search size={18}/>, status: contact.creditAnalysis ? 'complete' : 'active' },
    { phase: 2, title: '0% Catalyst', desc: 'Tier 1 business credit lines.', icon: <Zap size={18}/>, status: contact.offers?.length ? 'complete' : contact.creditAnalysis ? 'active' : 'locked' },
    { phase: 3, title: 'Reserve Seasoning', desc: 'Operating reserve build-up.', icon: <Clock size={18}/>, status: contact.fundedDeals?.length ? 'active' : 'locked' },
    { phase: 4, title: 'SBA Magnitude', desc: 'Institutional liquidity rounds.', icon: <Trophy size={18}/>, status: 'locked' }
  ];

  const sortedTabs = useMemo(() => {
    return [
        { id: 'pulse', label: 'Briefing', icon: <LayoutDashboard size={18}/> },
        { id: 'tasks', label: 'Tasks', icon: <CheckCircle size={18}/> },
        { id: 'fundability', label: 'Fundability', icon: <Target size={18}/> },
        { id: 'simulator', label: 'Simulator', icon: <WalletIcon size={18}/> },
        { id: 'roadmap', label: 'Roadmap', icon: <Zap size={18}/> },
        { id: 'messages', label: 'Concierge', icon: <MessageSquare size={18}/> },
        { id: 'subscription', label: 'Plan', icon: <Layers size={18}/> },
        { id: 'kyc', label: 'ID Link', icon: <UserCheck size={18}/> },
        { id: 'repair', label: 'Forensics', icon: <Hammer size={18}/> },
        { id: 'profile', label: 'Identity', icon: <ShieldCheck size={18}/> },
        { id: 'cards', label: 'Marketplace', icon: <CreditCard size={18}/> },
        { id: 'vault', label: 'Vault', icon: <FileText size={18}/> },
        { id: 'offers', label: 'Liquidity', icon: <DollarSign size={18}/> },
        { id: 'invest', label: 'Wealth', icon: <Sparkles size={18}/>, visible: isFunded },
        { id: 'partner', label: 'Referral', icon: <Users size={18}/> },
        { id: 'settlement', label: 'Ledger', icon: <Receipt size={18}/>, badge: pendingInvoices },
    ].filter(t => t.visible !== false);
  }, [isFunded, pendingInvoices]);

  const [profileState, setProfileState] = useState<'unknown' | 'has_profile' | 'missing_profile'>('unknown');

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        // Admin preview should not be blocked by client onboarding gates.
        if (isAdminPreview) {
          if (!cancelled) setProfileState('has_profile');
          return;
        }

        const { data, error } = await supabase
          .from('tenant_profiles')
          .select('tenant_id')
          .eq('tenant_id', contact.id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          // If RLS blocks or query fails, fail open to avoid hard-locking the portal.
          setProfileState('has_profile');
          return;
        }

        setProfileState(data?.tenant_id ? 'has_profile' : 'missing_profile');
      } catch {
        if (!cancelled) setProfileState('has_profile');
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [contact.id, isAdminPreview]);

  if (profileState === 'unknown') {
    return (
      <div className="min-h-screen bg-[#0B0C10] flex items-center justify-center">
        <div className="text-slate-400 text-xs font-black uppercase tracking-widest flex items-center gap-3">
          <RefreshCw className="animate-spin" size={16} /> Loading portal...
        </div>
      </div>
    );
  }

  if (profileState === 'missing_profile') {
    return <OnboardingWizard contact={contact} onComplete={onUpdateContact} />;
  }


  return (
    <div className="min-h-screen bg-[#0B0C10] flex flex-col pb-24 md:pb-10 font-sans text-slate-100 overflow-x-hidden">
       
       <div className="bg-[#0B0C10] text-white px-8 py-8 border-b border-white/5 sticky top-0 z-40 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto flex justify-between items-center gap-4">
            <div className="flex items-center gap-4 flex-1">
               <div className="bg-[#059669] p-3 rounded-xl shadow-lg shadow-[#059669]/20 transform rotate-3">
                  <Building2 size={22} className="text-slate-950" />
               </div>
               <div>
                  <span className="text-2xl font-black tracking-tighter uppercase leading-none block">
                     {branding?.name.split(' ')[0] || 'Nexus'}<span className="text-[#059669]">{branding?.name.split(' ')[1] || 'OS'}</span>
                  </span>
                  <div className="flex items-center gap-2 mt-1.5">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Institutional Portal</p>
                  </div>
               </div>
            </div>
            
            <div className="flex items-center gap-4">
                <button onClick={() => setIsVoiceOpen(true)} className="flex items-center gap-2 bg-[#059669]/10 text-[#059669] px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#059669]/20 hover:bg-[#059669]/20 transition-all active:scale-95 group/voice">
                    <Mic size={16} className="group-hover:animate-pulse" /><span className="hidden md:inline">Advisor Live</span>
                </button>
                <NotificationBell />
                <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center font-black text-[#059669] shadow-xl">{contact.name[0]}</div>
                <button onClick={onLogout} className="p-2.5 text-slate-500 hover:text-red-400 transition-colors"><LogOut size={18}/></button>
            </div>
          </div>
       </div>

       <div className="max-w-7xl mx-auto w-full px-4 -mt-4 z-30 relative">
          <div className="bg-[#1F2833]/40 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-1.5 shadow-2xl flex overflow-x-auto no-scrollbar gap-1.5 snap-x">
             {sortedTabs.map(tab => (
               <button 
                  key={tab.id} 
                  onClick={() => setActiveTab(tab.id as any)} 
                  className={`py-3.5 px-6 rounded-[1.8rem] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap snap-center relative border border-transparent ${activeTab === tab.id ? 'bg-[#059669] text-slate-950 shadow-xl shadow-[#059669]/20' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
               >
                 {tab.icon} {tab.label}
                 {tab.badge ? <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-[8px] rounded-full flex items-center justify-center border-2 border-slate-900 shadow-lg">{tab.badge}</span> : null}
               </button>
             ))}
          </div>
       </div>

       <div className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-8 pt-10 pb-20 overflow-x-hidden relative">
          {activeTab === 'messages' && <div className="h-[80vh]"><MessageCenter contact={contact} onUpdateContact={onUpdateContact} currentUserRole="client" /></div>}
          {activeTab === 'pulse' && <NexusPulse contact={contact} onOpenVoice={() => setIsVoiceOpen(true)} onUpdateContact={onUpdateContact} />}
          {activeTab === 'tasks' && <ClientPortalDashboard contact={contact} onUpdateContact={onUpdateContact} />}
          {activeTab === 'fundability' && <FundabilityDashboard contact={contact} />}
          {activeTab === 'simulator' && <CapitalAllocationSimulator contact={contact} />}
          {activeTab === 'roadmap' && (
              <div className="max-w-4xl mx-auto space-y-12 animate-fade-in py-10">
                  <div className="text-center">
                    <h2 className="text-4xl font-black uppercase tracking-tighter text-white mb-4">Protocol Maturity</h2>
                    <p className="text-slate-400 max-w-xl mx-auto font-medium">Your shortest path to institutional liquidity.</p>
                  </div>
                  <div className="space-y-6">
                      {roadmapSteps.map((step) => (
                          <div key={step.phase} className={`bg-[#1F2833]/20 backdrop-blur-xl p-8 rounded-[2.5rem] border-2 flex items-center gap-8 transition-all relative overflow-hidden ${step.status === 'active' ? 'border-[#059669] shadow-2xl scale-[1.02]' : step.status === 'complete' ? 'border-[#059669]/20 opacity-80' : 'border-white/5 opacity-40 grayscale'}`}>
                              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl shadow-xl transform rotate-3 ${step.status === 'complete' ? 'bg-[#059669] text-slate-950' : step.status === 'active' ? 'bg-blue-600 text-white animate-pulse' : 'bg-slate-800 text-slate-500'}`}>
                                  {step.status === 'complete' ? <CheckCircle size={32}/> : step.icon}
                              </div>
                              <div className="flex-1">
                                  <h3 className="text-2xl font-black text-white uppercase tracking-tight">{step.title}</h3>
                                  <p className="text-sm text-slate-400 font-medium leading-relaxed">{step.desc}</p>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}
          {activeTab === 'repair' && <CreditRepairAI contact={contact} onUpdateContact={onUpdateContact} />}
          {activeTab === 'kyc' && <IdentityVerification contact={contact} onUpdateContact={onUpdateContact} />}
          {activeTab === 'vault' && <DocumentVault contact={contact} onUpdateContact={onUpdateContact} readOnly={true} />}
          {activeTab === 'profile' && <BusinessProfile contact={contact} onUpdateContact={onUpdateContact} />}
          {activeTab === 'offers' && <OfferManager contact={contact} onUpdateContact={onUpdateContact} />}
          {activeTab === 'cards' && <ClientCardSuggestions contact={contact} />}
          {activeTab === 'subscription' && <SubscriptionManager contact={contact} onUpdateContact={onUpdateContact} branding={branding} />}
          {activeTab === 'settlement' && <ClientInvoices contact={contact} onUpdateContact={onUpdateContact} />}
          {activeTab === 'invest' && <InvestmentLab contact={contact} onUpdateContact={onUpdateContact} />}
          {activeTab === 'partner' && <ReferralHub contact={contact} />}
       </div>
       
       <VoiceConcierge isOpen={isVoiceOpen} onClose={() => setIsVoiceOpen(false)} context={{ name: contact.name, company: contact.company, bankability: contact.aiScore || 65 }} />
    </div>
  );
};


export default PortalView;
