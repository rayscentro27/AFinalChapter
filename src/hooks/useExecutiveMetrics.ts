import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { data } from '../../adapters';
import { supabase } from '../../lib/supabaseClient';

const INTERNAL_ROLES = new Set(['admin', 'supervisor']);
const STALE_APPROVED_DAYS = 14;
const EXPIRING_SOON_HOURS = 72;

type ContactSummary = {
  id: string;
  status: string;
  clientTasks?: Array<{
    status?: string;
    type?: string;
    signal?: string;
  }>;
};

type FundingProfileRow = {
  tenant_id: string;
  current_stage: string;
  readiness_status: string;
  updated_at: string | null;
};

type FundingStepRow = {
  tenant_id: string;
  step_status: string;
};

type ClientTaskRow = {
  tenant_id: string;
  status: string;
  priority: string;
  task_category: string | null;
  template_key: string | null;
  type: string | null;
  dismissed_at: string | null;
};

type TenantOnlyRow = { tenant_id: string };

type BusinessStepRow = {
  tenant_id: string;
  step_status: string;
  is_required: boolean;
};

type CapitalProfileRow = {
  tenant_id: string;
  reserve_confirmed: boolean;
  business_growth_positioned: boolean;
  capital_setup_status: string;
};

type CapitalAllocationRow = {
  tenant_id: string;
  selected_path: 'business_growth' | 'trading_education' | 'grant_funding' | null;
  current_state: string;
};

type AdvancedAccessRow = {
  tenant_id: string;
  feature_key: string;
  opted_in: boolean;
  intro_video_watched_at: string | null;
  disclaimer_accepted_at: string | null;
  access_status: string;
  unlocked_by_rule: boolean;
};

type GrantMatchRow = {
  tenant_id: string;
  status: string;
};

type GrantDraftRow = {
  tenant_id: string;
  status: string;
};

type GrantSubmissionRow = {
  tenant_id: string;
  status: string;
};

type ApprovalQueueRow = {
  tenant_id: string;
  proposal_id: string | null;
  strategy_id: string | null;
  status: string;
  approval_status: string | null;
};

type ReviewLifecycleRow = {
  approval_status: string | null;
  is_published: boolean | null;
  expires_at: string | null;
  expired_at: string | null;
  updated_at: string | null;
};

export type ExecutiveMetric = {
  label: string;
  value: number;
  helper: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

export type DistributionRow = {
  label: string;
  count: number;
  helper: string;
};

export type AttentionRow = {
  label: string;
  count: number;
  helper: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
};

export type ExecutiveSnapshot = {
  overview: ExecutiveMetric[];
  stageDistribution: DistributionRow[];
  bottlenecks: AttentionRow[];
  commonBlockers: Array<{ label: string; count: number }>;
  capitalPath: AttentionRow[];
  tradingEngagement: AttentionRow[];
  grantEngagement: AttentionRow[];
  reviewWorkload: AttentionRow[];
  dependencyNotes: string[];
  totalClients: number;
};

function parseTime(value?: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isExpiredLifecycle(row: ReviewLifecycleRow) {
  if (row.expired_at) return true;
  const expiresAt = parseTime(row.expires_at);
  return expiresAt !== null && expiresAt <= Date.now();
}

function isExpiringSoon(row: ReviewLifecycleRow) {
  if (isExpiredLifecycle(row)) return false;
  const expiresAt = parseTime(row.expires_at);
  if (expiresAt === null) return false;
  const hours = (expiresAt - Date.now()) / (1000 * 60 * 60);
  return hours > 0 && hours <= EXPIRING_SOON_HOURS;
}

function isOldApproved(row: ReviewLifecycleRow) {
  if (String(row.approval_status || '').toLowerCase() !== 'approved') return false;
  const updatedAt = parseTime(row.updated_at);
  if (updatedAt === null) return false;
  return Date.now() - updatedAt >= STALE_APPROVED_DAYS * 24 * 60 * 60 * 1000;
}

function toneForCount(count: number, preferred: ExecutiveMetric['tone'] = 'warning') {
  return count > 0 ? preferred : 'default';
}

function uniqueTenantCount(rows: Array<{ tenant_id: string }>) {
  return new Set(rows.map((row) => row.tenant_id).filter(Boolean)).size;
}

async function safeSelect<T extends Record<string, unknown>>(
  table: string,
  select: string,
  dependencyNotes: string[],
  options?: { orderBy?: string; ascending?: boolean; limit?: number }
): Promise<T[]> {
  let query = supabase.from(table).select(select);
  if (options?.orderBy) {
    query = query.order(options.orderBy, { ascending: options.ascending ?? false });
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data: rows, error } = await query;
  if (error) {
    dependencyNotes.push(`${table}: ${error.message || 'query unavailable'}`);
    return [];
  }
  return ((rows || []) as T[]);
}

function summarizeExecutiveMetrics(input: {
  contacts: ContactSummary[];
  fundingProfiles: FundingProfileRow[];
  fundingSteps: FundingStepRow[];
  clientTasks: ClientTaskRow[];
  creditReports: TenantOnlyRow[];
  creditAnalysis: TenantOnlyRow[];
  businessProfiles: TenantOnlyRow[];
  businessSetupProgress: BusinessStepRow[];
  capitalProfiles: CapitalProfileRow[];
  capitalAllocations: CapitalAllocationRow[];
  advancedAccess: AdvancedAccessRow[];
  grantMatches: GrantMatchRow[];
  grantDrafts: GrantDraftRow[];
  grantSubmissions: GrantSubmissionRow[];
  approvalQueue: ApprovalQueueRow[];
  strategyRows: ReviewLifecycleRow[];
  optionsRows: ReviewLifecycleRow[];
  signalRows: ReviewLifecycleRow[];
  dependencyNotes: string[];
}): ExecutiveSnapshot {
  const tenantIds = new Set<string>();
  input.contacts.forEach((contact) => tenantIds.add(contact.id));
  [
    ...input.fundingProfiles,
    ...input.creditReports,
    ...input.creditAnalysis,
    ...input.businessProfiles,
    ...input.capitalProfiles,
    ...input.capitalAllocations,
    ...input.advancedAccess,
    ...input.grantMatches,
    ...input.grantDrafts,
    ...input.grantSubmissions,
    ...input.approvalQueue,
  ].forEach((row) => {
    if (row.tenant_id) tenantIds.add(row.tenant_id);
  });

  const totalClients = tenantIds.size;
  const fundingByTenant = new Map(input.fundingProfiles.map((row) => [row.tenant_id, row]));
  const creditReportTenants = new Set(input.creditReports.map((row) => row.tenant_id));
  const creditAnalysisTenants = new Set(input.creditAnalysis.map((row) => row.tenant_id));
  const businessProfileTenants = new Set(input.businessProfiles.map((row) => row.tenant_id));
  const requiredBusinessIncompleteTenants = new Set(
    input.businessSetupProgress
      .filter((row) => row.is_required && row.step_status !== 'completed')
      .map((row) => row.tenant_id)
  );
  const activeGrantTenants = new Set(
    input.grantMatches
      .filter((row) => ['shortlisted', 'drafting', 'submitted'].includes(String(row.status || '').toLowerCase()))
      .map((row) => row.tenant_id)
  );

  const stageCounts = new Map<string, number>([
    ['credit_optimization', 0],
    ['business_foundation', 0],
    ['funding_roadmap', 0],
    ['application_loop', 0],
    ['post_funding_capital', 0],
    ['untracked', 0],
  ]);

  tenantIds.forEach((tenantId) => {
    const stage = fundingByTenant.get(tenantId)?.current_stage || 'untracked';
    stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
  });

  const activeRoadmapSteps = input.fundingSteps.filter((row) => row.step_status === 'active').length;
  const postFundingClients = stageCounts.get('post_funding_capital') || 0;
  const missingCreditUploads = Math.max(totalClients - creditReportTenants.size, 0);
  const unresolvedCreditReview = Array.from(creditReportTenants).filter((tenantId) => !creditAnalysisTenants.has(tenantId)).length;
  const incompleteBusinessFoundation = Array.from(tenantIds).filter(
    (tenantId) => !businessProfileTenants.has(tenantId) || requiredBusinessIncompleteTenants.has(tenantId)
  ).length;
  const blockedReadiness = input.fundingProfiles.filter((row) => row.readiness_status === 'blocked').length;
  const urgentTasks = input.clientTasks.filter((row) => row.dismissed_at === null && row.status !== 'completed' && row.priority === 'urgent');

  const blockerCounter = new Map<string, number>();
  urgentTasks.forEach((row) => {
    const key = String(row.task_category || row.template_key || row.type || 'uncategorized').replace(/_/g, ' ');
    blockerCounter.set(key, (blockerCounter.get(key) || 0) + 1);
  });
  const commonBlockers = Array.from(blockerCounter.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  const capitalProtectionComplete = input.capitalProfiles.filter(
    (row) => row.reserve_confirmed && ['ready', 'completed'].includes(String(row.capital_setup_status || '').toLowerCase())
  ).length;
  const capitalProtectionIncomplete = Math.max(postFundingClients - capitalProtectionComplete, 0);
  const businessGrowthSelected = input.capitalAllocations.filter((row) => row.selected_path === 'business_growth' && row.current_state === 'active').length;
  const tradingSelected = input.capitalAllocations.filter((row) => row.selected_path === 'trading_education' && row.current_state === 'active').length;
  const grantSelected = input.capitalAllocations.filter((row) => row.selected_path === 'grant_funding' && row.current_state === 'active').length;
  const businessGrowthPositioned = input.capitalProfiles.filter((row) => row.business_growth_positioned).length;

  const tradingRows = input.advancedAccess.filter((row) => row.feature_key === 'advanced_trading');
  const tradingGated = tradingRows.filter((row) => ['locked', 'eligible_pending', 'in_progress'].includes(String(row.access_status || '').toLowerCase())).length;
  const tradingOptedIn = tradingRows.filter((row) => row.opted_in).length;
  const tradingVideoComplete = tradingRows.filter((row) => Boolean(row.intro_video_watched_at)).length;
  const tradingReady = tradingRows.filter((row) => ['ready', 'unlocked'].includes(String(row.access_status || '').toLowerCase())).length;

  const grantPrepInProgress = input.grantDrafts.filter((row) => ['draft', 'needs_review', 'approved_to_submit'].includes(String(row.status || '').toLowerCase())).length;
  const grantSubmitted = input.grantSubmissions.length;
  const grantDecisionsLogged = input.grantSubmissions.filter((row) => ['accepted', 'rejected', 'awarded', 'denied'].includes(String(row.status || '').toLowerCase())).length;

  const pendingQueueRows = input.approvalQueue.filter((row) => {
    const status = String(row.status || '').toLowerCase();
    const approvalStatus = String(row.approval_status || '').toLowerCase();
    return approvalStatus !== 'approved' && approvalStatus !== 'rejected' && status !== 'approved' && status !== 'rejected' && status !== 'resolved';
  });
  const pendingSignalReviews = pendingQueueRows.filter((row) => Boolean(row.proposal_id)).length;
  const pendingStrategyReviews = Math.max(pendingQueueRows.length - pendingSignalReviews, 0);

  const approvedLifecycleRows = [...input.strategyRows, ...input.optionsRows, ...input.signalRows].filter(
    (row) => String(row.approval_status || '').toLowerCase() === 'approved'
  );
  const reviewPublished = approvedLifecycleRows.filter((row) => row.is_published === true && !isExpiredLifecycle(row)).length;
  const reviewUnpublished = approvedLifecycleRows.filter((row) => row.is_published !== true && !isExpiredLifecycle(row)).length;
  const reviewExpired = approvedLifecycleRows.filter(isExpiredLifecycle).length;
  const reviewStale = approvedLifecycleRows.filter(
    (row) => isExpiredLifecycle(row) || isExpiringSoon(row) || (row.is_published !== true) || isOldApproved(row)
  ).length + pendingQueueRows.filter((row) => {
    const age = parseTime((row as unknown as { created_at?: string }).created_at || null);
    return age !== null && Date.now() - age >= STALE_APPROVED_DAYS * 24 * 60 * 60 * 1000;
  }).length;

  const topPendingReviewCount = pendingStrategyReviews + pendingSignalReviews;

  input.dependencyNotes.push(
    'Trading content views, educational signal engagement, and paper-trading journal counts are not persisted centrally yet, so this dashboard reports gating and access-state counts only.',
    'Grant opportunity views and saved-opportunity events are not persisted yet. Current grant engagement uses shortlist, draft, and submission workflow state.',
    'If platform scale grows, review workload should move to a backend aggregate endpoint instead of direct table aggregation in the frontend.'
  );

  return {
    overview: [
      { label: 'Clients Tracked', value: totalClients, helper: 'Tenants/clients visible to the internal dashboard right now.' },
      { label: 'Blocked Readiness', value: blockedReadiness, helper: 'Funding profiles currently marked blocked.', tone: toneForCount(blockedReadiness, 'warning') },
      { label: 'Post-Funding', value: postFundingClients, helper: 'Clients already handed into post-funding capital stage.', tone: toneForCount(postFundingClients, 'success') },
      { label: 'Trading Ready', value: tradingReady, helper: 'Advanced trading access is ready or unlocked.', tone: toneForCount(tradingReady, 'success') },
      { label: 'Grant Workflows', value: activeGrantTenants.size, helper: 'Clients with active shortlist, draft, or submission grant activity.', tone: toneForCount(activeGrantTenants.size, 'success') },
      { label: 'Pending Reviews', value: topPendingReviewCount, helper: 'Strategy and signal items still waiting on reviewer action.', tone: toneForCount(topPendingReviewCount, 'danger') },
    ],
    stageDistribution: [
      { label: 'Credit Optimization', count: stageCounts.get('credit_optimization') || 0, helper: 'Early-stage clients still building credit readiness.' },
      { label: 'Business Foundation', count: stageCounts.get('business_foundation') || 0, helper: 'Clients working through business setup and consistency steps.' },
      { label: 'Funding Roadmap', count: stageCounts.get('funding_roadmap') || 0, helper: 'Clients with roadmap-ready progress but not yet in application loop.' },
      { label: 'Application Loop', count: stageCounts.get('application_loop') || 0, helper: 'Clients actively working lender/application activity.' },
      { label: 'Post-Funding Capital', count: postFundingClients, helper: 'Clients moved into reserve-first capital planning.' },
      { label: 'Untracked', count: stageCounts.get('untracked') || 0, helper: 'Clients without a persisted funding profile yet.' },
    ],
    bottlenecks: [
      { label: 'Missing Credit Uploads', count: missingCreditUploads, helper: 'Clients with no persisted credit report on file yet.', tone: toneForCount(missingCreditUploads, 'danger') },
      { label: 'Credit Review Unresolved', count: unresolvedCreditReview, helper: 'Credit reports exist, but analysis/readiness output is still missing.', tone: toneForCount(unresolvedCreditReview, 'warning') },
      { label: 'Business Foundation Incomplete', count: incompleteBusinessFoundation, helper: 'Business setup profile or required setup progress is still incomplete.', tone: toneForCount(incompleteBusinessFoundation, 'warning') },
      { label: 'Urgent Workflow Tasks', count: urgentTasks.length, helper: 'Open urgent client tasks currently driving operational pressure.', tone: toneForCount(urgentTasks.length, 'danger') },
      { label: 'Active Roadmap Steps', count: activeRoadmapSteps, helper: 'Funding strategy steps currently marked active.', tone: toneForCount(activeRoadmapSteps, 'success') },
    ],
    commonBlockers,
    capitalPath: [
      { label: 'Protection Complete', count: capitalProtectionComplete, helper: 'Reserve confirmed and capital setup marked ready/completed.', tone: toneForCount(capitalProtectionComplete, 'success') },
      { label: 'Protection Incomplete', count: capitalProtectionIncomplete, helper: 'Post-funding clients that still need reserve-first completion.', tone: toneForCount(capitalProtectionIncomplete, 'warning') },
      { label: 'Business Growth Selected', count: businessGrowthSelected, helper: 'Capital allocation currently points to Business Growth.', tone: toneForCount(businessGrowthSelected, 'success') },
      { label: 'Trading Selected', count: tradingSelected, helper: 'Capital allocation currently points to Trading Education.', tone: toneForCount(tradingSelected, 'warning') },
      { label: 'Grant Path Selected', count: grantSelected, helper: 'Capital allocation currently points to Grant Funding.', tone: toneForCount(grantSelected, 'warning') },
      { label: 'Growth Positioned', count: businessGrowthPositioned, helper: 'Capital profiles explicitly positioned for business growth.', tone: toneForCount(businessGrowthPositioned, 'success') },
    ],
    tradingEngagement: [
      { label: 'Gated Users', count: tradingGated, helper: 'Users still locked or mid-gating in advanced trading access.', tone: toneForCount(tradingGated, 'warning') },
      { label: 'Opted In', count: tradingOptedIn, helper: 'Users who explicitly opted into the trading education track.', tone: toneForCount(tradingOptedIn, 'success') },
      { label: 'Video Complete', count: tradingVideoComplete, helper: 'Users who completed the intro education video checkpoint.', tone: toneForCount(tradingVideoComplete, 'success') },
      { label: 'Ready / Unlocked', count: tradingReady, helper: 'Users cleared to access the unlocked paper-trading experience.', tone: toneForCount(tradingReady, 'success') },
    ],
    grantEngagement: [
      { label: 'Active Shortlists', count: activeGrantTenants.size, helper: 'Clients with live shortlisted or drafting grant workflows.', tone: toneForCount(activeGrantTenants.size, 'success') },
      { label: 'Prep In Progress', count: grantPrepInProgress, helper: 'Grant drafts currently in educational prep or review states.', tone: toneForCount(grantPrepInProgress, 'warning') },
      { label: 'Submissions Logged', count: grantSubmitted, helper: 'Grant submission records logged across the system.', tone: toneForCount(grantSubmitted, 'success') },
      { label: 'Decisions Logged', count: grantDecisionsLogged, helper: 'Submissions that already carry an accepted/rejected/awarded/denied outcome.', tone: toneForCount(grantDecisionsLogged, 'success') },
    ],
    reviewWorkload: [
      { label: 'Pending Strategy Reviews', count: pendingStrategyReviews, helper: 'Queue items waiting on strategy-side review action.', tone: toneForCount(pendingStrategyReviews, 'danger') },
      { label: 'Pending Signal Reviews', count: pendingSignalReviews, helper: 'Queue items waiting on signal-side review action.', tone: toneForCount(pendingSignalReviews, 'danger') },
      { label: 'Published Content', count: reviewPublished, helper: 'Approved research content currently published and not expired.', tone: toneForCount(reviewPublished, 'success') },
      { label: 'Unpublished Approved', count: reviewUnpublished, helper: 'Approved research content waiting on explicit publish action.', tone: toneForCount(reviewUnpublished, 'warning') },
      { label: 'Expired Content', count: reviewExpired, helper: 'Approved content past lifecycle expiration and hidden from portal-safe reads.', tone: toneForCount(reviewExpired, 'danger') },
      { label: 'Stale Attention', count: reviewStale, helper: 'Expired, old, or still-unpublished approved content needing attention.', tone: toneForCount(reviewStale, 'warning') },
    ],
    dependencyNotes: Array.from(new Set(input.dependencyNotes)),
    totalClients,
  };
}

export function useExecutiveMetrics() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<ExecutiveSnapshot | null>(null);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      if (!user?.id) {
        if (!active) return;
        setCheckingAccess(false);
        setIsAuthorized(false);
        return;
      }

      setCheckingAccess(true);
      const accessRes = await supabase.rpc('nexus_is_master_admin_compat');
      if (!active) return;

      if (accessRes.error) {
        setIsAuthorized(INTERNAL_ROLES.has(String(user.role || '').toLowerCase()));
      } else {
        setIsAuthorized(Boolean(accessRes.data) || INTERNAL_ROLES.has(String(user.role || '').toLowerCase()));
      }
      setCheckingAccess(false);
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [user?.id, user?.role]);

  async function refresh() {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }

    setRefreshing(true);
    setLoading(true);
    setError('');
    const dependencyNotes: string[] = [];

    try {
      const contactsPromise = data.getContacts().catch(() => {
        dependencyNotes.push('contacts: unable to load contact registry');
        return [] as ContactSummary[];
      });

      const [
        contacts,
        fundingProfiles,
        fundingSteps,
        clientTasks,
        creditReports,
        creditAnalysis,
        businessProfiles,
        businessSetupProgress,
        capitalProfiles,
        capitalAllocations,
        advancedAccess,
        grantMatches,
        grantDrafts,
        grantSubmissions,
        approvalQueue,
        strategyRows,
        optionsRows,
        signalRows,
      ] = await Promise.all([
        contactsPromise,
        safeSelect<FundingProfileRow>('funding_profiles', 'tenant_id,current_stage,readiness_status,updated_at', dependencyNotes, { limit: 5000 }),
        safeSelect<FundingStepRow>('funding_strategy_steps', 'tenant_id,step_status', dependencyNotes, { limit: 5000 }),
        safeSelect<ClientTaskRow>('client_tasks', 'tenant_id,status,priority,task_category,template_key,type,dismissed_at', dependencyNotes, { limit: 5000 }),
        safeSelect<TenantOnlyRow>('credit_reports', 'tenant_id', dependencyNotes, { limit: 5000 }),
        safeSelect<TenantOnlyRow>('credit_analysis', 'tenant_id', dependencyNotes, { limit: 5000 }),
        safeSelect<TenantOnlyRow>('business_profiles', 'tenant_id', dependencyNotes, { limit: 5000 }),
        safeSelect<BusinessStepRow>('business_setup_progress', 'tenant_id,step_status,is_required', dependencyNotes, { limit: 5000 }),
        safeSelect<CapitalProfileRow>('capital_profiles', 'tenant_id,reserve_confirmed,business_growth_positioned,capital_setup_status', dependencyNotes, { limit: 5000 }),
        safeSelect<CapitalAllocationRow>('capital_allocation_choices', 'tenant_id,selected_path,current_state', dependencyNotes, { limit: 5000 }),
        safeSelect<AdvancedAccessRow>('user_advanced_access', 'tenant_id,feature_key,opted_in,intro_video_watched_at,disclaimer_accepted_at,access_status,unlocked_by_rule', dependencyNotes, { limit: 5000 }),
        safeSelect<GrantMatchRow>('grant_matches', 'tenant_id,status', dependencyNotes, { limit: 5000 }),
        safeSelect<GrantDraftRow>('grant_application_drafts', 'tenant_id,status', dependencyNotes, { limit: 5000 }),
        safeSelect<GrantSubmissionRow>('grant_submissions', 'tenant_id,status', dependencyNotes, { limit: 5000 }),
        safeSelect<ApprovalQueueRow>('approval_queue', 'tenant_id,proposal_id,strategy_id,status,approval_status', dependencyNotes, { limit: 5000 }),
        safeSelect<ReviewLifecycleRow>('strategy_performance', 'approval_status,is_published,expires_at,expired_at,updated_at', dependencyNotes, { limit: 5000 }),
        safeSelect<ReviewLifecycleRow>('options_strategy_performance', 'approval_status,is_published,expires_at,expired_at,updated_at', dependencyNotes, { limit: 5000 }),
        safeSelect<ReviewLifecycleRow>('reviewed_signal_proposals', 'approval_status,is_published,expires_at,expired_at,updated_at', dependencyNotes, { limit: 5000 }),
      ]);

      setSnapshot(
        summarizeExecutiveMetrics({
          contacts: contacts as ContactSummary[],
          fundingProfiles,
          fundingSteps,
          clientTasks,
          creditReports,
          creditAnalysis,
          businessProfiles,
          businessSetupProgress,
          capitalProfiles,
          capitalAllocations,
          advancedAccess,
          grantMatches,
          grantDrafts,
          grantSubmissions,
          approvalQueue,
          strategyRows,
          optionsRows,
          signalRows,
          dependencyNotes,
        })
      );
    } catch (err: any) {
      setError(String(err?.message || 'Unable to load executive analytics.'));
      setSnapshot(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!checkingAccess) {
      void refresh();
    }
  }, [checkingAccess, isAuthorized]);

  return useMemo(
    () => ({
      user,
      checkingAccess,
      isAuthorized,
      loading,
      refreshing,
      error,
      snapshot,
      refresh,
    }),
    [user, checkingAccess, isAuthorized, loading, refreshing, error, snapshot]
  );
}