
import React from 'react';
// Import Type from @google/genai to re-export it
import { Type } from "@google/genai";

export { Type };

export type MerchantPersona = 'Visionary Scaler' | 'Skeptical Veteran' | 'First-Time Founder' | 'Conservative Operator';
export type SentimentLevel = 'Positive' | 'Neutral' | 'Agitated' | 'Critical';
export type AiIntensity = 'Ghost' | 'Concierge' | 'Hunter';

export interface InboxRouting {
  tenant_id?: string;
  tenantId?: string;
  conversation_id?: string;
  conversationId?: string;
  provider?: 'sms' | 'whatsapp' | 'meta' | 'twilio';
  to?: string;
  recipient_id?: string;
  recipientId?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'salesperson' | 'client' | 'partner' | 'sales';
  contactId?: string;
  onboardingComplete?: boolean;
  commissionSplit?: number;
}

export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  meta: {
    magnitude?: number;
    revenue?: number;
    sentiment?: SentimentLevel;
    branding?: any;
    [key: string]: any;
  };
  created_at: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  status: 'Lead' | 'Active' | 'Negotiation' | 'Closed' | 'Triage';
  lastContact: string;
  value: number;
  revenue?: number;
  timeInBusiness?: number;
  source: string;
  notes: string;
  checklist: Record<string, boolean>;
  clientTasks: ClientTask[];
  persona?: MerchantPersona;
  thinkingLog?: string[];
  documents?: ClientDocument[];
  activities?: Activity[];
  invoices?: Invoice[];
  businessProfile?: BusinessProfile;
  creditAnalysis?: CreditAnalysis;
  messageHistory?: Message[];
  connectedBanks?: BankAccount[];
  offers?: FundingOffer[];
  submissions?: ApplicationSubmission[];
  financialSpreading?: FinancialSpreading;
  notifications?: Notification[];
  ledger?: LedgerEntry[];
  negativeItems?: NegativeItem[];
  subscription?: Subscription;
  compliance?: ComplianceRecord;
  stipulations?: Stipulation[];
  fundedDeals?: FundedDeal[];
  rescuePlan?: RescuePlan;
  creditMemo?: CreditMemo;
  aiPriority?: 'Hot' | 'Warm' | 'Cold';
  aiReason?: string;
  aiScore?: number;
  automationMetadata?: {
    lastUCCCheck?: string;
    autoMemoGenerated?: boolean;
    nudgeCount?: number;
    sentiment?: SentimentLevel;
    triageReason?: string;
    intensity?: AiIntensity;
    mailerLiteSynced?: boolean;
  };
  forensicReports?: ForensicReport[];
  bankabilityData?: {
    cashflow: number;
    credit: number;
    collateral: number;
    compliance: number;
    character: number;
  };
  onboardingComplete?: boolean;
  referralData?: ReferralData;
  battleCard?: SalesBattleCard;
  tier2Data?: Tier2Data;
  businessPlan?: BusinessPlan;
  investmentStrategies?: InvestmentIdea[];
  xp?: number;
  meetingLink?: string;
  legalStanding?: string;
  callReady?: boolean;
  feesWaived?: boolean;
  inboxRouting?: InboxRouting;
}

export interface ClientTask {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'completed';
  date: string;
  type: 'upload' | 'action' | 'education' | 'review' | 'meeting' | 'legal';
  signal?: 'red' | 'yellow' | 'green';
  assignedEmployee?: string;
  groupKey?: string;
  templateKey?: string;
  requiredAttachments?: string[];
  link?: string;
  meetingTime?: string;
  linkedToGoal?: boolean;
}

export interface ClientDocument {
  id: string;
  name: string;
  type: 'Legal' | 'Financial' | 'Identification' | 'Credit' | 'Contract' | 'Receipt' | 'Other';
  status: 'Verified' | 'Pending Review' | 'Rejected' | 'Missing' | 'Signed' | 'Processing';
  uploadDate?: string;
  required?: boolean;
  fileUrl?: string;
  isEsed?: boolean;
  signatureHash?: string;
  metadata?: any;
  annotations?: {
    x: number;
    y: number;
    text: string;
    type: 'positive' | 'negative' | 'info';
  }[];
}

export interface Activity {
  id: string;
  type: 'call' | 'email' | 'meeting' | 'note' | 'system' | 'legal';
  description: string;
  date: string;
  user?: string;
  duration?: string;
  outcome?: string;
}

export interface Message {
  id: string;
  sender: 'admin' | 'client' | 'system' | 'bot';
  senderName?: string;
  content: string;
  timestamp: string;
  read: boolean;
  actionRequired?: any;
  deliveryStatus?: string;
  provider?: string;
  conversationId?: string;
  providerMessageIdReal?: string;
}

export interface Invoice {
  id: string;
  contactId: string;
  contactName: string;
  amount: number;
  date: string;
  dueDate: string;
  status: 'Pending' | 'Paid' | 'Overdue' | 'Canceled';
  description: string;
  paidAt?: string;
  reminderSent?: boolean;
}

export interface FinancialSpreading {
  months: FinancialMonth[];
  lastUpdated: string;
}

export interface FinancialMonth {
  month: string;
  revenue: number;
  expenses: number;
  endingBalance: number;
  nsfCount: number;
  negativeDays: number;
}

export interface AgencyBranding {
  name: string;
  primaryColor: string;
  heroHeadline?: string;
  heroSubheadline?: string;
  heroVideoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  physicalAddress?: string;
  socialConnections?: { platform: string; handle: string; connected: boolean }[];
  googleBusiness?: {
    connected: boolean;
    businessName?: string;
    location?: string;
    autoPilot: boolean;
    rating?: number;
    reviewCount?: number;
    lastSync?: string;
  };
  tierPrices?: { Bronze: number; Silver: number; Gold: number };
  mailerLite?: {
    groupId?: string;
    autoSync: boolean;
  };
}

export enum ViewMode {
  DASHBOARD = 'DASHBOARD',
  WORKFLOW_DETAIL = 'WORKFLOW_DETAIL',
  CRM = 'CRM',
  INBOX = 'INBOX',
  PORTAL = 'PORTAL',
  RESOURCES = 'RESOURCES',
  SETTINGS = 'SETTINGS',
  SIGNUP = 'SIGNUP',
  LOGIN = 'LOGIN',
  MARKETING = 'MARKETING',
  NEURAL_FLOOR = 'NEURAL_FLOOR',
  POWER_DIALER = 'POWER_DIALER',
  SALES_TRAINER = 'SALES_TRAINER',
  VOICE_RECEPTIONIST = 'VOICE_RECEPTIONIST',
  LEAD_MAP = 'LEAD_MAP',
  FORM_BUILDER = 'FORM_BUILDER',
  MARKET_INTEL = 'MARKET_INTEL',
  LENDERS = 'LENDERS',
  DOC_GENERATOR = 'DOC_GENERATOR',
  RENEWALS = 'RENEWALS',
  REPUTATION = 'REPUTATION',
  FUNDING_FLOW = 'FUNDING_FLOW',
  EXPENSES = 'EXPENSES',
  COMMISSIONS = 'COMMISSIONS',
  RISK_MONITOR = 'RISK_MONITOR',
  GRANTS = 'GRANTS',
  COURSE_BUILDER = 'COURSE_BUILDER',
  SERVICING = 'SERVICING',
  CREDIT_MEMO = 'CREDIT_MEMO',
  SITEMAP = 'SITEMAP',
  CLIENT_LANDING = 'CLIENT_LANDING',
  CALENDAR = 'CALENDAR',
  AUTOMATION = 'AUTOMATION',
  INVOICING = 'INVOICING',
  TRAINING = 'TRAINING',
  WEALTH_MANAGER = 'WEALTH_MANAGER',
  ONBOARDING = 'ONBOARDING',
  INFRA_MONITOR = 'INFRA_MONITOR',
  LEAD_SCOUT = 'LEAD_SCOUT',
  LENDER_ROOM = 'LENDER_ROOM',
  KNOWLEDGE_HUB = 'KNOWLEDGE_HUB',
  SCENARIO_RUNNER = 'SCENARIO_RUNNER',
  YOUTUBE_ANALYZER = 'YOUTUBE_ANALYZER',
  PARTNER_MARKETPLACE = 'PARTNER_MARKETPLACE',
  FORENSIC_HUB = 'FORENSIC_HUB',
  MESSAGING_BRIDGE = 'MESSAGING_BRIDGE',
  SUPERVISOR_TRIAGE = 'SUPERVISOR_TRIAGE',
  STRATEGY_SANDBOX = 'STRATEGY_SANDBOX',
  REVIEW_QUEUE = 'REVIEW_QUEUE',
  SYNDICATION = 'SYNDICATION',
  PARTNERS = 'PARTNERS',
  LANDING = 'LANDING',
  CHANNEL_MAPPER = 'CHANNEL_MAPPER',
  CONTACT_MERGE = 'CONTACT_MERGE',
  MERGE_JOBS = 'MERGE_JOBS',
  MERGE_QUEUE = 'MERGE_QUEUE',
  SUGGESTIONS = 'SUGGESTIONS',
  TEAM_MEMBERS = 'TEAM_MEMBERS',
  ON_CALL = 'ON_CALL',
  CHANNEL_POOLS = 'CHANNEL_POOLS',
  DEAD_LETTERS = 'DEAD_LETTERS',
  CHANNEL_HEALTH = 'CHANNEL_HEALTH',
  ADMIN_HEALTH = 'ADMIN_HEALTH',
  SRE_DASHBOARD = 'SRE_DASHBOARD',
  OUTBOX = 'OUTBOX',
  PUBLIC_API = 'PUBLIC_API',
  ADMIN_ROLES = 'ADMIN_ROLES',
  ADMIN_MEMBERS = 'ADMIN_MEMBERS',
  ADMIN_POLICIES = 'ADMIN_POLICIES',
  ADMIN_CONSENTS = 'ADMIN_CONSENTS',
  ADMIN_SUBSCRIPTIONS = 'ADMIN_SUBSCRIPTIONS',
  INVITE_ACCEPT = 'INVITE_ACCEPT',
  PRICING = 'PRICING',
  BILLING = 'BILLING',
  COMMUNICATION_PREFERENCES = 'COMMUNICATION_PREFERENCES',
  UPLOAD_CREDIT_REPORT = 'UPLOAD_CREDIT_REPORT',
  DISPUTE_FACTS_REVIEW = 'DISPUTE_FACTS_REVIEW',
  DRAFT_PREVIEW = 'DRAFT_PREVIEW',
  FINAL_LETTER = 'FINAL_LETTER',
  DISPUTE_LETTER_PREVIEW = 'DISPUTE_LETTER_PREVIEW',
  MAILING_AUTHORIZATION = 'MAILING_AUTHORIZATION',
  CLIENT_MAILING_APPROVALS = 'CLIENT_MAILING_APPROVALS',
  TERMS = 'TERMS',
  PRIVACY = 'PRIVACY',
  AI_DISCLOSURE = 'AI_DISCLOSURE',
  REFUND_POLICY = 'REFUND_POLICY',
  DISCLAIMERS = 'DISCLAIMERS',
  MEMBERSHIP_AGREEMENT = 'MEMBERSHIP_AGREEMENT',
  SMS_TERMS = 'SMS_TERMS',
  ADMIN_SMS_TEMPLATES = 'ADMIN_SMS_TEMPLATES',
  ADMIN_MAILING_QUEUE = 'ADMIN_MAILING_QUEUE',
  ADMIN_MAILING_DASHBOARD = 'ADMIN_MAILING_DASHBOARD',
  ADMIN_LEGAL_DOCS = 'ADMIN_LEGAL_DOCS',
  ADMIN_EMAIL_PROVIDERS = 'ADMIN_EMAIL_PROVIDERS',
  ADMIN_EMAIL_ROUTING = 'ADMIN_EMAIL_ROUTING',
  ADMIN_EMAIL_LOGS = 'ADMIN_EMAIL_LOGS',
  ADMIN_WORKFLOWS = 'ADMIN_WORKFLOWS',
  ADMIN_CMS = 'ADMIN_CMS'
}

export interface FundingOffer {
  id: string;
  lenderName: string;
  amount: number;
  term: string;
  rate: string;
  payment: string;
  paymentAmount: number;
  status: 'Sent' | 'Accepted' | 'Declined';
  dateSent: string;
  stips?: string;
  signature?: string;
  signedDate?: string;
  tier?: number;
  aiAnalysis?: any;
}

export interface ApplicationSubmission {
  id: string;
  contactId: string;
  contactName: string;
  lenderId: string;
  lenderName: string;
  status: 'Draft' | 'Sent' | 'Approved' | 'Declined';
  dateSent: string;
  coverLetter: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  type: 'success' | 'alert' | 'info';
}

export interface LedgerEntry {
  id: string;
  date: string;
  type: 'Repayment' | 'Draw' | 'Funding' | 'Interest' | 'Fee';
  amount: number;
  description: string;
  status: 'Posted' | 'Pending';
}

export interface NegativeItem {
  id: string;
  title: string;
  description: string;
  status: string;
}

export interface Subscription {
  plan: 'Free' | 'Bronze' | 'Silver' | 'Gold';
  status: string;
  renewalDate: string;
  price: number;
  features: string[];
}

export interface ComplianceRecord {
  kycStatus: string;
  kybStatus: string;
  ofacCheck: string;
  lastCheckDate: string;
  riskScore: 'Low' | 'Medium' | 'High';
  flags: string[];
}

export interface Stipulation {
  id: string;
  name: string;
  description: string;
  status: 'Pending' | 'Uploaded' | 'Verified';
  uploadDate?: string;
  fileUrl?: string;
  aiVerification?: any;
}

export interface FundedDeal {
  id: string;
  lenderName: string;
  fundedDate: string;
  originalAmount: number;
  currentBalance: number;
  termLengthMonths: number;
  paymentFrequency: string;
  paymentAmount: number;
  totalPayback: number;
  status: 'Active' | 'Paid';
  renewalEligibleDate: string;
  paymentsMade: number;
}

export interface RescuePlan {
  approvalProbability: number;
  estimatedRecoveryTime: string;
  dealKillers: { issue: string; impact: 'High' | 'Medium' | 'Low' }[];
  diagnosis: string;
  prescription: { step: string; timeframe: string }[];
}

export interface CreditMemo {
  id: string;
  dateCreated: string;
  summary: string;
  recommendation: 'Approve' | 'Decline' | 'Condition';
  conditions?: string;
  strengths: string[];
  weaknesses: string[];
  mitigants: string[];
  metrics: { dscr: number; monthlyFreeCashFlow: number };
  visualUrl?: string;
}

export interface BusinessPlan {
  id: string;
  companyName: string;
  lastUpdated: string;
  sections: any;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
  modules: any[];
}

export interface Lender {
  id: string;
  name: string;
  logo: string;
  type: 'Fintech' | 'Bank' | 'Credit Union' | 'SBA';
  minScore: number;
  minRevenue: number;
  minTimeInBusinessMonths: number;
  maxAmount: number;
  description: string;
  applicationLink: string;
  matchCriteria?: any;
  lastUpdated?: string;
}

export interface PipelineRule {
  id: string;
  name: string;
  isActive: boolean;
  trigger: any;
  conditions: any[];
  actions: any[];
}

export interface MarketReport {
  competitors: any[];
  fundingAngles: string[];
  digitalGap: string;
  swot: any;
}

export interface Investor {
  id: string;
  name: string;
  email: string;
  totalCommitted: number;
  totalDeployed: number;
  activeDeals: number;
  status: 'Active' | 'Inactive';
}

export interface RiskAlert {
  id: string;
  contactId: string;
  contactName: string;
  type: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  description: string;
  date: string;
  status: 'Active' | 'Resolved';
  source: string;
}

export interface LeadForm {
  id: string;
  name: string;
  industry: string;
  themeColor: string;
  headline: string;
  subhead: string;
  benefits: string[];
  fields: any[];
  buttonText: string;
  totalSubmissions: number;
}

export interface ActiveLoan {
  id: string;
  contactId: string;
  contactName: string;
  principal: number;
  paybackAmount: number;
  balance: number;
  termMonths: number;
  startDate: string;
  paymentFrequency: string;
  paymentAmount: number;
  status: 'Current' | 'Late' | 'Default';
  missedPayments: number;
  payments: any[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface SalesBattleCard {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  predictedObjections: { objection: string; rebuttal: string }[];
  closingStrategy: string;
}

export interface BusinessProfile {
  legalName: string;
  dba?: string;
  taxId: string;
  structure: string;
  industry: string;
  ownershipPercentage: number;
  establishedDate: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  missionStatement?: string;
  impactSummary?: string;
}

export interface CreditAnalysis {
  analyzedDate: string;
  score: number;
  utilization: number;
  inquiries: number;
  derogatoryMarks: number;
  openAccounts: number;
  status: string;
  extractedName?: string;
  extractedAddress?: string;
}

export interface BankAccount {
  id: string;
  institutionName: string;
  last4: string;
  status: string;
  lastSynced: string;
  balance: number;
}

export interface ForensicReport {
  id: string;
  issuedAt: string;
  certifiedBy: string;
  metadataAudit: string[];
  logicCheck: string;
  trustScore: number;
}

export interface MarketPulse {
  id: string;
  lenderName: string;
  amount: number;
  industry: string;
  timestamp: string;
}

export interface TrainingPair {
  id: string;
  scenario: string;
  aiResponse: string;
  humanCorrection: string;
  date: string;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  category: string;
  uploadedAt: string;
  isActive: boolean;
  sourceUrl?: string;
  trustScore?: number;
}

export interface ContentAudit {
  id: string;
  platform: string;
  trustScore: number;
  title: string;
  sourceUrl: string;
  strategicValue: string;
  claims: { statement: string; verdict: string; evidence: string }[];
  groundingUrls: { title: string; uri: string }[];
  suggestedAction?: { logic: string };
}

export interface AiEmployee {
  id: string;
  name: string;
  role: 'Analyst' | 'Scout' | 'Underwriter' | 'Closer' | 'Custom';
  status: 'Idle' | 'Researching' | 'Auditing' | 'Delegating' | 'Interfacing';
  currentTask?: string;
}

export interface InboxThread {
  id: string;
  contactId: string;
  contactName: string;
  contactAvatar: string;
  unreadCount: number;
  channel: string;
  autoPilot: boolean;
  messages: UnifiedMessage[];
  lastMessage: UnifiedMessage;
}

export interface UnifiedMessage extends Message {
  threadId: string;
  channel: string;
  direction: 'inbound' | 'outbound';
}

export interface MessagingChannel {
  id: string;
  platform: string;
  status: string;
  autoReplyCount: number;
  lastSync: string;
  webhookUrl: string;
}

export interface AffiliateTool {
  id: string;
  name: string;
  category: string;
  description: string;
  payoutInfo: string;
  link: string;
  logo: string;
  isRecommended: boolean;
}

export interface VoiceAgentConfig {
  id: string;
  name: string;
  voiceName: string;
  openingLine: string;
  systemInstruction: string;
  knowledgeBase: string;
  isActive: boolean;
}

export interface CallLog {
  id: string;
  timestamp: string;
  duration: string;
  summary: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  category: string;
  variables: string[];
  content: string;
}

export interface ApiUsageRecord {
  id: string;
  service: string;
  cost: number;
  timestamp: string;
}

export interface ApiThreshold {
  service: string;
  limit: number;
  current: number;
  isFrozen: boolean;
}

export interface CreditCardProduct {
  id: string;
  name: string;
  issuer: string;
  network: string;
  minScore: number;
  bureauPulled: string;
  annualFee: number;
  introOffer: string;
  applicationLink: string;
  recommendedFor: string;
}

export interface MarketingAutomation {
  id: string;
  name: string;
  status: string;
}

export interface SocialPost {
  id: string;
  platform: 'TikTok' | 'Instagram' | 'LinkedIn' | 'Facebook' | 'YouTube';
  content: string;
  videoUrl: string;
  status: string;
  aspectRatio: '9:16' | '16:9';
}

export interface DripCampaign {
  id: string;
  name: string;
  status: 'Active' | 'Paused' | 'Draft';
  audience: string;
  steps: EmailStep[];
  stats: { sent: number; opened: number; clicked: number };
}

export interface EmailStep {
  id: string;
  subject: string;
  body: string;
  delayDays: number;
}

export interface Review {
  id: string;
  contactName: string;
  company: string;
  rating: number;
  comment: string;
  date: string;
  source: 'Google' | 'Internal';
  status: 'Pending' | 'Replied';
  reply?: string;
}

export interface Grant {
  id: string;
  name: string;
  provider: string;
  amount: number;
  deadline: string;
  description: string;
  status: 'Identified' | 'Drafting' | 'Submitted' | 'Won' | 'Lost';
  matchScore: number;
  requirements: string[];
  url: string;
}

export interface InvestmentIdea {
  id: string;
  title: string;
  description: string;
  category: string;
  roiPotential: string;
  steps: string[];
  riskLevel: 'Low' | 'Medium' | 'High';
  visualUrl?: string;
}

export interface Tier2Data {
  reserveBalance: number;
  monthsReserveGoal: number;
  paymentsMadeCount: number;
  isEligibleForTier2: boolean;
}

export interface EnrichedData {
  company: string;
  description: string;
  ceo: string;
  revenue: string;
  phone: string;
  address: string;
  industry: string;
  icebreakers: string[];
}

export interface AutoReplyRule {
  id: string;
  trigger: string;
  response: string;
  isActive: boolean;
}

export interface SalesSession {
  id: string;
  date: string;
  scenario: string;
  duration: string;
  score: number;
  summary: string;
  actionItems: string[];
  feedback: string;
}

export interface FinancialEntry {
  id: string;
  type: 'Revenue' | 'Expense';
  entity: string;
  amount: number;
  category: string;
  frequency: 'One-time' | 'Monthly' | 'Yearly';
  date: string;
  status: 'Paid' | 'Pending';
  description: string;
}

export interface FundingFlowStep {
  id: number;
  title: string;
  desc: string;
}

export interface CommissionProfile {
  id: string;
  agentName: string;
  splitPercentage: number;
  totalFunded: number;
  totalCommissionEarned: number;
  currentDrawBalance: number;
  contractStatus: 'Signed' | 'Pending';
}

export interface PayoutRecord {
  id: string;
  agentId: string;
  dealId: string;
  dealValue: number;
  grossCommission: number;
  splitAmount: number;
  drawDeduction: number;
  netPayout: number;
  status: 'Paid' | 'Pending';
  date: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
}

export interface Syndication {
  id: string;
  investorId: string;
  dealId: string;
  amount: number;
  percent: number;
}

export interface ReferralLead {
  id: string;
  name: string;
  date: string;
  status: string;
  commission: number;
}

export interface ReferralData {
  totalClicks: number;
  totalSignups: number;
  commissionPending: number;
  commissionPaid: number;
  referralLink: string;
  leads: ReferralLead[];
}
