
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
import TermsPage from './src/pages/TermsPage';
import PrivacyPage from './src/pages/PrivacyPage';
import AIDisclosurePage from './src/pages/AIDisclosurePage';
import RefundPolicyPage from './src/pages/RefundPolicyPage';
import DisclaimersPage from './src/pages/DisclaimersPage';
import AdminConsentViewer from './src/pages/AdminConsentViewer';
import PricingPage from './src/pages/PricingPage';
import BillingPage from './src/pages/BillingPage';
import MembershipAgreementPage from './src/pages/MembershipAgreementPage';
import AdminSubscriptionManager from './src/pages/AdminSubscriptionManager';
import SmsTermsPage from './src/pages/SmsTermsPage';
import CommunicationPreferencesPage from './src/pages/CommunicationPreferencesPage';
import AdminSmsTemplateEditor from './src/pages/AdminSmsTemplateEditor';
import MailingAuthorizationPage from './src/pages/MailingAuthorizationPage';
import ClientMailingApprovalsPage from './src/pages/ClientMailingApprovalsPage';
import AdminMailingQueuePage from './src/pages/AdminMailingQueuePage';
import DisputeLetterPreviewPage from './src/pages/DisputeLetterPreviewPage';
import AdminMailingDashboard from './src/pages/AdminMailingDashboard';
import AdminLegalPublisher from './src/pages/AdminLegalPublisher';
import AdminEmailProvidersPage from './src/pages/AdminEmailProvidersPage';
import AdminEmailRoutingPage from './src/pages/AdminEmailRoutingPage';
import AdminEmailLogsPage from './src/pages/AdminEmailLogsPage';
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
import RequiredDisclaimers from './components/legal/RequiredDisclaimers';
import LegalFooterLinks from './components/legal/LegalFooterLinks';
import ConsentGateModal from './components/consent/ConsentGateModal';
import useConsentGate from './hooks/useConsentGate';
import { PlanCode } from './src/billing/types';

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
  '/terms': ViewMode.TERMS,
  '/privacy': ViewMode.PRIVACY,
  '/ai-disclosure': ViewMode.AI_DISCLOSURE,
  '/refund-policy': ViewMode.REFUND_POLICY,
  '/disclaimers': ViewMode.DISCLAIMERS,
  '/admin/consents': ViewMode.ADMIN_CONSENTS,
  '/pricing': ViewMode.PRICING,
  '/billing': ViewMode.BILLING,
  '/membership-agreement': ViewMode.MEMBERSHIP_AGREEMENT,
  '/admin/subscriptions': ViewMode.ADMIN_SUBSCRIPTIONS,
  '/sms-terms': ViewMode.SMS_TERMS,
  '/communication-preferences': ViewMode.COMMUNICATION_PREFERENCES,
  '/dispute-letter-preview': ViewMode.DISPUTE_LETTER_PREVIEW,
  '/admin/sms-templates': ViewMode.ADMIN_SMS_TEMPLATES,
  '/mailing-authorization': ViewMode.MAILING_AUTHORIZATION,
  '/mailing-approvals': ViewMode.CLIENT_MAILING_APPROVALS,
  '/admin/mailing-queue': ViewMode.ADMIN_MAILING_QUEUE,
  '/admin/mailing-dashboard': ViewMode.ADMIN_MAILING_DASHBOARD,
  '/admin/legal-docs': ViewMode.ADMIN_LEGAL_DOCS,
  '/admin/email/providers': ViewMode.ADMIN_EMAIL_PROVIDERS,
  '/admin/email/routing': ViewMode.ADMIN_EMAIL_ROUTING,
  '/admin/email/logs': ViewMode.ADMIN_EMAIL_LOGS,
  '/settings/communication': ViewMode.COMMUNICATION_PREFERENCES,
};

const LEGAL_VIEWS: ViewMode[] = [
  ViewMode.TERMS,
  ViewMode.PRIVACY,
  ViewMode.AI_DISCLOSURE,
  ViewMode.REFUND_POLICY,
  ViewMode.DISCLAIMERS,
  ViewMode.MEMBERSHIP_AGREEMENT,
  ViewMode.MAILING_AUTHORIZATION,
  ViewMode.SMS_TERMS,
];

function isLegalViewMode(view: ViewMode): boolean {
  return LEGAL_VIEWS.includes(view);
}

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
  const [billingUpgradeTarget, setBillingUpgradeTarget] = useState<PlanCode | null>(null);

  const [isSystemReady, setIsSystemReady] = useState(false);
  const consentGate = useConsentGate(user?.id || null);

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
        if (isLegalViewMode(hash)) {
          setCurrentView(hash);
          return;
        }

        const clientAllowedViews: ViewMode[] = [
          ViewMode.PORTAL,
          ViewMode.PARTNER_MARKETPLACE,
          ViewMode.PRICING,
          ViewMode.BILLING,
          ViewMode.COMMUNICATION_PREFERENCES,
          ViewMode.MEMBERSHIP_AGREEMENT,
          ViewMode.CLIENT_MAILING_APPROVALS,
          ViewMode.DISPUTE_LETTER_PREVIEW,
        ];

        if (!clientAllowedViews.includes(hash)) {
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

  const isLegalView = isLegalViewMode(currentView);
  const showNavigation = Boolean(
    user
    && user.role !== 'client'
    && ![ViewMode.CLIENT_LANDING, ViewMode.LOGIN, ViewMode.SIGNUP, ViewMode.ONBOARDING].includes(currentView)
    && !isLegalView
    && isSystemReady
    && !consentGate.needsAcceptance
  );

  const renderContent = () => {
    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950"><RefreshCw className="animate-spin text-blue-500" /></div>;

    if (isLegalViewMode(currentView)) {
      switch (currentView) {
        case ViewMode.TERMS:
          return <TermsPage />;
        case ViewMode.PRIVACY:
          return <PrivacyPage />;
        case ViewMode.AI_DISCLOSURE:
          return <AIDisclosurePage />;
        case ViewMode.REFUND_POLICY:
          return <RefundPolicyPage />;
        case ViewMode.DISCLAIMERS:
          return <DisclaimersPage />;
        case ViewMode.MEMBERSHIP_AGREEMENT:
          return <MembershipAgreementPage />;
        case ViewMode.MAILING_AUTHORIZATION:
          return <MailingAuthorizationPage />;
        case ViewMode.SMS_TERMS:
          return <SmsTermsPage />;
        default:
          return <DisclaimersPage />;
      }
    }

    if (user && consentGate.needsAcceptance) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="rounded-2xl border border-cyan-300/25 bg-slate-900 p-6 text-sm text-slate-200">
            Accept required policies to continue.
          </div>
        </div>
      );
    }

    if (!user) {
        if (currentView === ViewMode.SIGNUP) return <SignUp onRegister={addContact} onNavigate={navigate} />;
        if (currentView === ViewMode.LOGIN) return <Login onLogin={() => {}} onBack={() => navigate(ViewMode.CLIENT_LANDING)} />;
        if (currentView === ViewMode.PRICING) return <PricingPage onNavigateBilling={(plan) => { setBillingUpgradeTarget(plan || null); navigate(ViewMode.BILLING); }} />;
        if (currentView === ViewMode.BILLING) return <BillingPage selectedPlan={billingUpgradeTarget} />;
        if (currentView === ViewMode.COMMUNICATION_PREFERENCES) return <CommunicationPreferencesPage />;
        if (currentView === ViewMode.CLIENT_MAILING_APPROVALS) return <ClientMailingApprovalsPage />;
        if (currentView === ViewMode.DISPUTE_LETTER_PREVIEW) return <DisputeLetterPreviewPage />;
        return <ClientLandingPage onNavigate={navigate} />;
    }

    if (currentView === ViewMode.PORTAL) {
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
                    case ViewMode.PRICING: return <PricingPage onNavigateBilling={(plan) => { setBillingUpgradeTarget(plan || null); navigate(ViewMode.BILLING); }} />;
                    case ViewMode.BILLING: return <BillingPage selectedPlan={billingUpgradeTarget} />;
                    case ViewMode.COMMUNICATION_PREFERENCES: return <CommunicationPreferencesPage />;
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
                    case ViewMode.ADMIN_CONSENTS: return <AdminConsentViewer />;
                    case ViewMode.ADMIN_SUBSCRIPTIONS: return <AdminSubscriptionManager />;
                    case ViewMode.ADMIN_SMS_TEMPLATES: return <AdminSmsTemplateEditor />;
                    case ViewMode.CLIENT_MAILING_APPROVALS: return <ClientMailingApprovalsPage />;
                    case ViewMode.DISPUTE_LETTER_PREVIEW: return <DisputeLetterPreviewPage />;
                    case ViewMode.ADMIN_MAILING_QUEUE: return <AdminMailingQueuePage />;
                    case ViewMode.ADMIN_MAILING_DASHBOARD: return <AdminMailingDashboard />;
                    case ViewMode.ADMIN_LEGAL_DOCS: return <AdminLegalPublisher />;
                    case ViewMode.ADMIN_EMAIL_PROVIDERS: return <AdminEmailProvidersPage />;
                    case ViewMode.ADMIN_EMAIL_ROUTING: return <AdminEmailRoutingPage />;
                    case ViewMode.ADMIN_EMAIL_LOGS: return <AdminEmailLogsPage />;
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
            userRole={user?.role}
          />
      )}
      <main className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-500 ${showNavigation ? 'md:ml-64 bg-slate-900 border-l border-white/5' : ''}`}>
        {showNavigation && (
          <header className="h-16 bg-[#0B0C10] border-b border-[#66FCF1]/20 flex items-center justify-between px-6 z-20 sticky top-0 shadow-2xl">
             <div onClick={() => setIsCommandOpen(true)} className="flex items-center gap-3 bg-white/5 hover:bg-white/10 transition-all px-4 py-2 rounded-xl cursor-pointer text-slate-500 text-xs w-full max-sm border border-white/5 group">
                <Search size={14} className="group-hover:text-[#66FCF1] transition-colors" /><span className="flex-1 font-bold uppercase tracking-widest">Execute Command...</span><kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[9px] font-mono font-bold text-slate-500"><Command size={8} /> K</kbd>
             </div>
             <div className="flex items-center gap-3 ml-4">
               <RequiredDisclaimers variant="badge" />
               <UserHeader />
             </div>
          </header>
        )}
        <div className={`flex-1 overflow-auto custom-scrollbar relative ${showNavigation ? 'p-6' : ''}`}>
           {renderContent()}
        </div>
        {!isLegalView && (
          <div className={showNavigation ? "border-t border-white/10 bg-slate-900 px-6" : "border-t border-white/10 bg-slate-950 px-4 sm:px-6"}>
            <LegalFooterLinks compact />
          </div>
        )}

        <ConsentGateModal
          open={Boolean(user && !isLegalView && consentGate.needsAcceptance)}
          loading={consentGate.loading}
          submitting={consentGate.submitting}
          status={consentGate.status}
          error={consentGate.error}
          requiredTypes={consentGate.requiredTypes}
          requiredVersions={consentGate.requiredVersions}
          onAccept={consentGate.acceptConsents}
        />

        {showNavigation && <AgenticHUD />}
        
        <VoiceAssistant isOpen={isGlobalVoiceOpen} onClose={() => setIsGlobalVoiceOpen(false)} contacts={contacts} />
        <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} contacts={contacts} onNavigate={navigate} onSelectContact={updateContact} />
        <PhoneNotification show={automationToast.show} title="Sentinel Protocol" message={automationToast.msg} type={automationToast.type} onClose={() => setAutomationToast({...automationToast, show: false})} />
      </main>
    </div>
  );
};
