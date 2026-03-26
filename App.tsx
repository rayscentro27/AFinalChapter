
import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CRMTable from './components/CRMTable';
import PortalView from './components/PortalView';
import SignUp from './components/SignUp';
import Settings from './components/Settings';
import Login from './components/Login';
import ClientLandingPage from './components/ClientLandingPage';
import ClientHomeV2 from './components/light/ClientHomeV2';
import UnifiedInbox from './components/UnifiedInbox';
import CommandPalette from './components/CommandPalette';
import SystemSitemap from './components/SystemSitemap';
import PhoneNotification from './components/PhoneNotification';
import VoiceAssistant from './components/VoiceAssistant';
import AgenticHUD from './components/AgenticHUD';
import UserHeader from './components/UserHeader';
import { ViewMode, Contact, AgencyBranding, Course, Notification, ClientTask } from './types';
// Added RefreshCw to imports
import { Search, Bell, Command, RefreshCw } from 'lucide-react';
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
import { supabase } from './lib/supabaseClient';

const MarketingCampaigns = lazy(() => import('./components/MarketingCampaigns'));
const NeuralFloor = lazy(() => import('./components/NeuralFloor'));
const PowerDialer = lazy(() => import('./components/PowerDialer'));
const LenderMarketplace = lazy(() => import('./components/LenderMarketplace'));
const DocumentGenerator = lazy(() => import('./components/DocumentGenerator'));
const DocumentQueue = lazy(() => import('./components/DocumentQueue'));
const ReputationManager = lazy(() => import('./components/ReputationManager'));
const PGFundingFlow = lazy(() => import('./components/PGFundingFlow'));
const ExpenseTracker = lazy(() => import('./components/ExpenseTracker'));
const CommissionManager = lazy(() => import('./components/CommissionManager'));
const RiskMonitor = lazy(() => import('./components/RiskMonitor'));
const LiveAutomationMonitor = lazy(() => import('./components/LiveAutomationMonitor'));
const InvoicingHub = lazy(() => import('./components/InvoicingHub'));
const WealthPortfolio = lazy(() => import('./components/WealthPortfolio'));
const InfraMonitor = lazy(() => import('./components/InfraMonitor'));
const LeadScout = lazy(() => import('./components/LeadScout'));
const LenderRoom = lazy(() => import('./components/LenderRoom'));
const KnowledgeHub = lazy(() => import('./components/KnowledgeHub'));
const ScenarioRunner = lazy(() => import('./components/ScenarioRunner'));
const AffiliateMarketplace = lazy(() => import('./components/AffiliateMarketplace'));
const ForensicHub = lazy(() => import('./components/ForensicHub'));
const SupervisorTriage = lazy(() => import('./components/SupervisorTriage'));
const NeuralStrategySandbox = lazy(() => import('./components/NeuralStrategySandbox'));

const FundingResearchPage = lazy(() => import('./src/pages/FundingResearchPage'));
const ResearchDashboardPage = lazy(() => import('./src/pages/ResearchDashboardPage'));
const AdminCeoBriefingPage = lazy(() => import('./src/pages/AdminCeoBriefingPage'));
const AdminSuperAdminCommandCenterPage = lazy(() => import('./src/pages/AdminSuperAdminCommandCenterPage'));
const AdminSourceRegistryPage = lazy(() => import('./src/pages/AdminSourceRegistryPage'));
const AdminCommandInboxPage = lazy(() => import('./src/pages/AdminCommandInboxPage'));
const AdminMonetizationOpportunitiesPage = lazy(() => import('./src/pages/AdminMonetizationOpportunitiesPage'));
const AdminAutonomousExpansionPage = lazy(() => import('./src/pages/AdminAutonomousExpansionPage'));
const AdminOrganizationDashboardPage = lazy(() => import('./src/pages/AdminOrganizationDashboardPage'));
const AdminFunnelControlCenterPage = lazy(() => import('./src/pages/AdminFunnelControlCenterPage'));
const AdminWhiteLabelSettingsPage = lazy(() => import('./src/pages/AdminWhiteLabelSettingsPage'));
const AdminExecutiveDashboardPage = lazy(() => import('./src/pages/AdminExecutiveDashboardPage'));
const AdminActivationCenterPage = lazy(() => import('./src/pages/AdminActivationCenterPage'));
const AdminCredentialManagementPage = lazy(() => import('./src/pages/AdminCredentialManagementPage'));
const AdminDealEscalationsPage = lazy(() => import('./src/pages/AdminDealEscalationsPage'));
const LifecycleAutomationPage = lazy(() => import('./src/pages/LifecycleAutomationPage'));
const AdminReviewAnalyticsPage = lazy(() => import('./src/pages/AdminReviewAnalyticsPage'));
const AdminResearchApprovalsPage = lazy(() => import('./src/pages/AdminResearchApprovalsPage'));
const AdminFundingCatalogPage = lazy(() => import('./src/pages/AdminFundingCatalogPage'));
const GrantsPage = lazy(() => import('./src/pages/GrantsPage'));
const AdminGrantsCatalogPage = lazy(() => import('./src/pages/AdminGrantsCatalogPage'));
const AdminGrantsTrackingPage = lazy(() => import('./src/pages/AdminGrantsTrackingPage'));
const SBAPrepPage = lazy(() => import('./src/pages/SBAPrepPage'));
const AdminSBAPrepPage = lazy(() => import('./src/pages/AdminSBAPrepPage'));
const FundingOutcomesPage = lazy(() => import('./src/pages/FundingOutcomesPage'));
const BillingCommissionsPage = lazy(() => import('./src/pages/BillingCommissionsPage'));
const AdminCommissionsPage = lazy(() => import('./src/pages/AdminCommissionsPage'));
const AdminChannelMapper = lazy(() => import('./src/pages/AdminChannelMapper'));
const AdminContactsMerge = lazy(() => import('./src/pages/AdminContactsMerge'));
const AdminMergeJobs = lazy(() => import('./src/pages/AdminMergeJobs'));
const AdminMergeQueue = lazy(() => import('./src/pages/AdminMergeQueue'));
const AdminSuggestions = lazy(() => import('./src/pages/AdminSuggestions'));
const AdminTeamMembers = lazy(() => import('./src/pages/AdminTeamMembers'));
const AdminOnCall = lazy(() => import('./src/pages/AdminOnCall'));
const AdminChannelPools = lazy(() => import('./src/pages/AdminChannelPools'));
const AdminDeadLetters = lazy(() => import('./src/pages/AdminDeadLetters'));
const AdminOutbox = lazy(() => import('./src/pages/AdminOutbox'));
const AdminMonitoring = lazy(() => import('./src/pages/AdminMonitoring'));
const AdminAutonomyDashboard = lazy(() => import('./src/pages/AdminAutonomyDashboard'));
const AdminSRE = lazy(() => import('./src/pages/AdminSRE'));
const AdminChannelHealth = lazy(() => import('./src/pages/AdminChannelHealth'));
const AdminPublicApi = lazy(() => import('./src/pages/AdminPublicApi'));
const AdminRoles = lazy(() => import('./src/pages/AdminRoles'));
const AdminMembers = lazy(() => import('./src/pages/AdminMembers'));
const AdminPolicies = lazy(() => import('./src/pages/AdminPolicies'));
const InviteAccept = lazy(() => import('./src/pages/InviteAccept'));
const TermsPage = lazy(() => import('./src/pages/TermsPage'));
const PrivacyPage = lazy(() => import('./src/pages/PrivacyPage'));
const AIDisclosurePage = lazy(() => import('./src/pages/AIDisclosurePage'));
const RefundPolicyPage = lazy(() => import('./src/pages/RefundPolicyPage'));
const DisclaimersPage = lazy(() => import('./src/pages/DisclaimersPage'));
const AdminConsentViewer = lazy(() => import('./src/pages/AdminConsentViewer'));
const PricingPage = lazy(() => import('./src/pages/PricingPage'));
const BillingPage = lazy(() => import('./src/pages/BillingPage'));
const DocumentsPage = lazy(() => import('./src/pages/DocumentsPage'));
const MembershipAgreementPage = lazy(() => import('./src/pages/MembershipAgreementPage'));
const AdminSubscriptionManager = lazy(() => import('./src/pages/AdminSubscriptionManager'));
const AdminDocumentsPage = lazy(() => import('./src/pages/AdminDocumentsPage'));
const CommunicationPreferencesPage = lazy(() => import('./src/pages/CommunicationPreferencesPage'));
const SecuritySettingsPage = lazy(() => import('./src/pages/SecuritySettingsPage'));
const AdminControlPlanePage = lazy(() => import('./src/pages/AdminControlPlanePage'));
const UploadCreditReportPage = lazy(() => import('./src/pages/UploadCreditReportPage'));
const DisputeFactsReviewPage = lazy(() => import('./src/pages/DisputeFactsReviewPage'));
const DraftPreviewPage = lazy(() => import('./src/pages/DraftPreviewPage'));
const FinalLetterPage = lazy(() => import('./src/pages/FinalLetterPage'));
const MailingAuthorizationPage = lazy(() => import('./src/pages/MailingAuthorizationPage'));
const ClientMailingApprovalsPage = lazy(() => import('./src/pages/ClientMailingApprovalsPage'));
const AdminMailingQueuePage = lazy(() => import('./src/pages/AdminMailingQueuePage'));
const DisputeLetterPreviewPage = lazy(() => import('./src/pages/DisputeLetterPreviewPage'));
const AdminMailingDashboard = lazy(() => import('./src/pages/AdminMailingDashboard'));
const AdminLegalPublisher = lazy(() => import('./src/pages/AdminLegalPublisher'));
const AdminEmailProvidersPage = lazy(() => import('./src/pages/AdminEmailProvidersPage'));
const AdminEmailRoutingPage = lazy(() => import('./src/pages/AdminEmailRoutingPage'));
const AdminEmailLogsPage = lazy(() => import('./src/pages/AdminEmailLogsPage'));
const WorkflowDetailPage = lazy(() => import('./src/pages/WorkflowDetailPage'));
const AdminWorkflowsPage = lazy(() => import('./src/pages/AdminWorkflowsPage'));
const FreeScorePage = lazy(() => import('./src/pages/FreeScorePage'));
const FreeChecklistPage = lazy(() => import('./src/pages/FreeChecklistPage'));
const UnsubscribePage = lazy(() => import('./src/pages/UnsubscribePage'));
const AdminFunnelSequencesPage = lazy(() => import('./src/pages/AdminFunnelSequencesPage'));
const AdminFunnelLeadsPage = lazy(() => import('./src/pages/AdminFunnelLeadsPage'));
const AdminFunnelMetricsPage = lazy(() => import('./src/pages/AdminFunnelMetricsPage'));
const ClientPortalV2 = lazy(() => import('./components/portal/ClientPortalV2'));

const PATH_TO_VIEW: Record<string, ViewMode> = {
  '/dashboard': ViewMode.DASHBOARD,
  '/portal': ViewMode.PORTAL_OVERVIEW,
  '/portal/overview': ViewMode.PORTAL_OVERVIEW,
  '/portal/credit': ViewMode.PORTAL_CREDIT,
  '/portal/funding': ViewMode.PORTAL_FUNDING,
  '/portal/business': ViewMode.PORTAL_BUSINESS,
  '/portal/grants': ViewMode.PORTAL_GRANTS,
  '/admin/contacts/merge': ViewMode.CONTACT_MERGE,
  '/admin/merge-jobs': ViewMode.MERGE_JOBS,
  '/admin/merge-queue': ViewMode.MERGE_QUEUE,
  '/admin/suggestions': ViewMode.SUGGESTIONS,
  '/admin/health': ViewMode.ADMIN_HEALTH,
  '/admin/monitoring': ViewMode.ADMIN_HEALTH,
  '/admin/autonomy': ViewMode.ADMIN_AUTONOMY,
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
  '/admin/ceo-briefing': ViewMode.ADMIN_CEO_BRIEFING,
  '/admin/ai-command-center': ViewMode.ADMIN_SUPER_ADMIN_COMMAND_CENTER,
  '/admin/source-registry': ViewMode.ADMIN_SOURCE_REGISTRY,
  '/admin/command-inbox': ViewMode.ADMIN_COMMAND_INBOX,
  '/admin/monetization-opportunities': ViewMode.ADMIN_MONETIZATION_OPPORTUNITIES,
  '/admin/autonomous-expansion': ViewMode.ADMIN_AUTONOMOUS_EXPANSION,
  '/admin/organizations': ViewMode.ADMIN_ORGANIZATION_DASHBOARD,
  '/admin/funnel-control': ViewMode.ADMIN_FUNNEL_CONTROL_CENTER,
  '/admin/white-label': ViewMode.ADMIN_WHITE_LABEL_SETTINGS,
  '/admin/executive-dashboard': ViewMode.ADMIN_EXECUTIVE_DASHBOARD,
  '/admin/nexus-one': ViewMode.ADMIN_NEXUS_ONE,
  '/admin/credentials': ViewMode.ADMIN_CREDENTIALS,
  '/admin/deal-escalations': ViewMode.ADMIN_DEAL_ESCALATIONS,
  '/admin/lifecycle-automation': ViewMode.ADMIN_LIFECYCLE_AUTOMATION,
  '/admin/review-analytics': ViewMode.ADMIN_REVIEW_ANALYTICS,
  '/admin/research-approvals': ViewMode.ADMIN_RESEARCH_APPROVALS,
  '/admin/content-review': ViewMode.ADMIN_RESEARCH_APPROVALS,
  '/funding/outcomes': ViewMode.FUNDING_OUTCOMES,
  '/billing/commissions': ViewMode.BILLING_COMMISSIONS,
  '/grants': ViewMode.GRANTS,
  '/workflow-detail': ViewMode.WORKFLOW_DETAIL,
  '/membership-agreement': ViewMode.MEMBERSHIP_AGREEMENT,
  '/admin/subscriptions': ViewMode.ADMIN_SUBSCRIPTIONS,
  '/admin/documents': ViewMode.ADMIN_DOCUMENTS,
  '/communication-preferences': ViewMode.COMMUNICATION_PREFERENCES,
  '/credit-report-upload': ViewMode.UPLOAD_CREDIT_REPORT,
  '/dispute-facts-review': ViewMode.DISPUTE_FACTS_REVIEW,
  '/draft-preview': ViewMode.DRAFT_PREVIEW,
  '/final-letter': ViewMode.FINAL_LETTER,
  '/dispute-letter-preview': ViewMode.DISPUTE_LETTER_PREVIEW,
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
];

const RouteFallback = () => (
  <div className="min-h-[50vh] flex items-center justify-center bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_55%,#f8fafc_100%)] text-slate-500">
    <div className="flex items-center gap-3 text-sm font-medium">
      <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
      Loading module...
    </div>
  </div>
);

function isLegalViewMode(view: ViewMode): boolean {
  return LEGAL_VIEWS.includes(view);
}

function isPortalRouteViewMode(view: ViewMode): boolean {
  return [
    ViewMode.PORTAL_OVERVIEW,
    ViewMode.PORTAL_CREDIT,
    ViewMode.PORTAL_FUNDING,
    ViewMode.PORTAL_BUSINESS,
    ViewMode.PORTAL_GRANTS,
  ].includes(view);
}

function normalizePathname(pathname: string): string {
  const raw = String(pathname || '/').trim().toLowerCase();
  if (raw === '/') return '/';
  return raw.replace(/\/+$/, '');
}

const STAFF_BOOTSTRAP_ROLES = new Set(['admin', 'supervisor', 'sales', 'salesperson']);
const AUTO_LINK_SIGNUP_ROLES = new Set(['client', 'partner']);

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
    let active = true;

    const syncSignupLead = async () => {
      if (loading) return;

      if (!user?.id) {
        linkedUserRef.current = null;
        return;
      }

      if (!AUTO_LINK_SIGNUP_ROLES.has(user.role)) {
        linkedUserRef.current = user.id;
        return;
      }

      if (linkedUserRef.current === user.id) {
        return;
      }

      const sessionRes = await supabase.auth.getSession();
      if (!active) return;

      const session = sessionRes.data.session;
      if (sessionRes.error || !session?.access_token || String(session.user?.id || '') !== user.id) {
        return;
      }

      if (typeof session.expires_at === 'number' && session.expires_at <= Math.floor(Date.now() / 1000) + 30) {
        return;
      }

      linkedUserRef.current = user.id;
      await linkSignupLead(session.access_token).catch(() => {
        linkedUserRef.current = user.id;
      });
    };

    void syncSignupLead();

    return () => {
      active = false;
    };
  }, [loading, user?.id, user?.role, user?.email]);

  useEffect(() => {
    let active = true;

    const initData = async () => {
      if (loading) return;

      if (!user?.id) {
        if (!active) return;
        setContacts([]);
        setIsSystemReady(true);
        return;
      }

      if (!STAFF_BOOTSTRAP_ROLES.has(user.role)) {
        if (!active) return;
        setContacts([]);
        setIsSystemReady(true);
        return;
      }

      try {
        const [c, b] = await Promise.all([data.getContacts(), data.getBranding()]);
        if (!active) return;

        setContacts(c || []);
        if (b) {
          setBranding(b);
          const isSetupRequired = b.name === 'Nexus OS' && (!c || c.length === 0);
          setIsSystemReady(!isSetupRequired);
        } else {
          setIsSystemReady(true);
        }
      } catch {
        if (!active) return;
        setContacts([]);
        setIsSystemReady(true);
      }
    };

    void initData();

    return () => {
      active = false;
    };
  }, [loading, user?.id, user?.role]);

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
      if (mappedView && isPortalRouteViewMode(mappedView)) {
        if (window.location.hash.replace('#', '').toUpperCase() !== mappedView) {
          window.location.hash = mappedView.toLowerCase();
          return;
        }

        setCurrentView(mappedView);
        return;
      }

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
          ViewMode.PORTAL_OVERVIEW,
          ViewMode.PORTAL_CREDIT,
          ViewMode.PORTAL_FUNDING,
          ViewMode.PORTAL_BUSINESS,
          ViewMode.PORTAL_GRANTS,
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
            window.location.hash = (user.role === 'admin' || user.role === 'super_admin' || user.role === 'supervisor' || user.role === 'sales') ? 'dashboard' : 'training';
          } else {
            setCurrentView(hash);
          }
        } else {
          window.location.hash = (user.role === 'admin' || user.role === 'super_admin' || user.role === 'supervisor' || user.role === 'sales') ? 'dashboard' : 'training';
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

  const navigate = (view: ViewMode, pathname?: string) => {
    if (pathname) {
      const normalizedPath = normalizePathname(pathname);
      if (normalizePathname(window.location.pathname) !== normalizedPath) {
        window.history.pushState({}, '', normalizedPath);
      }
    }

    if (window.location.hash.replace('#', '').toUpperCase() === view) {
      setCurrentView(view);
      return;
    }

    window.location.hash = view.toLowerCase();
  };

  const isLegalView = isLegalViewMode(currentView);
  const showNavigation = Boolean(
    user
    && ![ViewMode.CLIENT_LANDING, ViewMode.LOGIN, ViewMode.SIGNUP, ViewMode.ONBOARDING].includes(currentView)
    && !isLegalView
    && (
      user.role === 'client'
        ? [
            ViewMode.PORTAL,
            ViewMode.PORTAL_CREDIT,
            ViewMode.PORTAL_FUNDING,
            ViewMode.PORTAL_BUSINESS,
            ViewMode.PORTAL_GRANTS,
          ].includes(currentView)
        : !isPortalRouteViewMode(currentView)
    )
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
        <div className="min-h-[50vh] flex items-center justify-center text-slate-500">
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
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 space-y-3 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <h2 className="text-xl font-black text-slate-900">Upgrade Required</h2>
          <p className="text-sm text-slate-600">
            {requirement.moduleLabel} requires the {requirement.requiredTier} tier with an active subscription.
          </p>
          <p className="text-xs text-slate-500">Educational tools only. Results vary and are not guaranteed.</p>
          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-wider text-white"
            onClick={() => navigate(ViewMode.BILLING)}
          >
            Open Billing
          </button>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (loading) return <div className="h-screen flex items-center justify-center bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_55%,#f8fafc_100%)]"><RefreshCw className="animate-spin text-emerald-600" /></div>;

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
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            Accept required policies to continue.
          </div>
        </div>
      );
    }

    if (isPortalRouteViewMode(currentView)) {
      const previewContact: Contact = {
        id: 'portal-preview',
        name: user?.name || 'Portal Preview',
        email: user?.email || 'preview@nexus.local',
        phone: '',
        company: 'Nexus Preview Workspace',
        status: 'Active',
        lastContact: 'Preview mode',
        value: 145000,
        source: 'Preview',
        notes: 'Local portal preview mode.',
        checklist: {},
        clientTasks: [],
      };

      return (
        <ClientPortalV2
          currentView={currentView}
          contact={user ? resolvePortalContact() : previewContact}
          branding={branding}
          onLogout={signOut}
          onNavigate={navigate}
          onOpenLegacyPortal={() => navigate(user ? ViewMode.PORTAL : ViewMode.CLIENT_LANDING, user ? undefined : '/')}
        />
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

    const resolvePortalContact = (): Contact => {
      let myContact = contacts.find(c => c.email.toLowerCase() === user.email.toLowerCase());
      if (!myContact && contacts.length > 0) myContact = contacts[0];

      return myContact || {
        id: 'new',
        name: user.name || 'New Client',
        email: user.email,
        phone: '',
        company: 'New Business',
        status: 'Lead',
        lastContact: 'Just now',
        value: 0,
        source: 'Registration',
        notes: 'Setup in progress.',
        checklist: {},
        clientTasks: [],
      };
    };

    if (currentView === ViewMode.PORTAL) {
      if (user.role === 'client') {
        return <ClientHomeV2 contact={resolvePortalContact()} onNavigate={navigate} />;
      }

      return <PortalView contact={resolvePortalContact()} branding={branding} onLogout={signOut} onUpdateContact={updateContact} availableCourses={courses} />;
    }

    if (!isSystemReady && (user.role === 'admin' || user.role === 'super_admin')) {
      return <AdminActivationCenterPage />;
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
                    case ViewMode.ADMIN_CEO_BRIEFING: return <AdminCeoBriefingPage />;
                    case ViewMode.ADMIN_SUPER_ADMIN_COMMAND_CENTER: return <AdminSuperAdminCommandCenterPage />;
                    case ViewMode.ADMIN_SOURCE_REGISTRY: return <AdminSourceRegistryPage />;
                    case ViewMode.ADMIN_COMMAND_INBOX: return <AdminCommandInboxPage />;
                    case ViewMode.ADMIN_MONETIZATION_OPPORTUNITIES: return <AdminMonetizationOpportunitiesPage />;
                    case ViewMode.ADMIN_AUTONOMOUS_EXPANSION: return <AdminAutonomousExpansionPage />;
                    case ViewMode.ADMIN_ORGANIZATION_DASHBOARD: return <AdminOrganizationDashboardPage />;
                    case ViewMode.ADMIN_FUNNEL_CONTROL_CENTER: return <AdminFunnelControlCenterPage />;
                    case ViewMode.ADMIN_WHITE_LABEL_SETTINGS: return <AdminWhiteLabelSettingsPage />;
                    case ViewMode.ADMIN_EXECUTIVE_DASHBOARD: return <AdminExecutiveDashboardPage />;
                    case ViewMode.ADMIN_NEXUS_ONE: return <AdminActivationCenterPage />;
                    case ViewMode.ADMIN_CREDENTIALS: return <AdminCredentialManagementPage />;
                    case ViewMode.ADMIN_DEAL_ESCALATIONS: return <AdminDealEscalationsPage />;
                    case ViewMode.ADMIN_LIFECYCLE_AUTOMATION: return <LifecycleAutomationPage />;
                    case ViewMode.ADMIN_REVIEW_ANALYTICS: return <AdminReviewAnalyticsPage />;
                    case ViewMode.ADMIN_RESEARCH_APPROVALS: return <AdminResearchApprovalsPage />;
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
                    case ViewMode.ADMIN_AUTONOMY: return <AdminAutonomyDashboard />;
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
  const currentViewLabel = currentView
    .toLowerCase()
    .split('_')
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
  const roleLabel = !user
    ? 'Guest'
    : user.role === 'super_admin'
      ? 'Super Admin'
      : user.role.charAt(0).toUpperCase() + user.role.slice(1).replace('_', ' ');

  return (
    <div className="flex h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_55%,#f8fafc_100%)] font-sans text-slate-900 subpixel-antialiased selection:bg-emerald-100 selection:text-emerald-900">
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
      <main className={`flex-1 flex h-full flex-col overflow-hidden subpixel-antialiased transition-all duration-500 ${showNavigation ? 'border-l border-slate-200/80 bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_55%,#f8fafc_100%)] md:ml-64' : 'bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_55%,#f8fafc_100%)]'}`}>
        {showNavigation && (
         <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/92 px-6 py-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
           <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
             <div className="flex min-w-0 flex-1 items-center gap-4">
               <div className="flex min-w-0 flex-col">
                 <span className="text-[10px] font-black uppercase tracking-[0.24em] text-[#6F84B0]">
                   {user.role === 'client' ? 'Client Workspace' : 'Operating System'}
                 </span>
                 <div className="mt-1 flex min-w-0 items-center gap-3">
                   <h1 className="truncate text-xl font-black tracking-tight text-[#203266]">{currentViewLabel}</h1>
                   <span className="hidden rounded-full border border-[#DCE7FA] bg-[#F4F8FF] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#5572A8] sm:inline-flex">
                     {roleLabel}
                   </span>
                 </div>
               </div>

               <button
                 type="button"
                 onClick={() => setIsCommandOpen(true)}
                 className="group hidden max-w-xl flex-1 items-center gap-3 rounded-2xl border border-[#DCE7FA] bg-[linear-gradient(180deg,#ffffff_0%,#f7faff_100%)] px-4 py-3 text-left text-xs text-[#5F74A0] shadow-[0_10px_30px_rgba(62,95,170,0.08)] transition-all hover:border-[#BFD2F7] hover:shadow-[0_14px_36px_rgba(62,95,170,0.12)] md:flex"
               >
                 <div className="rounded-xl border border-[#E1EAFB] bg-[#F4F8FF] p-2 text-[#4A7AE8] transition-colors group-hover:bg-white">
                   <Search size={14} />
                 </div>
                 <div className="min-w-0 flex-1">
                   <div className="truncate text-[11px] font-black uppercase tracking-[0.18em] text-[#203266]">Search workspace</div>
                   <div className="mt-1 truncate text-[11px] font-semibold text-[#7589B2]">Jump to views, contacts, commands, and system pages</div>
                 </div>
                 <kbd className="hidden items-center gap-1 rounded-xl border border-[#DCE7FA] bg-white px-2 py-1 text-[10px] font-mono font-bold text-[#6F84B0] lg:inline-flex">
                   <Command size={10} /> K
                 </kbd>
               </button>
             </div>

             <div className="ml-0 flex items-center justify-between gap-3 lg:ml-4 lg:justify-end">
               <div className="flex items-center gap-2">
                 <div className="hidden items-center gap-2 rounded-full border border-[#DCE7FA] bg-[#F8FBFF] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#5D77A8] md:inline-flex">
                   <Bell size={12} className="text-[#4A7AE8]" />
                   {unreadNotifCount > 0 ? `${unreadNotifCount} active alerts` : 'All clear'}
                 </div>
                 <RequiredDisclaimers variant="badge" />
               </div>
               <UserHeader />
             </div>
           </div>
          </header>
        )}
        <div className={`flex-1 overflow-auto custom-scrollbar relative ${showNavigation ? 'p-6' : ''}`}>
           {user && !isLegalView && !isPortalRouteViewMode(currentView) && !consentGate.needsAcceptance ? <OfferBanner onUpgrade={() => navigate(ViewMode.BILLING)} /> : null}
          <Suspense fallback={<RouteFallback />}>
            {renderContent()}
          </Suspense>
        </div>
        {!isLegalView && (
          <div className={showNavigation ? "border-t border-slate-200/80 bg-white/80 px-6 backdrop-blur-xl" : "border-t border-slate-200/80 bg-white/80 px-4 sm:px-6 backdrop-blur-xl"}>
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
