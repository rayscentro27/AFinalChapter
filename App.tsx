
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CRMTable from './components/CRMTable';
import PortalView from './components/PortalView';
import AdminResources from './components/AdminResources';
import SignUp from './components/SignUp';
import Settings from './components/Settings';
import AICommandCenter from './components/AICommandCenter';
import DocumentQueue from './components/DocumentQueue';
import MarketingCampaigns from './components/MarketingCampaigns';
import NeuralFloor from './components/NeuralFloor';
import Login from './components/Login';
import ClientLandingPage from './components/ClientLandingPage';
import UnifiedInbox from './components/UnifiedInbox';
import PowerDialer from './components/PowerDialer';
import SalesTrainer from './components/SalesTrainer';
import VoiceReceptionist from './components/VoiceReceptionist';
import LeadDiscoveryMap from './components/LeadDiscoveryMap';
import FormBuilder from './components/FormBuilder';
import MarketIntelligence from './components/MarketIntelligence';
import LenderMarketplace from './components/LenderMarketplace';
import DocumentGenerator from './components/DocumentGenerator';
import RenewalTracker from './components/RenewalTracker';
import SmartCalendar from './components/SmartCalendar';
import WorkflowAutomation from './components/WorkflowAutomation';
import SyndicationManager from './components/SyndicationManager';
import ApplicationSubmitter from './components/ApplicationSubmitter';
import CommandPalette from './components/CommandPalette';
import MobileNav from './components/MobileNav';
import ReputationManager from './components/ReputationManager';
import PGFundingFlow from './components/PGFundingFlow';
import ExpenseTracker from './components/ExpenseTracker';
import CommissionManager from './components/CommissionManager';
import RiskMonitor from './components/RiskMonitor';
import SalesLeaderboard from './components/SalesLeaderboard';
import GrantManager from './components/GrantManager';
import CourseBuilder from './components/CourseBuilder';
import LoanServicing from './components/LoanServicing';
import CreditMemoBuilder from './components/CreditMemoBuilder';
import AdminCMS from './components/AdminCMS';
import SystemSitemap from './components/SystemSitemap';
import AdminSetupWizard from './components/AdminSetupWizard';
import NotificationCenter from './components/NotificationCenter';
import PhoneNotification from './components/PhoneNotification';
import LiveAutomationMonitor from './components/LiveAutomationMonitor';
import InvoicingHub from './components/InvoicingHub';
import StaffTraining from './components/StaffTraining';
import CreditCardMatcher from './components/CreditCardMatcher';
import WealthPortfolio from './components/WealthPortfolio';
import SalesOnboarding from './components/SalesOnboarding';
import VoiceAssistant from './components/VoiceAssistant';
import InfraMonitor from './components/InfraMonitor';
import LeadScout from './components/LeadScout';
import LenderRoom from './components/LenderRoom';
import KnowledgeHub from './components/KnowledgeHub';
import ScenarioRunner from './components/ScenarioRunner';
import YouTubeVideoAnalyzer from './components/YouTubeVideoAnalyzer';
import AffiliateMarketplace from './components/AffiliateMarketplace';
import ForensicHub from './components/ForensicHub';
import MessagingBridge from './components/MessagingBridge';
import AdminChannelMapper from './src/pages/AdminChannelMapper';
import AdminContactsMerge from './src/pages/AdminContactsMerge';
import AdminMergeJobs from './src/pages/AdminMergeJobs';
import AdminMergeQueue from './src/pages/AdminMergeQueue';
import AdminSuggestions from './src/pages/AdminSuggestions';
import AdminTeamMembers from './src/pages/AdminTeamMembers';
import AdminOnCall from './src/pages/AdminOnCall';
import AdminChannelPools from './src/pages/AdminChannelPools';
import AdminDeadLetters from './src/pages/AdminDeadLetters';
import AdminOutbox from './src/pages/AdminOutbox';
import AdminMonitoring from './src/pages/AdminMonitoring';
import AdminSRE from './src/pages/AdminSRE';
import AdminChannelHealth from './src/pages/AdminChannelHealth';
import AdminPublicApi from './src/pages/AdminPublicApi';
import AdminRoles from './src/pages/AdminRoles';
import AdminMembers from './src/pages/AdminMembers';
import AdminPolicies from './src/pages/AdminPolicies';
import InviteAccept from './src/pages/InviteAccept';
import SupervisorTriage from './components/SupervisorTriage';
import AgenticHUD from './components/AgenticHUD';
import NeuralStrategySandbox from './components/NeuralStrategySandbox';
import UserHeader from './components/UserHeader';
import { ViewMode, Contact, AgencyBranding, Course, Notification, ClientTask } from './types';
// Added RefreshCw to imports
import { Search, Bell, Zap, Command, Info, X, CreditCard, ShieldAlert, RefreshCw } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import { data } from './adapters';
import { BACKEND_CONFIG } from './adapters/config';
import { processAutomations } from './services/automationEngine';
import { runBackgroundProtocols } from './services/neuralEscalator';
import * as geminiService from './services/geminiService';
import * as costService from './services/costService';

const PATH_TO_VIEW: Record<string, ViewMode> = {
  '/admin/contacts/merge': ViewMode.CONTACT_MERGE,
  '/admin/merge-jobs': ViewMode.MERGE_JOBS,
  '/admin/merge-queue': ViewMode.MERGE_QUEUE,
  '/admin/suggestions': ViewMode.SUGGESTIONS,
  '/admin/health': ViewMode.ADMIN_HEALTH,
  '/admin/monitoring': ViewMode.ADMIN_HEALTH,
  '/admin/sre': ViewMode.SRE_DASHBOARD,
  '/admin/channel-health': ViewMode.CHANNEL_HEALTH,
  '/admin/outbox': ViewMode.OUTBOX,
  '/admin/public-api': ViewMode.PUBLIC_API,
  '/admin/roles': ViewMode.ADMIN_ROLES,
  '/admin/members': ViewMode.ADMIN_MEMBERS,
  '/admin/policies': ViewMode.ADMIN_POLICIES,
  '/invite-accept': ViewMode.INVITE_ACCEPT,
};

function normalizePathname(pathname: string): string {
  const raw = String(pathname || '/').trim().toLowerCase();
  if (raw === '/') return '/';
  return raw.replace(/\/+$/, '');
}

export const App = () => {
  const { user, loading, signOut } = useAuth();
  const [currentView, setCurrentView] = useState<ViewMode>(ViewMode.CLIENT_LANDING);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [branding, setBranding] = useState<AgencyBranding>({ 
    name: 'Nexus OS', 
    primaryColor: '#66FCF1' 
  });
  const [courses, setCourses] = useState<Course[]>([]);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isGlobalVoiceOpen, setIsGlobalVoiceOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [automationToast, setAutomationToast] = useState<{show: boolean, msg: string, type: 'success' | 'error' | 'info'}>({show: false, msg: '', type: 'info'});

  const [isSystemReady, setIsSystemReady] = useState(false);

  useEffect(() => {
    const initData = async () => {
      const [c, b] = await Promise.all([data.getContacts(), data.getBranding()]);
      setContacts(c || []);
      if (b) {
        setBranding(b);
        const isSetupRequired = b.name === 'Nexus OS' && (!c || c.length === 0);
        setIsSystemReady(!isSetupRequired);
      }
    };
    initData();
  }, []);

  useEffect(() => {
    const runAutomations = async () => {
        if (!isSystemReady || contacts.length === 0) return;
        
        const idx = Math.floor(Math.random() * contacts.length);
        const contact = contacts[idx];
        const res = await processAutomations(contact, contacts);
        
        if (res.alertType === 'sentiment_triage') {
            setAutomationToast({ 
                show: true, 
                msg: `TRIAGE: ${contact.company} showing friction.`, 
                type: 'error' 
            });
        }

        if (res.alertType === 'high_ticket') {
            setAutomationToast({ 
                show: true, 
                msg: `SENTINEL: High-magnitude deal detected!`, 
                type: 'success' 
            });
        }

        if (res.triggeredActions.length > 0) {
            setContacts(prev => prev.map(c => c.id === res.updatedContact.id ? res.updatedContact : c));
        }
    };

    const interval = setInterval(runAutomations, 20000); 
    return () => clearInterval(interval);
  }, [isSystemReady, contacts.length]);

  useEffect(() => {
    if (loading) return;
    const handleRouting = () => {
      const normalizedPath = normalizePathname(window.location.pathname);
      const mappedView = PATH_TO_VIEW[normalizedPath];
      if (!window.location.hash && mappedView) {
        window.location.hash = mappedView.toLowerCase();
        return;
      }

      const hash = window.location.hash.replace('#', '').toUpperCase() as ViewMode;
      const isValidView = Object.values(ViewMode).includes(hash);

      if (!user) {
        if (isValidView) setCurrentView(hash);
        else setCurrentView(ViewMode.CLIENT_LANDING);
        return;
      }

      if (user.role === 'client') {
        if (hash !== ViewMode.PORTAL && hash !== ViewMode.PARTNER_MARKETPLACE) {
          window.location.hash = 'portal';
        } else {
          setCurrentView(hash);
        }
      } else {
        if (isValidView) {
          if ([ViewMode.CLIENT_LANDING, ViewMode.LOGIN, ViewMode.SIGNUP].includes(hash)) {
            window.location.hash = (user.role === 'admin' || user.role === 'supervisor' || user.role === 'sales') ? 'dashboard' : 'training';
          } else {
            setCurrentView(hash);
          }
        } else {
          window.location.hash = (user.role === 'admin' || user.role === 'supervisor' || user.role === 'sales') ? 'dashboard' : 'training';
        }
      }
    };
    window.addEventListener('hashchange', handleRouting);
    handleRouting();
    return () => window.removeEventListener('hashchange', handleRouting);
  }, [user, loading]);

  const updateContact = async (updatedContact: Contact) => {
    const saved = await data.updateContact(updatedContact);
    setContacts(prev => prev.map(c => c.id === saved.id ? saved : c));
  };

  const addContact = async (newContact: Partial<Contact>) => {
    const saved = await data.addContact(newContact);
    setContacts(prev => [saved, ...prev]);
  };

  const updateBranding = async (newBranding: AgencyBranding) => {
    const saved = await data.updateBranding(newBranding);
    setBranding(saved);
  };

  const navigate = (view: ViewMode) => {
    window.location.hash = view.toLowerCase();
  };

  const showNavigation = user && user.role !== 'client' && ![ViewMode.CLIENT_LANDING, ViewMode.LOGIN, ViewMode.SIGNUP, ViewMode.ONBOARDING].includes(currentView) && isSystemReady;

  const renderContent = () => {
    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950"><RefreshCw className="animate-spin text-blue-500" /></div>;

    if (!user) {
        if (currentView === ViewMode.SIGNUP) return <SignUp onRegister={addContact} onNavigate={navigate} />;
        if (currentView === ViewMode.LOGIN) return <Login onLogin={() => {}} onBack={() => navigate(ViewMode.CLIENT_LANDING)} />;
        return <ClientLandingPage onNavigate={navigate} />;
    }

    if (user.role === 'client' || currentView === ViewMode.PORTAL) {
      let myContact = contacts.find(c => c.email.toLowerCase() === user.email.toLowerCase());
      if (!myContact && contacts.length > 0) myContact = contacts[0];
      const skeletonContact: Contact = {
        id: 'new', name: user.name || 'New Client', email: user.email, phone: '', company: 'New Business', status: 'Lead', lastContact: 'Just now', value: 0, source: 'Registration', notes: 'Setup in progress.', checklist: {}, clientTasks: []
      };
      return <PortalView contact={myContact || skeletonContact} branding={branding} onLogout={signOut} onUpdateContact={updateContact} availableCourses={courses} />;
    }

    if (!isSystemReady && user.role === 'admin') {
      return <AdminSetupWizard onNavigate={navigate} branding={branding} onUpdateBranding={updateBranding} />;
    }

    return (
        <div key={currentView} className="animate-spatial h-full">
            {(() => {
                switch (currentView) {
                    case ViewMode.DASHBOARD: return <Dashboard contacts={contacts} onFocusContact={(c) => { updateContact(c); navigate(ViewMode.CRM); }} />;
                    case ViewMode.CRM: return <CRMTable contacts={contacts} onUpdateContact={updateContact} onAddContact={addContact} />;
                    case ViewMode.INBOX: return <UnifiedInbox contacts={contacts} onUpdateContact={updateContact} />;
                    case ViewMode.SETTINGS: return <Settings branding={branding} onUpdateBranding={updateBranding} onNavigate={navigate} />;
                    case ViewMode.MARKETING: return <MarketingCampaigns contacts={contacts} branding={branding} onUpdateBranding={updateBranding} />;
                    case ViewMode.NEURAL_FLOOR: return <NeuralFloor contacts={contacts} onUpdateContacts={setContacts} />;
                    case ViewMode.POWER_DIALER: return <PowerDialer queue={contacts} onUpdateContact={updateContact} onClose={() => navigate(ViewMode.CRM)} />;
                    case ViewMode.LENDERS: return <LenderMarketplace />;
                    case ViewMode.DOC_GENERATOR: return <DocumentGenerator contacts={contacts} onUpdateContact={updateContact} />;
                    case ViewMode.REVIEW_QUEUE: return <DocumentQueue contacts={contacts} onUpdateContact={updateContact} />;
                    case ViewMode.SITEMAP: return <SystemSitemap onNavigate={navigate} />;
                    case ViewMode.EXPENSES: return <ExpenseTracker />;
                    case ViewMode.COMMISSIONS: return <CommissionManager contacts={contacts} />;
                    case ViewMode.RISK_MONITOR: return <RiskMonitor />;
                    case ViewMode.FUNDING_FLOW: return <PGFundingFlow />;
                    case ViewMode.AUTOMATION: return <LiveAutomationMonitor />;
                    case ViewMode.INVOICING: return <InvoicingHub contacts={contacts} onUpdateContact={updateContact} />;
                    case ViewMode.REPUTATION: return <ReputationManager branding={branding} onUpdateBranding={updateBranding} />;
                    case ViewMode.WEALTH_MANAGER: return <WealthPortfolio contacts={contacts} onUpdateContact={updateContact} />;
                    case ViewMode.INFRA_MONITOR: return <InfraMonitor />;
                    case ViewMode.LEAD_SCOUT: return <LeadScout onAddLead={addContact} />;
                    case ViewMode.LENDER_ROOM: return <LenderRoom contacts={contacts} />;
                    case ViewMode.KNOWLEDGE_HUB: return <KnowledgeHub />;
                    case ViewMode.SCENARIO_RUNNER: return <ScenarioRunner />;
                    case ViewMode.PARTNER_MARKETPLACE: return <AffiliateMarketplace />;
                    case ViewMode.FORENSIC_HUB: return <ForensicHub contacts={contacts} onUpdateContact={updateContact} />;
                    case ViewMode.SUPERVISOR_TRIAGE: return <SupervisorTriage contacts={contacts} onUpdateContact={updateContact} />;
                    case ViewMode.STRATEGY_SANDBOX: return <NeuralStrategySandbox contacts={contacts} />;
                    case ViewMode.CHANNEL_MAPPER: return <AdminChannelMapper />;
                    case ViewMode.CONTACT_MERGE: return <AdminContactsMerge />;
                    case ViewMode.MERGE_JOBS: return <AdminMergeJobs />;
                    case ViewMode.MERGE_QUEUE: return <AdminMergeQueue />;
                    case ViewMode.SUGGESTIONS: return <AdminSuggestions />;
                    case ViewMode.TEAM_MEMBERS: return <AdminTeamMembers />;
                    case ViewMode.ON_CALL: return <AdminOnCall />;
                    case ViewMode.CHANNEL_POOLS: return <AdminChannelPools />;
                    case ViewMode.DEAD_LETTERS: return <AdminDeadLetters />;
                    case ViewMode.CHANNEL_HEALTH: return <AdminChannelHealth />;
                    case ViewMode.ADMIN_HEALTH: return <AdminMonitoring />;
                    case ViewMode.SRE_DASHBOARD: return <AdminSRE />;
                    case ViewMode.OUTBOX: return <AdminOutbox />;
                    case ViewMode.PUBLIC_API: return <AdminPublicApi />;
                    case ViewMode.ADMIN_ROLES: return <AdminRoles />;
                    case ViewMode.ADMIN_MEMBERS: return <AdminMembers />;
                    case ViewMode.ADMIN_POLICIES: return <AdminPolicies />;
                    case ViewMode.INVITE_ACCEPT: return <InviteAccept />;
                    default: return <Dashboard contacts={contacts} />;
                }
            })()}
        </div>
    );
  };

  const unreadNotifCount = notifications.filter(n => !n.read).length;

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      {showNavigation && (
          <Sidebar 
            currentView={currentView} 
            onViewChange={navigate} 
            onLogout={signOut} 
            branding={branding} 
            contacts={contacts} 
            onOpenVoiceAssistant={() => setIsGlobalVoiceOpen(true)}
          />
      )}
      <main className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-500 ${showNavigation ? 'md:ml-64 bg-slate-900 border-l border-white/5' : ''}`}>
        {showNavigation && (
          <header className="h-16 bg-[#0B0C10] border-b border-[#66FCF1]/20 flex items-center justify-between px-6 z-20 sticky top-0 shadow-2xl">
             <div onClick={() => setIsCommandOpen(true)} className="flex items-center gap-3 bg-white/5 hover:bg-white/10 transition-all px-4 py-2 rounded-xl cursor-pointer text-slate-500 text-xs w-full max-sm border border-white/5 group">
                <Search size={14} className="group-hover:text-[#66FCF1] transition-colors" /><span className="flex-1 font-bold uppercase tracking-widest">Execute Command...</span><kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[9px] font-mono font-bold text-slate-500"><Command size={8} /> K</kbd>
             </div>
             <UserHeader />
          </header>
        )}
        <div className={`flex-1 overflow-auto custom-scrollbar relative ${showNavigation ? 'p-6' : ''}`}>
           {renderContent()}
        </div>
        {showNavigation && <AgenticHUD />}
        
        <VoiceAssistant isOpen={isGlobalVoiceOpen} onClose={() => setIsGlobalVoiceOpen(false)} contacts={contacts} />
        <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} contacts={contacts} onNavigate={navigate} onSelectContact={updateContact} />
        <PhoneNotification show={automationToast.show} title="Sentinel Protocol" message={automationToast.msg} type={automationToast.type} onClose={() => setAutomationToast({...automationToast, show: false})} />
      </main>
    </div>
  );
};
