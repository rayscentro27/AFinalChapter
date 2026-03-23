import type { HandlerEvent } from '@netlify/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { proxyToOracle } from './oracle_proxy';

type JsonRecord = Record<string, unknown>;

type TenantRow = {
  id: string;
  name: string;
  status: string | null;
  created_at: string | null;
};

type FundingProfileRow = {
  tenant_id: string;
  current_stage: string;
  readiness_status: string;
  updated_at: string | null;
};

type FundingStepRow = {
  tenant_id: string;
  step_key: string | null;
  step_status: string;
  updated_at: string | null;
};

type FundingApplicationRow = {
  tenant_id: string;
  decision_status: string;
  submitted_at: string | null;
  updated_at: string | null;
};

type FundingResultRow = {
  tenant_id: string;
  result_status: string;
  outcome_at: string | null;
  updated_at: string | null;
};

type FundingOutcomeRow = {
  tenant_id: string;
  outcome_status: string;
  approved_amount_cents: number | null;
  approval_date: string | null;
  updated_at: string | null;
};

type ClientTaskRow = {
  tenant_id: string;
  status: string;
  priority: string;
  task_category: string | null;
  template_key: string | null;
  type: string | null;
  dismissed_at: string | null;
  due_date: string | null;
  updated_at: string | null;
};

type TenantOnlyRow = { tenant_id: string };

type BusinessStepRow = {
  tenant_id: string;
  step_key: string | null;
  step_status: string;
  is_required: boolean;
  updated_at: string | null;
};

type CapitalProfileRow = {
  tenant_id: string;
  reserve_confirmed: boolean;
  reserve_confirmed_at: string | null;
  business_growth_positioned: boolean;
  capital_setup_status: string;
  updated_at: string | null;
};

type CapitalAllocationRow = {
  tenant_id: string;
  selected_path: 'business_growth' | 'trading_education' | 'grant_funding' | null;
  current_state: string;
  updated_at: string | null;
};

type AdvancedAccessRow = {
  tenant_id: string;
  feature_key: string;
  opted_in: boolean;
  intro_video_watched_at: string | null;
  disclaimer_accepted_at: string | null;
  access_status: string;
  unlocked_by_rule: boolean;
  updated_at: string | null;
};

type GrantMatchRow = {
  tenant_id: string;
  status: string;
  updated_at: string | null;
};

type GrantDraftRow = {
  tenant_id: string;
  status: string;
  updated_at: string | null;
};

type GrantSubmissionRow = {
  tenant_id: string;
  status: string;
  submitted_at: string | null;
  updated_at: string | null;
};

type ApprovalQueueRow = {
  tenant_id: string;
  proposal_id: string | null;
  strategy_id: string | null;
  status: string;
  approval_status: string | null;
  created_at: string | null;
};

type ReviewLifecycleRow = {
  tenant_id?: string | null;
  approval_status: string | null;
  is_published: boolean | null;
  expires_at: string | null;
  expired_at: string | null;
  updated_at: string | null;
};

type MessageRow = {
  tenant_id: string;
  conversation_id: string;
  direction: string;
  received_at: string | null;
  sent_at: string | null;
  created_at: string | null;
};

type SystemEventRow = {
  id: string;
  created_at: string | null;
  processed_at: string | null;
  status: string | null;
  processed_by: string | null;
  error_msg: string | null;
  tenant_id: string | null;
};

type AgentActionRow = {
  id: string;
  created_at: string | null;
  agent_name: string | null;
  tenant_id: string | null;
  event_type: string | null;
  action_taken: string | null;
  decision_reason: string | null;
  meta: unknown;
};

type InternalMessageRow = {
  id: string;
  created_at: string | null;
  from_agent: string | null;
  to_agent: string | null;
  tenant_id: string | null;
  status: string | null;
};

type AgentContextRow = {
  id: string;
  updated_at: string | null;
  tenant_id: string | null;
  active_stage: string | null;
  meta: unknown;
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
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

export type DealEscalationLevel = 'healthy' | 'watch' | 'at_risk' | 'escalated';

export type DealEscalationItem = {
  tenant_id: string;
  tenant_name: string;
  current_stage: string;
  readiness_status: string;
  escalation_level: DealEscalationLevel;
  stalled_stage: string;
  why_at_risk: string[];
  recommended_intervention: string;
  days_since_client_action: number | null;
  days_since_funding_step: number | null;
  overdue_credit_business_tasks: number;
  overdue_capital_tasks: number;
  overdue_optional_flow_tasks: number;
  ignored_conversations: number;
  pending_reviews: number;
  approved_outcome_cents: number;
  selected_path: string | null;
  last_client_action_at: string | null;
  last_funding_step_at: string | null;
};

export type DealEscalationRule = {
  key: string;
  label: string;
  watch_threshold: string;
  escalated_threshold: string;
  intervention: string;
};

export type DealEscalationSnapshot = {
  summary: {
    total_clients: number;
    healthy: number;
    watch: number;
    at_risk: number;
    escalated: number;
    overdue_credit_business_tasks: number;
    overdue_capital_tasks: number;
    stalled_optional_flows: number;
    pending_reviews: number;
  };
  items: DealEscalationItem[];
  rules: DealEscalationRule[];
  history?: {
    escalated: SnapshotHistoryPoint[];
    atRisk: SnapshotHistoryPoint[];
    watch: SnapshotHistoryPoint[];
    pendingReviews: SnapshotHistoryPoint[];
  };
};

export type OperationalPanel = {
  label: string;
  count: number;
  helper: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

export type ExecutiveCommandCenterSnapshot = {
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
  escalationSummary: DealEscalationSnapshot['summary'];
  atRiskClients: DealEscalationItem[];
  dealRules: DealEscalationRule[];
  systemHealth: OperationalPanel[];
  workerHealth: OperationalPanel[];
  businessImpact: OperationalPanel[];
  history: {
    escalated: SnapshotHistoryPoint[];
    atRisk: SnapshotHistoryPoint[];
    pendingReviews: SnapshotHistoryPoint[];
    openSystemIssues: SnapshotHistoryPoint[];
  };
  generatedAt: string;
};

export type SnapshotHistoryPoint = {
  bucketStartAt: string;
  label: string;
  value: number;
};

type AggregateRows = {
  tenants: TenantRow[];
  fundingProfiles: FundingProfileRow[];
  fundingSteps: FundingStepRow[];
  fundingApplications: FundingApplicationRow[];
  fundingResults: FundingResultRow[];
  fundingOutcomes: FundingOutcomeRow[];
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
  messages: MessageRow[];
  systemEvents: SystemEventRow[];
  agentActions: AgentActionRow[];
  internalMessages: InternalMessageRow[];
  agentContexts: AgentContextRow[];
};

type QueryOptions = {
  tenantId?: string | null;
  hours?: number;
  limit?: number;
};

type SnapshotType = 'command_center' | 'deal_escalations';

type StoredSnapshotRow = {
  bucket_start_at: string;
  summary_json: JsonRecord | null;
  metrics_json: JsonRecord | null;
};

type SystemPanelResult = {
  ok: boolean;
  status: number;
  data: any;
  error: string | null;
};

function snapshotBucketStart(hours: number) {
  const now = new Date();
  if (hours <= 72) {
    now.setUTCMinutes(0, 0, 0);
    return now.toISOString();
  }
  now.setUTCHours(0, 0, 0, 0);
  return now.toISOString();
}

function snapshotLabel(bucketStartAt: string, hours: number) {
  const date = new Date(bucketStartAt);
  return hours <= 72
    ? date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function snapshotScopeKey(options: QueryOptions) {
  return options.tenantId || 'all';
}

async function persistOperationalSnapshot(
  supabase: SupabaseClient,
  snapshotType: SnapshotType,
  options: QueryOptions,
  summary: JsonRecord,
  metrics: JsonRecord
) {
  const payload = {
    snapshot_type: snapshotType,
    scope_key: snapshotScopeKey(options),
    tenant_id: options.tenantId || null,
    window_hours: Number(options.hours || 24),
    bucket_start_at: snapshotBucketStart(Number(options.hours || 24)),
    summary_json: summary,
    metrics_json: metrics,
  };

  const { error } = await supabase
    .from('operational_snapshots')
    .upsert(payload, { onConflict: 'snapshot_type,scope_key,window_hours,bucket_start_at' });

  if (error) throw error;
}

async function loadSnapshotRows(
  supabase: SupabaseClient,
  snapshotType: SnapshotType,
  options: QueryOptions,
  maxPoints = 12
): Promise<StoredSnapshotRow[]> {
  let query = supabase
    .from('operational_snapshots')
    .select('bucket_start_at,summary_json,metrics_json')
    .eq('snapshot_type', snapshotType)
    .eq('scope_key', snapshotScopeKey(options))
    .eq('window_hours', Number(options.hours || 24))
    .order('bucket_start_at', { ascending: false })
    .limit(maxPoints);

  query = options.tenantId ? query.eq('tenant_id', options.tenantId) : query.is('tenant_id', null);

  const { data, error } = await query;
  if (error) throw error;
  return ((data || []) as StoredSnapshotRow[]).slice().reverse();
}

function historySeries(rows: StoredSnapshotRow[], hours: number, selector: (row: StoredSnapshotRow) => number): SnapshotHistoryPoint[] {
  return rows.map((row) => ({
    bucketStartAt: row.bucket_start_at,
    label: snapshotLabel(row.bucket_start_at, hours),
    value: selector(row),
  }));
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function toLower(value: unknown): string {
  return asText(value).toLowerCase();
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseTime(value?: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function daysSince(value?: string | null) {
  const timestamp = parseTime(value || null);
  if (timestamp === null) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24)));
}

function maxTimestamp(values: Array<string | null | undefined>) {
  let winner: string | null = null;
  let winnerTime = -1;
  for (const value of values) {
    const current = parseTime(value || null);
    if (current === null) continue;
    if (current > winnerTime) {
      winnerTime = current;
      winner = String(value);
    }
  }
  return winner;
}

function uniqueTenantCount(rows: Array<{ tenant_id: string }>) {
  return new Set(rows.map((row) => row.tenant_id).filter(Boolean)).size;
}

function toneForCount(count: number, preferred: ExecutiveMetric['tone'] = 'warning') {
  return count > 0 ? preferred : 'default';
}

function matchesAny(value: string, tokens: string[]) {
  return tokens.some((token) => value.includes(token));
}

function actionHaystack(row: AgentActionRow): string {
  const meta = row?.meta && typeof row.meta === 'object' ? (row.meta as JsonRecord) : {};
  return [
    toLower(row.agent_name),
    toLower(row.event_type),
    toLower(row.action_taken),
    toLower(row.decision_reason),
    toLower(meta.skip_reason),
    toLower(meta.failure_reason),
    toLower(meta.status),
    toLower(meta.result),
  ].join(' ');
}

function isSkippedAction(row: AgentActionRow) {
  return matchesAny(actionHaystack(row), ['skip', 'cooldown', 'duplicate', 'noop', 'suppressed', 'defer']);
}

function isFailedAction(row: AgentActionRow) {
  return matchesAny(actionHaystack(row), ['fail', 'error', 'abort', 'rejected', 'timeout']);
}

function isTaskCreatedAction(row: AgentActionRow) {
  return matchesAny(actionHaystack(row), ['task_created', 'create task', 'created task', 'assignment', 'assigned']);
}

function firstArray(...values: unknown[]): any[] {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function countJsonEntries(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value as JsonRecord).length;
  return 0;
}

function normalizeStage(stage: string | null | undefined) {
  return asText(stage || 'untracked') || 'untracked';
}

function stageLabel(stage: string) {
  const map: Record<string, string> = {
    credit_optimization: 'Credit Optimization',
    business_foundation: 'Business Foundation',
    funding_roadmap: 'Funding Roadmap',
    application_loop: 'Application Loop',
    post_funding_capital: 'Post-Funding Capital',
    untracked: 'Untracked',
  };
  return map[stage] || stage.replace(/_/g, ' ');
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
  return hours > 0 && hours <= 72;
}

function isOldApproved(row: ReviewLifecycleRow) {
  if (toLower(row.approval_status) !== 'approved') return false;
  const updatedAt = parseTime(row.updated_at);
  if (updatedAt === null) return false;
  return Date.now() - updatedAt >= 14 * 24 * 60 * 60 * 1000;
}

async function safeSelect<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  dependencyNotes: string[],
  options: QueryOptions & { orderBy?: string; ascending?: boolean; tenantScoped?: boolean } = {}
): Promise<T[]> {
  let query = supabase.from(table).select(select);
  if (options.tenantScoped !== false && options.tenantId) {
    query = query.eq('tenant_id', options.tenantId);
  }
  if (options.orderBy) {
    query = query.order(options.orderBy, { ascending: options.ascending ?? false });
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) {
    dependencyNotes.push(`${table}: ${error.message || 'query unavailable'}`);
    return [];
  }
  return (data || []) as T[];
}

async function fetchTenants(supabase: SupabaseClient, dependencyNotes: string[], tenantId?: string | null) {
  let query = supabase.from('tenants').select('id,name,status,created_at').order('created_at', { ascending: false }).limit(5000);
  if (tenantId) query = query.eq('id', tenantId);
  const { data, error } = await query;
  if (error) {
    dependencyNotes.push(`tenants: ${error.message || 'query unavailable'}`);
    return [] as TenantRow[];
  }
  return (data || []) as TenantRow[];
}

async function fetchAggregateRows(supabase: SupabaseClient, dependencyNotes: string[], options: QueryOptions): Promise<AggregateRows> {
  const hours = Number(options.hours || 72);
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const recentLimit = Math.max(Number(options.limit || 50) * 12, 400);

  const [
    tenants,
    fundingProfiles,
    fundingSteps,
    fundingApplications,
    fundingResults,
    fundingOutcomes,
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
    messages,
    systemEvents,
    agentActions,
    internalMessages,
    agentContexts,
  ] = await Promise.all([
    fetchTenants(supabase, dependencyNotes, options.tenantId),
    safeSelect<FundingProfileRow>(supabase, 'funding_profiles', 'tenant_id,current_stage,readiness_status,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<FundingStepRow>(supabase, 'funding_strategy_steps', 'tenant_id,step_key,step_status,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<FundingApplicationRow>(supabase, 'funding_applications', 'tenant_id,decision_status,submitted_at,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<FundingResultRow>(supabase, 'funding_results', 'tenant_id,result_status,outcome_at,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<FundingOutcomeRow>(supabase, 'funding_outcomes', 'tenant_id,outcome_status,approved_amount_cents,approval_date,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<ClientTaskRow>(supabase, 'client_tasks', 'tenant_id,status,priority,task_category,template_key,type,dismissed_at,due_date,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<TenantOnlyRow>(supabase, 'credit_reports', 'tenant_id', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<TenantOnlyRow>(supabase, 'credit_analysis', 'tenant_id', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<TenantOnlyRow>(supabase, 'business_profiles', 'tenant_id', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<BusinessStepRow>(supabase, 'business_setup_progress', 'tenant_id,step_key,step_status,is_required,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<CapitalProfileRow>(supabase, 'capital_profiles', 'tenant_id,reserve_confirmed,reserve_confirmed_at,business_growth_positioned,capital_setup_status,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<CapitalAllocationRow>(supabase, 'capital_allocation_choices', 'tenant_id,selected_path,current_state,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<AdvancedAccessRow>(supabase, 'user_advanced_access', 'tenant_id,feature_key,opted_in,intro_video_watched_at,disclaimer_accepted_at,access_status,unlocked_by_rule,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<GrantMatchRow>(supabase, 'grant_matches', 'tenant_id,status,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<GrantDraftRow>(supabase, 'grant_application_drafts', 'tenant_id,status,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<GrantSubmissionRow>(supabase, 'grant_submissions', 'tenant_id,status,submitted_at,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<ApprovalQueueRow>(supabase, 'approval_queue', 'tenant_id,proposal_id,strategy_id,status,approval_status,created_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<ReviewLifecycleRow>(supabase, 'strategy_performance', 'tenant_id,approval_status,is_published,expires_at,expired_at,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<ReviewLifecycleRow>(supabase, 'options_strategy_performance', 'tenant_id,approval_status,is_published,expires_at,expired_at,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<ReviewLifecycleRow>(supabase, 'reviewed_signal_proposals', 'tenant_id,approval_status,is_published,expires_at,expired_at,updated_at', dependencyNotes, { tenantId: options.tenantId, limit: 5000 }),
    safeSelect<MessageRow>(supabase, 'messages', 'tenant_id,conversation_id,direction,received_at,sent_at,created_at', dependencyNotes, { tenantId: options.tenantId, orderBy: 'created_at', ascending: false, limit: recentLimit }),
    safeSelect<SystemEventRow>(supabase, 'system_events', 'id,created_at,processed_at,status,processed_by,error_msg,tenant_id', dependencyNotes, { tenantId: options.tenantId, orderBy: 'created_at', ascending: false, limit: recentLimit }),
    safeSelect<AgentActionRow>(supabase, 'agent_action_history', 'id,created_at,agent_name,tenant_id,event_type,action_taken,decision_reason,meta', dependencyNotes, { tenantId: options.tenantId, orderBy: 'created_at', ascending: false, limit: recentLimit }),
    safeSelect<InternalMessageRow>(supabase, 'internal_messages', 'id,created_at,from_agent,to_agent,tenant_id,status', dependencyNotes, { tenantId: options.tenantId, orderBy: 'created_at', ascending: false, limit: recentLimit }),
    safeSelect<AgentContextRow>(supabase, 'agent_context', 'id,updated_at,tenant_id,active_stage,meta', dependencyNotes, { tenantId: options.tenantId, orderBy: 'updated_at', ascending: false, limit: recentLimit }),
  ]);

  return {
    tenants,
    fundingProfiles,
    fundingSteps,
    fundingApplications,
    fundingResults,
    fundingOutcomes,
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
    messages,
    systemEvents,
    agentActions,
    internalMessages,
    agentContexts,
  };
}

function taskCategoryBucket(row: ClientTaskRow) {
  const haystack = [row.task_category, row.template_key, row.type].map(toLower).join(' ');
  if (matchesAny(haystack, ['credit', 'bureau', 'tradeline', 'dispute', 'upload_credit'])) return 'credit';
  if (matchesAny(haystack, ['business', 'ein', 'entity', 'foundation', 'formation', 'banking'])) return 'business';
  if (matchesAny(haystack, ['capital', 'reserve', 'allocation', 'protection'])) return 'capital';
  if (matchesAny(haystack, ['trading', 'paper'])) return 'trading';
  if (matchesAny(haystack, ['grant'])) return 'grant';
  return 'general';
}

function isPendingTask(row: ClientTaskRow) {
  return toLower(row.status) !== 'completed' && !row.dismissed_at;
}

function isOverdueTask(row: ClientTaskRow) {
  if (!isPendingTask(row)) return false;
  if (!row.due_date) return false;
  return new Date(`${row.due_date}T23:59:59.999Z`).getTime() < Date.now();
}

function buildIgnoredConversationStats(messages: MessageRow[]) {
  const perConversation = new Map<string, { tenant_id: string; last_in: string | null; last_out: string | null }>();
  for (const row of messages) {
    const key = `${row.tenant_id}:${row.conversation_id}`;
    const existing = perConversation.get(key) || { tenant_id: row.tenant_id, last_in: null, last_out: null };
    const activityAt = maxTimestamp([row.received_at, row.sent_at, row.created_at]);
    if (toLower(row.direction) === 'in') {
      existing.last_in = maxTimestamp([existing.last_in, activityAt]);
    } else {
      existing.last_out = maxTimestamp([existing.last_out, activityAt]);
    }
    perConversation.set(key, existing);
  }

  const ignoredByTenant = new Map<string, number>();
  for (const item of perConversation.values()) {
    const lastIn = parseTime(item.last_in);
    const lastOut = parseTime(item.last_out);
    if (lastIn === null) continue;
    if (lastOut !== null && lastOut >= lastIn) continue;
    if (Date.now() - lastIn < 48 * 60 * 60 * 1000) continue;
    ignoredByTenant.set(item.tenant_id, toNumber(ignoredByTenant.get(item.tenant_id)) + 1);
  }

  return ignoredByTenant;
}

function summarizeExecutiveMetrics(rows: AggregateRows, dependencyNotes: string[]): {
  snapshot: Omit<ExecutiveCommandCenterSnapshot, 'escalationSummary' | 'atRiskClients' | 'dealRules' | 'systemHealth' | 'workerHealth' | 'businessImpact' | 'generatedAt'>;
  businessImpact: OperationalPanel[];
} {
  const tenantIds = new Set<string>();
  rows.tenants.forEach((tenant) => tenantIds.add(tenant.id));
  [
    ...rows.fundingProfiles,
    ...rows.creditReports,
    ...rows.creditAnalysis,
    ...rows.businessProfiles,
    ...rows.capitalProfiles,
    ...rows.capitalAllocations,
    ...rows.advancedAccess,
    ...rows.grantMatches,
    ...rows.grantDrafts,
    ...rows.grantSubmissions,
    ...rows.approvalQueue,
  ].forEach((row) => {
    if (row.tenant_id) tenantIds.add(row.tenant_id);
  });

  const totalClients = tenantIds.size;
  const fundingByTenant = new Map(rows.fundingProfiles.map((row) => [row.tenant_id, row]));
  const creditReportTenants = new Set(rows.creditReports.map((row) => row.tenant_id));
  const creditAnalysisTenants = new Set(rows.creditAnalysis.map((row) => row.tenant_id));
  const businessProfileTenants = new Set(rows.businessProfiles.map((row) => row.tenant_id));
  const requiredBusinessIncompleteTenants = new Set(
    rows.businessSetupProgress.filter((row) => row.is_required && toLower(row.step_status) !== 'completed').map((row) => row.tenant_id)
  );
  const activeGrantTenants = new Set(
    rows.grantMatches.filter((row) => ['shortlisted', 'drafting', 'submitted'].includes(toLower(row.status))).map((row) => row.tenant_id)
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
    stageCounts.set(stage, toNumber(stageCounts.get(stage)) + 1);
  });

  const activeRoadmapSteps = rows.fundingSteps.filter((row) => toLower(row.step_status) === 'active').length;
  const postFundingClients = stageCounts.get('post_funding_capital') || 0;
  const missingCreditUploads = Math.max(totalClients - creditReportTenants.size, 0);
  const unresolvedCreditReview = Array.from(creditReportTenants).filter((tenantId) => !creditAnalysisTenants.has(tenantId)).length;
  const incompleteBusinessFoundation = Array.from(tenantIds).filter(
    (tenantId) => !businessProfileTenants.has(tenantId) || requiredBusinessIncompleteTenants.has(tenantId)
  ).length;
  const blockedReadiness = rows.fundingProfiles.filter((row) => toLower(row.readiness_status) === 'blocked').length;
  const urgentTasks = rows.clientTasks.filter((row) => isPendingTask(row) && toLower(row.priority) === 'urgent');

  const blockerCounter = new Map<string, number>();
  urgentTasks.forEach((row) => {
    const key = asText(row.task_category || row.template_key || row.type || 'uncategorized').replace(/_/g, ' ');
    blockerCounter.set(key, toNumber(blockerCounter.get(key)) + 1);
  });
  const commonBlockers = Array.from(blockerCounter.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  const capitalProtectionComplete = rows.capitalProfiles.filter(
    (row) => row.reserve_confirmed && ['ready', 'completed'].includes(toLower(row.capital_setup_status))
  ).length;
  const capitalProtectionIncomplete = Math.max(postFundingClients - capitalProtectionComplete, 0);
  const businessGrowthSelected = rows.capitalAllocations.filter((row) => row.selected_path === 'business_growth' && toLower(row.current_state) === 'active').length;
  const tradingSelected = rows.capitalAllocations.filter((row) => row.selected_path === 'trading_education' && toLower(row.current_state) === 'active').length;
  const grantSelected = rows.capitalAllocations.filter((row) => row.selected_path === 'grant_funding' && toLower(row.current_state) === 'active').length;
  const businessGrowthPositioned = rows.capitalProfiles.filter((row) => row.business_growth_positioned).length;

  const tradingRows = rows.advancedAccess.filter((row) => row.feature_key === 'advanced_trading');
  const tradingGated = tradingRows.filter((row) => ['locked', 'eligible_pending', 'in_progress'].includes(toLower(row.access_status))).length;
  const tradingOptedIn = tradingRows.filter((row) => row.opted_in).length;
  const tradingVideoComplete = tradingRows.filter((row) => Boolean(row.intro_video_watched_at)).length;
  const tradingReady = tradingRows.filter((row) => ['ready', 'unlocked'].includes(toLower(row.access_status))).length;

  const grantPrepInProgress = rows.grantDrafts.filter((row) => ['draft', 'needs_review', 'approved_to_submit'].includes(toLower(row.status))).length;
  const grantSubmitted = rows.grantSubmissions.length;
  const grantDecisionsLogged = rows.grantSubmissions.filter((row) => ['accepted', 'rejected', 'awarded', 'denied'].includes(toLower(row.status))).length;

  const pendingQueueRows = rows.approvalQueue.filter((row) => {
    const status = toLower(row.status);
    const approvalStatus = toLower(row.approval_status);
    return approvalStatus !== 'approved' && approvalStatus !== 'rejected' && status !== 'approved' && status !== 'rejected' && status !== 'resolved';
  });
  const pendingSignalReviews = pendingQueueRows.filter((row) => Boolean(row.proposal_id)).length;
  const pendingStrategyReviews = Math.max(pendingQueueRows.length - pendingSignalReviews, 0);

  const approvedLifecycleRows = [...rows.strategyRows, ...rows.optionsRows, ...rows.signalRows].filter(
    (row) => toLower(row.approval_status) === 'approved'
  );
  const reviewPublished = approvedLifecycleRows.filter((row) => row.is_published === true && !isExpiredLifecycle(row)).length;
  const reviewUnpublished = approvedLifecycleRows.filter((row) => row.is_published !== true && !isExpiredLifecycle(row)).length;
  const reviewExpired = approvedLifecycleRows.filter(isExpiredLifecycle).length;
  const reviewStale = approvedLifecycleRows.filter(
    (row) => isExpiredLifecycle(row) || isExpiringSoon(row) || row.is_published !== true || isOldApproved(row)
  ).length + pendingQueueRows.filter((row) => {
    const age = parseTime(row.created_at);
    return age !== null && Date.now() - age >= 14 * 24 * 60 * 60 * 1000;
  }).length;

  const approvedFundingCents = rows.fundingOutcomes
    .filter((row) => toLower(row.outcome_status) === 'approved')
    .reduce((sum, row) => sum + toNumber(row.approved_amount_cents), 0);

  dependencyNotes.push(
    'Trading engagement reflects gating and readiness states. Platform-wide lesson consumption and paper-trading journal activity are still not persisted centrally.',
    'Grant engagement reflects shortlist, draft, and submission workflow state. Opportunity view/save telemetry is still missing.',
    'System health combines Oracle-backed observability with Supabase-backed workflow counts so operators can see one calm surface.'
  );

  return {
    snapshot: {
      overview: [
        { label: 'Clients Tracked', value: totalClients, helper: 'Tenants/clients visible to internal operations right now.' },
        { label: 'Blocked Readiness', value: blockedReadiness, helper: 'Funding profiles marked blocked.', tone: toneForCount(blockedReadiness, 'warning') },
        { label: 'Post-Funding', value: postFundingClients, helper: 'Clients already in reserve-first capital stage.', tone: toneForCount(postFundingClients, 'success') },
        { label: 'Trading Ready', value: tradingReady, helper: 'Advanced trading is ready or unlocked.', tone: toneForCount(tradingReady, 'success') },
        { label: 'Grant Workflows', value: activeGrantTenants.size, helper: 'Clients with live shortlist, draft, or submission grant activity.', tone: toneForCount(activeGrantTenants.size, 'success') },
        { label: 'Pending Reviews', value: pendingQueueRows.length, helper: 'Research items waiting on reviewer action.', tone: toneForCount(pendingQueueRows.length, 'danger') },
      ],
      stageDistribution: [
        { label: 'Credit Optimization', count: stageCounts.get('credit_optimization') || 0, helper: 'Clients still building credit readiness.' },
        { label: 'Business Foundation', count: stageCounts.get('business_foundation') || 0, helper: 'Clients working through business setup and consistency steps.' },
        { label: 'Funding Roadmap', count: stageCounts.get('funding_roadmap') || 0, helper: 'Roadmap-ready clients not yet in application loop.' },
        { label: 'Application Loop', count: stageCounts.get('application_loop') || 0, helper: 'Clients actively working lenders and application outcomes.' },
        { label: 'Post-Funding Capital', count: postFundingClients, helper: 'Clients moved into capital protection and allocation.' },
        { label: 'Untracked', count: stageCounts.get('untracked') || 0, helper: 'Clients without a persisted funding profile yet.' },
      ],
      bottlenecks: [
        { label: 'Missing Credit Uploads', count: missingCreditUploads, helper: 'Clients with no persisted credit report yet.', tone: toneForCount(missingCreditUploads, 'danger') },
        { label: 'Credit Review Unresolved', count: unresolvedCreditReview, helper: 'Credit report exists but readiness analysis is still missing.', tone: toneForCount(unresolvedCreditReview, 'warning') },
        { label: 'Business Foundation Incomplete', count: incompleteBusinessFoundation, helper: 'Business profile or required setup steps still incomplete.', tone: toneForCount(incompleteBusinessFoundation, 'warning') },
        { label: 'Urgent Workflow Tasks', count: urgentTasks.length, helper: 'Open urgent client tasks driving operator pressure.', tone: toneForCount(urgentTasks.length, 'danger') },
        { label: 'Active Roadmap Steps', count: activeRoadmapSteps, helper: 'Funding strategy steps currently marked active.', tone: toneForCount(activeRoadmapSteps, 'success') },
      ],
      commonBlockers,
      capitalPath: [
        { label: 'Protection Complete', count: capitalProtectionComplete, helper: 'Reserve confirmed and capital setup marked ready/completed.', tone: toneForCount(capitalProtectionComplete, 'success') },
        { label: 'Protection Incomplete', count: capitalProtectionIncomplete, helper: 'Post-funding clients still missing reserve-first completion.', tone: toneForCount(capitalProtectionIncomplete, 'warning') },
        { label: 'Business Growth Selected', count: businessGrowthSelected, helper: 'Capital allocation currently points to Business Growth.', tone: toneForCount(businessGrowthSelected, 'success') },
        { label: 'Trading Selected', count: tradingSelected, helper: 'Capital allocation currently points to Trading Education.', tone: toneForCount(tradingSelected, 'warning') },
        { label: 'Grant Path Selected', count: grantSelected, helper: 'Capital allocation currently points to Grant Funding.', tone: toneForCount(grantSelected, 'warning') },
        { label: 'Growth Positioned', count: businessGrowthPositioned, helper: 'Capital profiles positioned for business growth.', tone: toneForCount(businessGrowthPositioned, 'success') },
      ],
      tradingEngagement: [
        { label: 'Gated Users', count: tradingGated, helper: 'Users still locked or mid-gating for advanced trading.', tone: toneForCount(tradingGated, 'warning') },
        { label: 'Opted In', count: tradingOptedIn, helper: 'Users who opted into the trading education path.', tone: toneForCount(tradingOptedIn, 'success') },
        { label: 'Video Complete', count: tradingVideoComplete, helper: 'Users who cleared the intro video checkpoint.', tone: toneForCount(tradingVideoComplete, 'success') },
        { label: 'Ready / Unlocked', count: tradingReady, helper: 'Users ready for the unlocked paper-trading experience.', tone: toneForCount(tradingReady, 'success') },
      ],
      grantEngagement: [
        { label: 'Active Shortlists', count: activeGrantTenants.size, helper: 'Clients with live shortlisted or drafting grant workflows.', tone: toneForCount(activeGrantTenants.size, 'success') },
        { label: 'Prep In Progress', count: grantPrepInProgress, helper: 'Grant drafts currently in prep or review states.', tone: toneForCount(grantPrepInProgress, 'warning') },
        { label: 'Submissions Logged', count: grantSubmitted, helper: 'Grant submission records logged across the system.', tone: toneForCount(grantSubmitted, 'success') },
        { label: 'Decisions Logged', count: grantDecisionsLogged, helper: 'Submissions with accepted/rejected/awarded/denied outcomes.', tone: toneForCount(grantDecisionsLogged, 'success') },
      ],
      reviewWorkload: [
        { label: 'Pending Strategy Reviews', count: pendingStrategyReviews, helper: 'Queue items waiting on strategy-side review action.', tone: toneForCount(pendingStrategyReviews, 'danger') },
        { label: 'Pending Signal Reviews', count: pendingSignalReviews, helper: 'Queue items waiting on signal-side review action.', tone: toneForCount(pendingSignalReviews, 'danger') },
        { label: 'Published Content', count: reviewPublished, helper: 'Approved research content currently published and active.', tone: toneForCount(reviewPublished, 'success') },
        { label: 'Unpublished Approved', count: reviewUnpublished, helper: 'Approved content still waiting on explicit publish action.', tone: toneForCount(reviewUnpublished, 'warning') },
        { label: 'Expired Content', count: reviewExpired, helper: 'Approved content past lifecycle expiration.', tone: toneForCount(reviewExpired, 'danger') },
        { label: 'Stale Attention', count: reviewStale, helper: 'Expired, old, or unpublished approved content needing action.', tone: toneForCount(reviewStale, 'warning') },
      ],
      dependencyNotes: Array.from(new Set(dependencyNotes)),
      totalClients,
    },
    businessImpact: [
      { label: 'Approved Funding', count: Math.round(approvedFundingCents / 100), helper: 'Dollar-equivalent approved funding captured in funding outcomes.', tone: toneForCount(approvedFundingCents, 'success') },
      { label: 'Capital Ready Clients', count: capitalProtectionComplete, helper: 'Clients ready to deploy capital with reserve protection set.', tone: toneForCount(capitalProtectionComplete, 'success') },
      { label: 'Grant Decisions', count: grantDecisionsLogged, helper: 'Recorded grant decisions that can affect downstream planning.', tone: toneForCount(grantDecisionsLogged, 'success') },
      { label: 'Review Pressure', count: pendingQueueRows.length, helper: 'Open review queue rows that can slow revenue-facing updates.', tone: toneForCount(pendingQueueRows.length, 'danger') },
    ],
  };
}

function buildDealEscalations(rows: AggregateRows): DealEscalationSnapshot {
  const tenantMap = new Map<string, { id: string; name: string }>();
  rows.tenants.forEach((tenant) => {
    tenantMap.set(tenant.id, { id: tenant.id, name: tenant.name || tenant.id });
  });

  const allTenantIds = new Set<string>(rows.tenants.map((tenant) => tenant.id));
  [
    ...rows.fundingProfiles,
    ...rows.fundingSteps,
    ...rows.fundingApplications,
    ...rows.fundingResults,
    ...rows.fundingOutcomes,
    ...rows.clientTasks,
    ...rows.capitalProfiles,
    ...rows.capitalAllocations,
    ...rows.advancedAccess,
    ...rows.grantMatches,
    ...rows.grantDrafts,
    ...rows.grantSubmissions,
    ...rows.approvalQueue,
    ...rows.creditReports,
    ...rows.creditAnalysis,
  ].forEach((row) => {
    if (row.tenant_id) allTenantIds.add(row.tenant_id);
  });

  const ignoredByTenant = buildIgnoredConversationStats(rows.messages);
  const creditReportTenants = new Set(rows.creditReports.map((row) => row.tenant_id));
  const fundingProfilesByTenant = new Map(rows.fundingProfiles.map((row) => [row.tenant_id, row]));
  const fundingStepsByTenant = new Map<string, FundingStepRow[]>();
  const fundingApplicationsByTenant = new Map<string, FundingApplicationRow[]>();
  const fundingResultsByTenant = new Map<string, FundingResultRow[]>();
  const fundingOutcomesByTenant = new Map<string, FundingOutcomeRow[]>();
  const tasksByTenant = new Map<string, ClientTaskRow[]>();
  const capitalProfilesByTenant = new Map<string, CapitalProfileRow[]>();
  const capitalAllocationsByTenant = new Map<string, CapitalAllocationRow[]>();
  const advancedAccessByTenant = new Map<string, AdvancedAccessRow[]>();
  const grantDraftsByTenant = new Map<string, GrantDraftRow[]>();
  const grantSubmissionsByTenant = new Map<string, GrantSubmissionRow[]>();
  const approvalQueueByTenant = new Map<string, ApprovalQueueRow[]>();
  const messagesByTenant = new Map<string, MessageRow[]>();

  for (const row of rows.fundingSteps) {
    const list = fundingStepsByTenant.get(row.tenant_id) || [];
    list.push(row);
    fundingStepsByTenant.set(row.tenant_id, list);
  }
  for (const row of rows.fundingApplications) {
    const list = fundingApplicationsByTenant.get(row.tenant_id) || [];
    list.push(row);
    fundingApplicationsByTenant.set(row.tenant_id, list);
  }
  for (const row of rows.fundingResults) {
    const list = fundingResultsByTenant.get(row.tenant_id) || [];
    list.push(row);
    fundingResultsByTenant.set(row.tenant_id, list);
  }
  for (const row of rows.fundingOutcomes) {
    const list = fundingOutcomesByTenant.get(row.tenant_id) || [];
    list.push(row);
    fundingOutcomesByTenant.set(row.tenant_id, list);
  }
  for (const row of rows.clientTasks) {
    const list = tasksByTenant.get(row.tenant_id) || [];
    list.push(row);
    tasksByTenant.set(row.tenant_id, list);
  }
  for (const row of rows.capitalProfiles) {
    const list = capitalProfilesByTenant.get(row.tenant_id) || [];
    list.push(row);
    capitalProfilesByTenant.set(row.tenant_id, list);
  }
  for (const row of rows.capitalAllocations) {
    const list = capitalAllocationsByTenant.get(row.tenant_id) || [];
    list.push(row);
    capitalAllocationsByTenant.set(row.tenant_id, list);
  }
  for (const row of rows.advancedAccess) {
    const list = advancedAccessByTenant.get(row.tenant_id) || [];
    list.push(row);
    advancedAccessByTenant.set(row.tenant_id, list);
  }
  for (const row of rows.grantDrafts) {
    const list = grantDraftsByTenant.get(row.tenant_id) || [];
    list.push(row);
    grantDraftsByTenant.set(row.tenant_id, list);
  }
  for (const row of rows.grantSubmissions) {
    const list = grantSubmissionsByTenant.get(row.tenant_id) || [];
    list.push(row);
    grantSubmissionsByTenant.set(row.tenant_id, list);
  }
  for (const row of rows.approvalQueue) {
    const list = approvalQueueByTenant.get(row.tenant_id) || [];
    list.push(row);
    approvalQueueByTenant.set(row.tenant_id, list);
  }
  for (const row of rows.messages) {
    const list = messagesByTenant.get(row.tenant_id) || [];
    list.push(row);
    messagesByTenant.set(row.tenant_id, list);
  }

  const items: DealEscalationItem[] = [];

  for (const tenantId of Array.from(allTenantIds)) {
    const tenantName = tenantMap.get(tenantId)?.name || tenantId;
    const profile = fundingProfilesByTenant.get(tenantId);
    const stage = normalizeStage(profile?.current_stage || 'untracked');
    const tasks = tasksByTenant.get(tenantId) || [];
    const capitalProfiles = capitalProfilesByTenant.get(tenantId) || [];
    const capitalAllocations = capitalAllocationsByTenant.get(tenantId) || [];
    const tradingRows = (advancedAccessByTenant.get(tenantId) || []).filter((row) => row.feature_key === 'advanced_trading');
    const fundingApps = fundingApplicationsByTenant.get(tenantId) || [];
    const fundingResults = fundingResultsByTenant.get(tenantId) || [];
    const fundingOutcomes = fundingOutcomesByTenant.get(tenantId) || [];
    const grantDrafts = grantDraftsByTenant.get(tenantId) || [];
    const grantSubmissions = grantSubmissionsByTenant.get(tenantId) || [];
    const approvalQueue = approvalQueueByTenant.get(tenantId) || [];
    const messageRows = messagesByTenant.get(tenantId) || [];
    const ignoredConversations = toNumber(ignoredByTenant.get(tenantId));

    const lastClientActionAt = maxTimestamp([
      ...tasks.filter((task) => toLower(task.status) === 'completed').map((task) => task.updated_at),
      ...messageRows.filter((message) => toLower(message.direction) === 'in').map((message) => maxTimestamp([message.received_at, message.created_at])),
    ]);
    const lastFundingStepAt = maxTimestamp([
      profile?.updated_at || null,
      ...((fundingStepsByTenant.get(tenantId) || []).map((row) => row.updated_at)),
      ...fundingApps.map((row) => maxTimestamp([row.submitted_at, row.updated_at])),
      ...fundingResults.map((row) => maxTimestamp([row.outcome_at, row.updated_at])),
      ...fundingOutcomes.map((row) => maxTimestamp([row.approval_date ? `${row.approval_date}T00:00:00.000Z` : null, row.updated_at])),
      ...capitalProfiles.map((row) => maxTimestamp([row.reserve_confirmed_at, row.updated_at])),
      ...capitalAllocations.map((row) => row.updated_at),
      ...tradingRows.map((row) => row.updated_at),
      ...grantDrafts.map((row) => row.updated_at),
      ...grantSubmissions.map((row) => maxTimestamp([row.submitted_at, row.updated_at])),
    ]);

    const overdueCreditBusinessTasks = tasks.filter((task) => isOverdueTask(task) && ['credit', 'business'].includes(taskCategoryBucket(task))).length;
    const overdueCapitalTasks = tasks.filter((task) => isOverdueTask(task) && taskCategoryBucket(task) === 'capital').length;
    const overdueOptionalFlowTasks = tasks.filter((task) => isOverdueTask(task) && ['trading', 'grant'].includes(taskCategoryBucket(task))).length;
    const pendingReviews = approvalQueue.filter((row) => {
      const status = toLower(row.status);
      const approvalStatus = toLower(row.approval_status);
      return approvalStatus !== 'approved' && approvalStatus !== 'rejected' && status !== 'resolved' && status !== 'approved' && status !== 'rejected';
    }).length;

    const hasCreditReport = creditReportTenants.has(tenantId);
    const hasFundingApplication = fundingApps.length > 0;
    const hasFundingResult = fundingResults.length > 0;
    const approvedOutcomes = fundingOutcomes.filter((row) => toLower(row.outcome_status) === 'approved');
    const approvedOutcomeCents = approvedOutcomes.reduce((sum, row) => sum + toNumber(row.approved_amount_cents), 0);
    const capitalProtectionComplete = capitalProfiles.some(
      (row) => row.reserve_confirmed && ['ready', 'completed'].includes(toLower(row.capital_setup_status))
    );
    const selectedPath = capitalAllocations.find((row) => toLower(row.current_state) === 'active')?.selected_path || null;
    const tradingReady = tradingRows.some((row) => ['ready', 'unlocked'].includes(toLower(row.access_status)));
    const grantProgressLogged = grantDrafts.length > 0 || grantSubmissions.length > 0;

    const reasons: Array<{ severity: number; message: string; intervention: string; stalledStage?: string }> = [];
    const daysSinceClient = daysSince(lastClientActionAt);
    const daysSinceFunding = daysSince(lastFundingStepAt);

    if (!hasCreditReport && ['credit_optimization', 'business_foundation'].includes(stage)) {
      reasons.push({
        severity: daysSinceClient !== null && daysSinceClient >= 10 ? 3 : 2,
        message: 'No credit upload is on file after onboarding and the funding path is still waiting for document intake.',
        intervention: 'Assign a direct outreach owner and help the client complete the credit upload immediately.',
        stalledStage: 'credit intake',
      });
    }

    if (hasFundingApplication && !hasFundingResult && (daysSinceFunding || 0) >= 7) {
      reasons.push({
        severity: (daysSinceFunding || 0) >= 14 ? 3 : 2,
        message: 'Funding applications exist, but no lender result has been logged in the expected follow-up window.',
        intervention: 'Run lender follow-up, capture decision status, and update the application loop before it goes dark.',
        stalledStage: 'application loop',
      });
    }

    if (approvedOutcomes.length > 0 && !capitalProtectionComplete) {
      reasons.push({
        severity: overdueCapitalTasks >= 2 || (daysSinceFunding || 0) >= 10 ? 3 : 2,
        message: 'Approved funding is logged, but reserve-first capital protection is still incomplete.',
        intervention: 'Trigger a post-funding capital protection call and complete reserve plus allocation setup.',
        stalledStage: 'post-funding capital',
      });
    }

    if (ignoredConversations >= 2 || overdueCreditBusinessTasks + overdueCapitalTasks >= 3) {
      reasons.push({
        severity: ignoredConversations >= 4 || overdueCreditBusinessTasks + overdueCapitalTasks >= 5 ? 3 : 2,
        message: 'Tasks or client communications have been repeatedly ignored and the workflow is losing momentum.',
        intervention: 'Escalate to a human operator for direct outreach, task reset, and expectation management.',
        stalledStage: stageLabel(stage).toLowerCase(),
      });
    }

    if (selectedPath === 'trading_education' && !tradingReady && (daysSinceFunding || 0) >= 7) {
      reasons.push({
        severity: overdueOptionalFlowTasks >= 2 || (daysSinceFunding || 0) >= 14 ? 2 : 1,
        message: 'The optional trading path is selected, but opt-in or gating milestones have stalled.',
        intervention: 'Re-engage the trading education path or explicitly pause it so capital planning stays honest.',
        stalledStage: 'trading engagement',
      });
    }

    if (selectedPath === 'grant_funding' && !grantProgressLogged && (daysSinceFunding || 0) >= 10) {
      reasons.push({
        severity: overdueOptionalFlowTasks >= 2 || (daysSinceFunding || 0) >= 18 ? 2 : 1,
        message: 'The grant path is selected, but no draft or submission activity has been logged recently.',
        intervention: 'Re-open the grant prep workflow or archive the optional path so the client is not stuck in limbo.',
        stalledStage: 'grant workflow',
      });
    }

    if (toLower(profile?.readiness_status) === 'blocked') {
      reasons.push({
        severity: 1,
        message: 'Funding readiness is marked blocked and needs operator review.',
        intervention: 'Review the blocking constraint and assign the next concrete unblock step.',
        stalledStage: stageLabel(stage).toLowerCase(),
      });
    }

    const maxSeverity = reasons.reduce((winner, item) => Math.max(winner, item.severity), 0);
    const escalationLevel: DealEscalationLevel = maxSeverity >= 3 ? 'escalated' : maxSeverity === 2 ? 'at_risk' : maxSeverity === 1 ? 'watch' : 'healthy';
    const dominantReason = reasons.sort((left, right) => right.severity - left.severity)[0];

    items.push({
      tenant_id: tenantId,
      tenant_name: tenantName,
      current_stage: stageLabel(stage),
      readiness_status: asText(profile?.readiness_status || 'unknown') || 'unknown',
      escalation_level: escalationLevel,
      stalled_stage: dominantReason?.stalledStage || stageLabel(stage).toLowerCase(),
      why_at_risk: reasons.map((reason) => reason.message),
      recommended_intervention: dominantReason?.intervention || 'No intervention needed. Continue automated monitoring.',
      days_since_client_action: daysSinceClient,
      days_since_funding_step: daysSinceFunding,
      overdue_credit_business_tasks: overdueCreditBusinessTasks,
      overdue_capital_tasks: overdueCapitalTasks,
      overdue_optional_flow_tasks: overdueOptionalFlowTasks,
      ignored_conversations: ignoredConversations,
      pending_reviews: pendingReviews,
      approved_outcome_cents: approvedOutcomeCents,
      selected_path: selectedPath,
      last_client_action_at: lastClientActionAt,
      last_funding_step_at: lastFundingStepAt,
    });
  }

  const ordered = items.sort((left, right) => {
    const severityRank: Record<DealEscalationLevel, number> = { healthy: 0, watch: 1, at_risk: 2, escalated: 3 };
    if (severityRank[right.escalation_level] !== severityRank[left.escalation_level]) {
      return severityRank[right.escalation_level] - severityRank[left.escalation_level];
    }
    return toNumber(right.overdue_credit_business_tasks + right.overdue_capital_tasks + right.ignored_conversations)
      - toNumber(left.overdue_credit_business_tasks + left.overdue_capital_tasks + left.ignored_conversations);
  });

  return {
    summary: {
      total_clients: ordered.length,
      healthy: ordered.filter((item) => item.escalation_level === 'healthy').length,
      watch: ordered.filter((item) => item.escalation_level === 'watch').length,
      at_risk: ordered.filter((item) => item.escalation_level === 'at_risk').length,
      escalated: ordered.filter((item) => item.escalation_level === 'escalated').length,
      overdue_credit_business_tasks: ordered.reduce((sum, item) => sum + item.overdue_credit_business_tasks, 0),
      overdue_capital_tasks: ordered.reduce((sum, item) => sum + item.overdue_capital_tasks, 0),
      stalled_optional_flows: ordered.reduce((sum, item) => sum + (item.selected_path && item.overdue_optional_flow_tasks > 0 ? 1 : 0), 0),
      pending_reviews: ordered.reduce((sum, item) => sum + item.pending_reviews, 0),
    },
    items: ordered,
    rules: [
      {
        key: 'credit-upload-gap',
        label: 'Missing Credit Upload',
        watch_threshold: 'No credit report logged while still in early funding stages.',
        escalated_threshold: 'Still missing after 10+ days or paired with ignored outreach.',
        intervention: 'Direct document chase plus guided upload support.',
      },
      {
        key: 'funding-result-gap',
        label: 'Missing Funding Result',
        watch_threshold: 'Application submitted with no logged result for 7+ days.',
        escalated_threshold: 'Still unresolved after 14+ days.',
        intervention: 'Lender follow-up and decision capture.',
      },
      {
        key: 'capital-protection-gap',
        label: 'Capital Protection Incomplete',
        watch_threshold: 'Approved outcome exists while reserve/capital setup is still incomplete.',
        escalated_threshold: '10+ days since approval or multiple overdue capital tasks.',
        intervention: 'Post-funding capital protection call and reserve checklist.',
      },
      {
        key: 'ignored-work',
        label: 'Ignored Tasks or Messages',
        watch_threshold: '2+ stale inbound conversations or 3+ overdue core tasks.',
        escalated_threshold: '4+ stale inbound conversations or 5+ overdue core tasks.',
        intervention: 'Human outreach owner and task reset.',
      },
      {
        key: 'optional-flow-stall',
        label: 'Stalled Trading / Grant Path',
        watch_threshold: 'Optional path selected but no forward motion for 7-10 days.',
        escalated_threshold: '14-18+ days plus overdue optional-flow tasks.',
        intervention: 'Re-engage or formally pause the optional path.',
      },
    ],
  };
}

async function fetchPanel(path: string, query: Record<string, unknown>): Promise<SystemPanelResult> {
  try {
    const proxied = await proxyToOracle({ path, method: 'GET', query });
    return {
      ok: proxied.ok,
      status: proxied.status,
      data: proxied.json || {},
      error: proxied.ok ? null : asText((proxied.json as any)?.error || proxied.text || `upstream_${proxied.status}`),
    };
  } catch (error: any) {
    return {
      ok: false,
      status: Number(error?.statusCode) || 500,
      data: {},
      error: asText(error?.message || 'upstream_request_failed'),
    };
  }
}

async function summarizeSystemHealth(event: Pick<HandlerEvent, 'headers'>, options: QueryOptions): Promise<{ systemHealth: OperationalPanel[]; workerHealth: OperationalPanel[]; warnings: string[] }> {
  const hours = Number(options.hours || 24);
  const tenantId = options.tenantId || undefined;
  const [health, jobs, workers, errors] = await Promise.all([
    fetchPanel('/api/system/health', {}),
    fetchPanel('/api/system/jobs', tenantId ? { tenant_id: tenantId, limit: 100 } : { limit: 100 }),
    fetchPanel('/api/system/workers', { limit: 100 }),
    fetchPanel('/api/system/errors', { hours, limit: 100 }),
  ]);

  const warnings = [health, jobs, workers, errors]
    .filter((panel) => !panel.ok)
    .map((panel) => panel.error || 'unavailable');

  const healthData = health.data || {};
  const jobsRows = firstArray(jobs.data?.items, jobs.data?.jobs, jobs.data?.rows, jobs.data?.data);
  const workerRows = firstArray(workers.data?.items, workers.data?.workers, workers.data?.rows, workers.data?.data);
  const errorRows = firstArray(errors.data?.items, errors.data?.errors, errors.data?.rows, errors.data?.data);

  const jobBacklog = jobsRows.filter((row) => !['completed', 'resolved', 'success'].includes(toLower(row?.status))).length;
  const degradedWorkers = workerRows.filter((row) => ['degraded', 'down', 'error'].includes(toLower(row?.status || row?.health))).length;
  const healthyWorkers = workerRows.length - degradedWorkers;
  const webhookFailed = toNumber(healthData?.webhooks?.failed_15m || healthData?.delivery?.failed || 0);
  const outboxFailed = toNumber(healthData?.outbox?.failed || 0);

  return {
    systemHealth: [
      { label: 'Open Error Rows', count: errorRows.length, helper: 'Recent Oracle/gateway errors surfaced through system observability.', tone: toneForCount(errorRows.length, 'danger') },
      { label: 'Queued / Active Jobs', count: jobBacklog, helper: 'Jobs not yet resolved across the monitored worker pool.', tone: toneForCount(jobBacklog, 'warning') },
      { label: 'Webhook Failures', count: webhookFailed, helper: 'Webhook failures from the latest health snapshot.', tone: toneForCount(webhookFailed, 'danger') },
      { label: 'Outbox Failed', count: outboxFailed, helper: 'Failed outbound delivery count from the health snapshot.', tone: toneForCount(outboxFailed, 'danger') },
    ],
    workerHealth: [
      { label: 'Workers Healthy', count: Math.max(healthyWorkers, 0), helper: 'Workers reporting healthy/active status.', tone: toneForCount(Math.max(healthyWorkers, 0), 'success') },
      { label: 'Workers Degraded', count: degradedWorkers, helper: 'Workers reporting degraded, down, or error states.', tone: toneForCount(degradedWorkers, 'warning') },
      { label: 'Safe Mode', count: healthData?.safe_mode ? 1 : 0, helper: 'Outbound sending paused if this is non-zero.', tone: healthData?.safe_mode ? 'danger' : 'success' },
      { label: 'Observability Warnings', count: warnings.length, helper: 'Upstream observability panels that did not respond cleanly.', tone: toneForCount(warnings.length, 'warning') },
    ],
    warnings,
  };
}

function summarizeAutonomy(rows: AggregateRows): OperationalPanel[] {
  const activeAgents = new Set(rows.agentActions.map((row) => asText(row.agent_name)).filter(Boolean)).size;
  const activeContexts = rows.agentContexts.filter((row) => {
    const meta = row.meta && typeof row.meta === 'object' ? (row.meta as JsonRecord) : {};
    const status = toLower(meta.status);
    return !['paused', 'inactive', 'disabled'].includes(status);
  }).length;
  const failedEvents = rows.systemEvents.filter((row) => row.error_msg || ['failed', 'error'].includes(toLower(row.status))).length;
  const failedActions = rows.agentActions.filter(isFailedAction).length;
  const skippedActions = rows.agentActions.filter(isSkippedAction).length;
  const handoffs = rows.internalMessages.filter((row) => asText(row.to_agent)).length;
  const tasksCreated = rows.agentActions.filter(isTaskCreatedAction).length;

  return [
    { label: 'Active Agents', count: activeAgents, helper: 'Distinct agents with recent action history.', tone: toneForCount(activeAgents, 'success') },
    { label: 'Live Contexts', count: activeContexts, helper: 'Active agent context rows still in motion.', tone: toneForCount(activeContexts, 'success') },
    { label: 'Autonomy Failures', count: failedEvents + failedActions, helper: 'Recent failed events or agent actions.', tone: toneForCount(failedEvents + failedActions, 'warning') },
    { label: 'Skipped Actions', count: skippedActions, helper: 'Suppressed or skipped autonomy actions that may indicate friction.', tone: toneForCount(skippedActions, 'warning') },
    { label: 'Handoffs', count: handoffs, helper: 'Recent internal handoffs between agents.', tone: toneForCount(handoffs, 'success') },
    { label: 'Tasks Created', count: tasksCreated, helper: 'Recent autonomy-created tasks.', tone: toneForCount(tasksCreated, 'success') },
  ];
}

export async function buildDealEscalationPayload(supabase: SupabaseClient, options: QueryOptions) {
  const dependencyNotes: string[] = [];
  const rows = await fetchAggregateRows(supabase, dependencyNotes, options);
  const escalation = buildDealEscalations(rows);

  try {
    await persistOperationalSnapshot(
      supabase,
      'deal_escalations',
      options,
      escalation.summary as unknown as JsonRecord,
      {
        total_clients: escalation.summary.total_clients,
        escalated: escalation.summary.escalated,
        at_risk: escalation.summary.at_risk,
        watch: escalation.summary.watch,
        pending_reviews: escalation.summary.pending_reviews,
      }
    );
  } catch (error: any) {
    dependencyNotes.push(`Operational snapshot persistence unavailable: ${asText(error?.message || error)}`);
  }

  let historyRows: StoredSnapshotRow[] = [];
  try {
    historyRows = await loadSnapshotRows(supabase, 'deal_escalations', options);
  } catch (error: any) {
    dependencyNotes.push(`Deal escalation history unavailable: ${asText(error?.message || error)}`);
  }

  return {
    escalation: {
      ...escalation,
      history: {
        escalated: historySeries(historyRows, Number(options.hours || 24), (row) => toNumber(row.summary_json?.escalated)),
        atRisk: historySeries(historyRows, Number(options.hours || 24), (row) => toNumber(row.summary_json?.at_risk)),
        watch: historySeries(historyRows, Number(options.hours || 24), (row) => toNumber(row.summary_json?.watch)),
        pendingReviews: historySeries(historyRows, Number(options.hours || 24), (row) => toNumber(row.metrics_json?.pending_reviews ?? row.summary_json?.pending_reviews)),
      },
    },
    dependencyNotes: Array.from(new Set(dependencyNotes)),
    generatedAt: new Date().toISOString(),
  };
}

export async function buildExecutiveCommandCenterPayload(
  supabase: SupabaseClient,
  event: Pick<HandlerEvent, 'headers'>,
  options: QueryOptions
) {
  const dependencyNotes: string[] = [];
  const rows = await fetchAggregateRows(supabase, dependencyNotes, options);
  const { snapshot, businessImpact } = summarizeExecutiveMetrics(rows, dependencyNotes);
  const escalation = buildDealEscalations(rows);
  const systemSummary = await summarizeSystemHealth(event, options);
  const autonomySummary = summarizeAutonomy(rows);

  const overview: ExecutiveMetric[] = [
    { label: 'Clients Tracked', value: snapshot.totalClients, helper: 'Operational client population visible in this snapshot.' },
    { label: 'Escalated Clients', value: escalation.summary.escalated, helper: 'Clients already in hard escalation state.', tone: toneForCount(escalation.summary.escalated, 'danger') },
    { label: 'At Risk Clients', value: escalation.summary.at_risk, helper: 'Clients slipping but still recoverable without hard escalation.', tone: toneForCount(escalation.summary.at_risk, 'warning') },
    { label: 'Pending Reviews', value: escalation.summary.pending_reviews, helper: 'Review queue pressure across content and signals.', tone: toneForCount(escalation.summary.pending_reviews, 'danger') },
    { label: 'Open System Issues', value: systemSummary.systemHealth.reduce((sum, row) => sum + (row.tone === 'danger' ? row.count : 0), 0), helper: 'Critical system health counts surfaced through observability.', tone: toneForCount(systemSummary.systemHealth.reduce((sum, row) => sum + (row.tone === 'danger' ? row.count : 0), 0), 'danger') },
    { label: 'Autonomy Active', value: autonomySummary.find((row) => row.label === 'Active Agents')?.count || 0, helper: 'Recent autonomy agents contributing to the workflow graph.', tone: toneForCount(autonomySummary.find((row) => row.label === 'Active Agents')?.count || 0, 'success') },
  ];

  try {
    await persistOperationalSnapshot(
      supabase,
      'command_center',
      options,
      {
        total_clients: snapshot.totalClients,
        escalated: escalation.summary.escalated,
        at_risk: escalation.summary.at_risk,
        pending_reviews: escalation.summary.pending_reviews,
      },
      {
        open_system_issues: systemSummary.systemHealth.reduce((sum, row) => sum + (row.tone === 'danger' ? row.count : 0), 0),
        active_agents: autonomySummary.find((row) => row.label === 'Active Agents')?.count || 0,
        queued_jobs: systemSummary.systemHealth.find((row) => row.label === 'Queued / Active Jobs')?.count || 0,
      }
    );
  } catch (error: any) {
    dependencyNotes.push(`Operational snapshot persistence unavailable: ${asText(error?.message || error)}`);
  }

  let historyRows: StoredSnapshotRow[] = [];
  try {
    historyRows = await loadSnapshotRows(supabase, 'command_center', options);
  } catch (error: any) {
    dependencyNotes.push(`Operational history unavailable: ${asText(error?.message || error)}`);
  }

  return {
    overview,
    stageDistribution: snapshot.stageDistribution,
    bottlenecks: snapshot.bottlenecks,
    commonBlockers: snapshot.commonBlockers,
    capitalPath: snapshot.capitalPath,
    tradingEngagement: snapshot.tradingEngagement,
    grantEngagement: snapshot.grantEngagement,
    reviewWorkload: snapshot.reviewWorkload,
    dependencyNotes: Array.from(new Set([...snapshot.dependencyNotes, ...systemSummary.warnings])),
    totalClients: snapshot.totalClients,
    escalationSummary: escalation.summary,
    atRiskClients: escalation.items.filter((item) => item.escalation_level !== 'healthy').slice(0, Number(options.limit || 8)),
    dealRules: escalation.rules,
    systemHealth: systemSummary.systemHealth,
    workerHealth: [...systemSummary.workerHealth, ...autonomySummary],
    businessImpact,
    history: {
      escalated: historySeries(historyRows, Number(options.hours || 24), (row) => toNumber(row.summary_json?.escalated)),
      atRisk: historySeries(historyRows, Number(options.hours || 24), (row) => toNumber(row.summary_json?.at_risk)),
      pendingReviews: historySeries(historyRows, Number(options.hours || 24), (row) => toNumber(row.summary_json?.pending_reviews)),
      openSystemIssues: historySeries(historyRows, Number(options.hours || 24), (row) => toNumber(row.metrics_json?.open_system_issues)),
    },
    generatedAt: new Date().toISOString(),
  } as ExecutiveCommandCenterSnapshot;
}