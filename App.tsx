
import React, { useState, useEffect, useRef } from 'react';
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
import FundingResearchPage from './src/pages/FundingResearchPage';
import ResearchDashboardPage from './src/pages/ResearchDashboardPage';
import AdminFundingCatalogPage from './src/pages/AdminFundingCatalogPage';
import GrantsPage from './src/pages/GrantsPage';
import AdminGrantsCatalogPage from './src/pages/AdminGrantsCatalogPage';
import AdminGrantsTrackingPage from './src/pages/AdminGrantsTrackingPage';
import SBAPrepPage from './src/pages/SBAPrepPage';
import AdminSBAPrepPage from './src/pages/AdminSBAPrepPage';
import FundingOutcomesPage from './src/pages/FundingOutcomesPage';
import BillingCommissionsPage from './src/pages/BillingCommissionsPage';
import AdminCommissionsPage from './src/pages/AdminCommissionsPage';
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
import DocumentsPage from './src/pages/DocumentsPage';
import MembershipAgreementPage from './src/pages/MembershipAgreementPage';
import AdminSubscriptionManager from './src/pages/AdminSubscriptionManager';
import AdminDocumentsPage from './src/pages/AdminDocumentsPage';
import SmsTermsPage from './src/pages/SmsTermsPage';
import CommunicationPreferencesPage from './src/pages/CommunicationPreferencesPage';
import SecuritySettingsPage from './src/pages/SecuritySettingsPage';
import AdminControlPlanePage from './src/pages/AdminControlPlanePage';
import UploadCreditReportPage from './src/pages/UploadCreditReportPage';
import DisputeFactsReviewPage from './src/pages/DisputeFactsReviewPage';
import DraftPreviewPage from './src/pages/DraftPreviewPage';
import FinalLetterPage from './src/pages/FinalLetterPage';
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
import WorkflowDetailPage from './src/pages/WorkflowDetailPage';
import AdminWorkflowsPage from './src/pages/AdminWorkflowsPage';
import FreeScorePage from './src/pages/FreeScorePage';
import FreeChecklistPage from './src/pages/FreeChecklistPage';
import UnsubscribePage from './src/pages/UnsubscribePage';
import AdminFunnelSequencesPage from './src/pages/AdminFunnelSequencesPage';
import AdminFunnelLeadsPage from './src/pages/AdminFunnelLeadsPage';
import AdminFunnelMetricsPage from './src/pages/AdminFunnelMetricsPage';
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
import { getUserTier, hasTierAccess, isSubscriptionEntitled, UserTierState } from './src/billing/tier';
import OfferBanner from './src/components/funnel/OfferBanner';
import { linkSignupLead } from './src/services/funnelService';

const PATH_TO_VIEW: Record<string, ViewMode> = {
  '/dashboard': ViewMode.DASHBOARD,
  '/admin/contacts/merge': ViewMode.CONTACT_MERGE,
  '/admin/merge-jobs': ViewMode.MERGE_JOBS,
  '/admin/merge-queue': ViewMode.MERGE_QUEUE,
  '/admin/suggestions': ViewMode.SUGGESTIONS,
  '/admin/health': ViewMode.ADMIN_HEALTH,
  '/admin/monitoring': ViewMode.ADMIN_HEALTH,
  '/admin/control-plane': ViewMode.ADMIN_CONTROL_PLANE,
  '/admin/sre': ViewMode.SRE_DASHBOARD,
  '/admin/channel-health': ViewMode.CHANNEL_HEALTH,
  '/admin/outbox': ViewMode.OUTBOX,
  '/admin/public-api': ViewMode.PUBLIC_API,
  '/admin/roles': ViewMode.ADMIN_ROLES,
  '/admin/members': ViewMode.ADMIN_MEMBERS,
  '/admin/policies': ViewMode.ADMIN_LEGAL_DOCS,
  '/admin/policy-engine': ViewMode.ADMIN_POLICIES,
  '/invite-accept': ViewMode.INVITE_ACCEPT,
  '/terms': ViewMode.TERMS,
  '/privacy': ViewMode.PRIVACY,
  '/ai-disclosure': ViewMode.AI_DISCLOSURE,
  '/refund-policy': ViewMode.REFUND_POLICY,
  '/disclaimers': ViewMode.DISCLAIMERS,
  '/admin/consents': ViewMode.ADMIN_CONSENTS,
  '/pricing': ViewMode.PRICING,
  '/billing': ViewMode.BILLING,
  '/documents': ViewMode.DOCUMENTS,
  '/sba': ViewMode.SBA_PREP,
  '/funding/research': ViewMode.FUNDING_RESEARCH,
  '/research': ViewMode.RESEARCH_DASHBOARD,
  '/funding/outcomes': ViewMode.FUNDING_OUTCOMES,
  '/billing/commissions': ViewMode.BILLING_COMMISSIONS,
  '/grants': ViewMode.GRANTS,
  '/workflow-detail': ViewMode.WORKFLOW_DETAIL,
  '/membership-agreement': ViewMode.MEMBERSHIP_AGREEMENT,
  '/admin/subscriptions': ViewMode.ADMIN_SUBSCRIPTIONS,
  '/admin/documents': ViewMode.ADMIN_DOCUMENTS,
  '/sms-terms': ViewMode.SMS_TERMS,
  '/communication-preferences': ViewMode.COMMUNICATION_PREFERENCES,
  '/credit-report-upload': ViewMode.UPLOAD_CREDIT_REPORT,
  '/dispute-facts-review': ViewMode.DISPUTE_FACTS_REVIEW,
  '/draft-preview': ViewMode.DRAFT_PREVIEW,
  '/final-letter': ViewMode.FINAL_LETTER,
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
  '/admin/workflows': ViewMode.ADMIN_WORKFLOWS,
  '/admin/funding/catalog': ViewMode.ADMIN_FUNDING_CATALOG,
  '/admin/grants/catalog': ViewMode.ADMIN_GRANTS_CATALOG,
  '/admin/grants/tracking': ViewMode.ADMIN_GRANTS_TRACKING,
  '/admin/sba': ViewMode.ADMIN_SBA,
  '/admin/commissions': ViewMode.ADMIN_COMMISSIONS,
  '/settings/communication': ViewMode.COMMUNICATION_PREFERENCES,
  '/settings/security': ViewMode.SECURITY_SETTINGS,
  '/free-score': ViewMode.FREE_SCORE,
  '/free-checklist': ViewMode.FREE_CHECKLIST,
  '/unsubscribe': ViewMode.UNSUBSCRIBE,
  '/admin/funnel/sequences': ViewMode.ADMIN_FUNNEL_SEQUENCES,
  '/admin/funnel/leads': ViewMode.ADMIN_FUNNEL_LEADS,
  '/admin/funnel/metrics': ViewMode.ADMIN_FUNNEL_METRICS,
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
  const [userTierState, setUserTierState] = useState<UserTierState | null>(null);
  const [tierLoading, setTierLoading] = useState(false);

  const [isSystemReady, setIsSystemReady] = useState(false);
  const consentGate = useConsentGate(user?.id || null);
  const linkedUserRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadTier() {
      if (!user?.id) {
        if (!active) return;
        setUserTierState(null);
        setTierLoading(false);
        return;
      }

      setTierLoading(true);
      try {
        const tier = await getUserTier(user.id);
        if (!active) return;
        setUserTierState(tier);
      } catch {
        if (!active) return;
        setUserTierState({
          tier: 'FREE',
          status: 'active',
          subscriptionId: null,
          cancelAtPeriodEnd: false,
        });
      } finally {
        if (active) setTierLoading(false);
      }
    }

    void loadTier();

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      linkedUserRef.current = null;
      return;
    }

    if (linkedUserRef.current === user.id) {
      return;
    }

    linkedUserRef.current = user.id;
    void linkSignupLead().catch(() => {
      linkedUserRef.current = user.id;
    });
  }, [user?.id, user?.email]);

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

      if ([ViewMode.FREE_SCORE, ViewMode.FREE_CHECKLIST, ViewMode.UNSUBSCRIBE].includes(hash)) {
        if (isValidView) {
          setCurrentView(hash);
          return;
        }
      }

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
          ViewMode.DOCUMENTS,
          ViewMode.COMMUNICATION_PREFERENCES,
          ViewMode.SECURITY_SETTINGS,
          ViewMode.MEMBERSHIP_AGREEMENT,
          ViewMode.CLIENT_MAILING_APPROVALS,
          ViewMode.DISPUTE_LETTER_PREVIEW,
          ViewMode.WORKFLOW_DETAIL,
          ViewMode.SBA_PREP,
          ViewMode.GRANTS,
          ViewMode.FUNDING_RESEARCH,
          ViewMode.FUNDING_OUTCOMES,
          ViewMode.BILLING_COMMISSIONS,
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

  const tierGateMap: Partial<Record<ViewMode, { requiredTier: PlanCode; moduleLabel: string }>> = {
    [ViewMode.SCENARIO_RUNNER]: { requiredTier: 'GROWTH', moduleLabel: 'AI Task Runner' },
    [ViewMode.LENDER_ROOM]: { requiredTier: 'PREMIUM', moduleLabel: 'SBA Module' },
    [ViewMode.FUNDING_FLOW]: { requiredTier: 'PREMIUM', moduleLabel: 'Funding Research' },
    [ViewMode.FUNDING_RESEARCH]: { requiredTier: 'PREMIUM', moduleLabel: 'Funding Research Engine' },
    [ViewMode.FUNDING_OUTCOMES]: { requiredTier: 'PREMIUM', moduleLabel: 'Funding Outcomes' },
    [ViewMode.SBA_PREP]: { requiredTier: 'PREMIUM', moduleLabel: 'SBA Preparation' },
    [ViewMode.BILLING_COMMISSIONS]: { requiredTier: 'PREMIUM', moduleLabel: 'Commission Billing' },
    [ViewMode.COMMISSIONS]: { requiredTier: 'PREMIUM', moduleLabel: 'Commission Ledger' },
  };

  const shouldBypassTierGate = Boolean(user && ['super_admin', 'admin', 'supervisor', 'sales', 'salesperson'].includes(user.role));

  const renderTierGate = (view: ViewMode, element: React.ReactNode) => {
    const requirement = tierGateMap[view];
    if (!requirement) return element;
    if (!user || shouldBypassTierGate) return element;

    if (tierLoading) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center text-slate-300">
          Checking subscription tier...
        </div>
      );
    }

    const tier = userTierState?.tier || 'FREE';
    const status = userTierState?.status || 'active';

    if (hasTierAccess(tier, requirement.requiredTier) && isSubscriptionEntitled(status)) {
      return element;
    }

    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="rounded-2xl border border-cyan-500/30 bg-slate-900 p-6 space-y-3">
          <h2 className="text-xl font-black text-white">Upgrade Required</h2>
          <p className="text-sm text-slate-300">
            {requirement.moduleLabel} requires the {requirement.requiredTier} tier with an active subscription.
          </p>
          <p className="text-xs text-slate-500">Educational tools only. Results vary and are not guaranteed.</p>
          <button
            className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950"
            onClick={() => navigate(ViewMode.BILLING)}
          >
            Open Billing
          </button>
        </div>
      </div>
    );
  };

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

    if (currentView === ViewMode.FREE_SCORE) return <FreeScorePage />;
    if (currentView === ViewMode.FREE_CHECKLIST) return <FreeChecklistPage />;
    if (currentView === ViewMode.UNSUBSCRIBE) return <UnsubscribePage />;

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
        if (currentView === ViewMode.FREE_SCORE) return <FreeScorePage />;
        if (currentView === ViewMode.FREE_CHECKLIST) return <FreeChecklistPage />;
        if (currentView === ViewMode.UNSUBSCRIBE) return <UnsubscribePage />;
        if (currentView === ViewMode.PRICING) return <PricingPage onNavigateBilling={(plan) => { setBillingUpgradeTarget(plan || null); navigate(ViewMode.BILLING); }} />;
        if (currentView === ViewMode.BILLING) return <BillingPage selectedPlan={billingUpgradeTarget} />;
        if (currentView === ViewMode.DOCUMENTS) return <DocumentsPage />;
        if (currentView === ViewMode.COMMUNICATION_PREFERENCES) return <CommunicationPreferencesPage />;
        if (currentView === ViewMode.SECURITY_SETTINGS) return <SecuritySettingsPage />;
        if (currentView === ViewMode.UPLOAD_CREDIT_REPORT) return <UploadCreditReportPage />;
        if (currentView === ViewMode.DISPUTE_FACTS_REVIEW) return <DisputeFactsReviewPage />;
        if (currentView === ViewMode.DRAFT_PREVIEW) return <DraftPreviewPage />;
        if (currentView === ViewMode.FINAL_LETTER) return <FinalLetterPage />;
        if (currentView === ViewMode.CLIENT_MAILING_APPROVALS) return <ClientMailingApprovalsPage />;
        if (currentView === ViewMode.DISPUTE_LETTER_PREVIEW) return <DisputeLetterPreviewPage />;
        if (currentView === ViewMode.FUNDING_OUTCOMES) return <FundingOutcomesPage />;
        if (currentView === ViewMode.BILLING_COMMISSIONS) return <BillingCommissionsPage />;
        if (currentView === ViewMode.ADMIN_COMMISSIONS) return <AdminCommissionsPage />;
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
                    case ViewMode.DOCUMENTS: return <DocumentsPage />;
                    case ViewMode.COMMUNICATION_PREFERENCES: return <CommunicationPreferencesPage />;
                    case ViewMode.SECURITY_SETTINGS: return <SecuritySettingsPage />;
                    case ViewMode.UPLOAD_CREDIT_REPORT: return <UploadCreditReportPage />;
                    case ViewMode.DISPUTE_FACTS_REVIEW: return <DisputeFactsReviewPage />;
                    case ViewMode.DRAFT_PREVIEW: return <DraftPreviewPage />;
                    case ViewMode.FINAL_LETTER: return <FinalLetterPage />;
                    case ViewMode.MARKETING: return <MarketingCampaigns contacts={contacts} branding={branding} onUpdateBranding={updateBranding} />;
                    case ViewMode.NEURAL_FLOOR: return <NeuralFloor contacts={contacts} onUpdateContacts={setContacts} />;
                    case ViewMode.POWER_DIALER: return <PowerDialer queue={contacts} onUpdateContact={updateContact} onClose={() => navigate(ViewMode.CRM)} />;
                    case ViewMode.LENDERS: return <LenderMarketplace />;
                    case ViewMode.DOC_GENERATOR: return <DocumentGenerator contacts={contacts} onUpdateContact={updateContact} />;
                    case ViewMode.REVIEW_QUEUE: return <DocumentQueue contacts={contacts} onUpdateContact={updateContact} />;
                    case ViewMode.SITEMAP: return <SystemSitemap onNavigate={navigate} />;
                    case ViewMode.EXPENSES: return <ExpenseTracker />;
                    case ViewMode.GRANTS: return <GrantsPage />;
                    case ViewMode.SBA_PREP: return renderTierGate(ViewMode.SBA_PREP, <SBAPrepPage />);
                    case ViewMode.COMMISSIONS: return renderTierGate(ViewMode.COMMISSIONS, <CommissionManager contacts={contacts} />);
                    case ViewMode.RISK_MONITOR: return <RiskMonitor />;
                    case ViewMode.FUNDING_FLOW: return renderTierGate(ViewMode.FUNDING_FLOW, <PGFundingFlow />);
                    case ViewMode.FUNDING_RESEARCH: return renderTierGate(ViewMode.FUNDING_RESEARCH, <FundingResearchPage />);
                    case ViewMode.RESEARCH_DASHBOARD: return <ResearchDashboardPage />;
                    case ViewMode.FUNDING_OUTCOMES: return renderTierGate(ViewMode.FUNDING_OUTCOMES, <FundingOutcomesPage />);
                    case ViewMode.BILLING_COMMISSIONS: return renderTierGate(ViewMode.BILLING_COMMISSIONS, <BillingCommissionsPage />);
                    case ViewMode.AUTOMATION: return <LiveAutomationMonitor />;
                    case ViewMode.INVOICING: return <InvoicingHub contacts={contacts} onUpdateContact={updateContact} />;
                    case ViewMode.REPUTATION: return <ReputationManager branding={branding} onUpdateBranding={updateBranding} />;
                    case ViewMode.WEALTH_MANAGER: return <WealthPortfolio contacts={contacts} onUpdateContact={updateContact} />;
                    case ViewMode.INFRA_MONITOR: return <InfraMonitor />;
                    case ViewMode.LEAD_SCOUT: return <LeadScout onAddLead={addContact} />;
                    case ViewMode.LENDER_ROOM: return renderTierGate(ViewMode.LENDER_ROOM, <LenderRoom contacts={contacts} />);
                    case ViewMode.KNOWLEDGE_HUB: return <KnowledgeHub />;
                    case ViewMode.SCENARIO_RUNNER: return renderTierGate(ViewMode.SCENARIO_RUNNER, <ScenarioRunner />);
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
                    case ViewMode.ADMIN_CONTROL_PLANE: return <AdminControlPlanePage />;
                    case ViewMode.SRE_DASHBOARD: return <AdminSRE />;
                    case ViewMode.OUTBOX: return <AdminOutbox />;
                    case ViewMode.PUBLIC_API: return <AdminPublicApi />;
                    case ViewMode.ADMIN_ROLES: return <AdminRoles />;
                    case ViewMode.ADMIN_MEMBERS: return <AdminMembers />;
                    case ViewMode.ADMIN_POLICIES: return <AdminPolicies />;
                    case ViewMode.ADMIN_CONSENTS: return <AdminConsentViewer />;
                    case ViewMode.ADMIN_SUBSCRIPTIONS: return <AdminSubscriptionManager />;
                    case ViewMode.ADMIN_DOCUMENTS: return <AdminDocumentsPage />;
                    case ViewMode.ADMIN_SMS_TEMPLATES: return <AdminSmsTemplateEditor />;
                    case ViewMode.CLIENT_MAILING_APPROVALS: return <ClientMailingApprovalsPage />;
                    case ViewMode.DISPUTE_LETTER_PREVIEW: return <DisputeLetterPreviewPage />;
                    case ViewMode.ADMIN_MAILING_QUEUE: return <AdminMailingQueuePage />;
                    case ViewMode.ADMIN_MAILING_DASHBOARD: return <AdminMailingDashboard />;
                    case ViewMode.ADMIN_LEGAL_DOCS: return <AdminLegalPublisher />;
                    case ViewMode.ADMIN_EMAIL_PROVIDERS: return <AdminEmailProvidersPage />;
                    case ViewMode.ADMIN_EMAIL_ROUTING: return <AdminEmailRoutingPage />;
                    case ViewMode.ADMIN_EMAIL_LOGS: return <AdminEmailLogsPage />;
                    case ViewMode.ADMIN_WORKFLOWS: return <AdminWorkflowsPage />;
                    case ViewMode.ADMIN_FUNNEL_SEQUENCES: return <AdminFunnelSequencesPage />;
                    case ViewMode.ADMIN_FUNNEL_LEADS: return <AdminFunnelLeadsPage />;
                    case ViewMode.ADMIN_FUNNEL_METRICS: return <AdminFunnelMetricsPage />;
                    case ViewMode.ADMIN_FUNDING_CATALOG: return <AdminFundingCatalogPage />;
                    case ViewMode.ADMIN_GRANTS_CATALOG: return <AdminGrantsCatalogPage />;
                    case ViewMode.ADMIN_GRANTS_TRACKING: return <AdminGrantsTrackingPage />;
                    case ViewMode.ADMIN_SBA: return <AdminSBAPrepPage />;
                    case ViewMode.ADMIN_COMMISSIONS: return <AdminCommissionsPage />;
                    case ViewMode.WORKFLOW_DETAIL: return <WorkflowDetailPage />;
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
           {user && !isLegalView && !consentGate.needsAcceptance ? <OfferBanner onUpgrade={() => navigate(ViewMode.BILLING)} /> : null}
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
