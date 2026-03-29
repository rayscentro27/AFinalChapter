import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { requireStaffUser } from './_shared/staff_auth';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
});

const PatchSchema = z.object({
  action: z.enum(['update_domain', 'update_credential', 'update_step', 'update_environment']),
  tenant_id: z.string().uuid(),
  domain_key: z.string().optional(),
  credential_key: z.string().optional(),
  step_key: z.string().optional(),
  readiness_key: z.string().optional(),
  status: z.string().optional(),
  severity: z.string().optional(),
  blocking_level: z.string().optional(),
  notes: z.string().optional(),
  masked_value: z.string().optional(),
  missing_items: z.array(z.string()).optional(),
  blocking_items: z.array(z.string()).optional(),
  warning_items: z.array(z.string()).optional(),
  recommended_order: z.array(z.string()).optional(),
});

type DomainTemplate = {
  domain_key: string;
  display_name: string;
  guidance: string;
  blocking_level: 'blocking' | 'warning' | 'optional';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  action_path: string;
};

type CredentialTemplate = {
  domain_key: string;
  credential_key: string;
  label: string;
  instructions: string;
  action_path: string;
  is_sensitive: boolean;
  default_status: 'missing' | 'configured' | 'needs_review' | 'optional' | 'unknown';
  connection_state: 'unknown' | 'disconnected' | 'connected' | 'degraded' | 'manual_check';
};

type StepTemplate = {
  domain_key: string;
  step_key: string;
  label: string;
  description: string;
  sort_order: number;
  required: boolean;
  action_path: string;
};

type EnvironmentTemplate = {
  readiness_key: string;
  label: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
};

const DOMAIN_TEMPLATES: DomainTemplate[] = [
  {
    domain_key: 'supabase',
    display_name: 'Supabase Foundation',
    guidance: 'Confirm the linked Supabase project, auth behavior, readiness tables, and migration ownership from Windows.',
    blocking_level: 'blocking',
    severity: 'critical',
    action_path: '/admin/control-plane',
  },
  {
    domain_key: 'oracle_api',
    display_name: 'Oracle API Environment',
    guidance: 'Verify Oracle API base URL, health path, auth, and operational mode from the Windows control plane.',
    blocking_level: 'blocking',
    severity: 'critical',
    action_path: '/admin/control-plane',
  },
  {
    domain_key: 'telegram',
    display_name: 'Telegram Bot',
    guidance: 'Track whether the bot token, chat routing, and a real operator test message are complete.',
    blocking_level: 'warning',
    severity: 'high',
    action_path: '/admin/nexus-one',
  },
  {
    domain_key: 'google',
    display_name: 'Google Integrations',
    guidance: 'Track Gmail, Calendar, Drive, or Workspace readiness only if those integrations are part of this environment.',
    blocking_level: 'warning',
    severity: 'medium',
    action_path: '/settings',
  },
  {
    domain_key: 'providers',
    display_name: 'Model And Provider Credentials',
    guidance: 'Confirm the provider layer needed for AI routing, fallbacks, and operational summaries.',
    blocking_level: 'blocking',
    severity: 'critical',
    action_path: '/settings',
  },
  {
    domain_key: 'workers',
    display_name: 'Mac Mini Workers',
    guidance: 'Keep the Windows control plane aware of Mac Mini heartbeats, stale workers, and queue readiness.',
    blocking_level: 'blocking',
    severity: 'critical',
    action_path: '/admin/control-plane',
  },
  {
    domain_key: 'review_dashboard',
    display_name: 'Review Dashboard',
    guidance: 'Confirm review queues and approval surfaces are usable before pilot or launch decisions rely on them.',
    blocking_level: 'warning',
    severity: 'high',
    action_path: '/admin/research-approvals',
  },
  {
    domain_key: 'command_center',
    display_name: 'Command Center',
    guidance: 'Track parser readiness, approval state, and command handoff visibility.',
    blocking_level: 'blocking',
    severity: 'high',
    action_path: '/admin/ai-command-center',
  },
  {
    domain_key: 'source_registry',
    display_name: 'Source Registry',
    guidance: 'Track persistent sources, quality warnings, and review backlogs.',
    blocking_level: 'warning',
    severity: 'high',
    action_path: '/admin/source-registry',
  },
  {
    domain_key: 'internal_communication',
    display_name: 'Internal Communication',
    guidance: 'Confirm internal messages, notifications, and operational summaries are visible to staff.',
    blocking_level: 'warning',
    severity: 'medium',
    action_path: '/admin/nexus-one',
  },
  {
    domain_key: 'nexus_one',
    display_name: 'Nexus One Executive Layer',
    guidance: 'Keep executive briefings, command history, blockers, and readiness visible in one calm surface.',
    blocking_level: 'blocking',
    severity: 'critical',
    action_path: '/admin/nexus-one',
  },
  {
    domain_key: 'self_healing_review_gate',
    display_name: 'Self-Healing Review Gate',
    guidance: 'Confirm self-improvement variants stay review-gated and do not promote silently.',
    blocking_level: 'warning',
    severity: 'high',
    action_path: '/admin/control-plane',
  },
  {
    domain_key: 'manus_operator',
    display_name: 'Manus Desktop',
    guidance: 'Optional operator-side assistant only. Track readiness conceptually without treating Manus as the source of truth.',
    blocking_level: 'optional',
    severity: 'low',
    action_path: '/admin/nexus-one',
  },
];

const CREDENTIAL_TEMPLATES: CredentialTemplate[] = [
  { domain_key: 'supabase', credential_key: 'project_url', label: 'Supabase project URL', instructions: 'Confirm the frontend and Netlify functions target the intended project.', action_path: '/admin/control-plane', is_sensitive: false, default_status: 'unknown', connection_state: 'manual_check' },
  { domain_key: 'supabase', credential_key: 'service_role_access', label: 'Supabase service role access', instructions: 'Confirm Windows-owned migrations and admin functions have valid service-role access.', action_path: '/admin/control-plane', is_sensitive: true, default_status: 'missing', connection_state: 'manual_check' },
  { domain_key: 'oracle_api', credential_key: 'api_base_url', label: 'Oracle API base URL', instructions: 'Record the target API base and verify the health endpoint.', action_path: '/admin/control-plane', is_sensitive: false, default_status: 'unknown', connection_state: 'manual_check' },
  { domain_key: 'oracle_api', credential_key: 'api_auth_headers', label: 'Oracle API auth readiness', instructions: 'Confirm the headers or token path needed for Windows-side control operations.', action_path: '/admin/control-plane', is_sensitive: true, default_status: 'missing', connection_state: 'manual_check' },
  { domain_key: 'telegram', credential_key: 'bot_token', label: 'Telegram bot token', instructions: 'Track whether the bot token has been provisioned and verified.', action_path: '/admin/nexus-one', is_sensitive: true, default_status: 'missing', connection_state: 'manual_check' },
  { domain_key: 'telegram', credential_key: 'chat_routing', label: 'Telegram chat routing', instructions: 'Track whether the target chat IDs and routing rules are confirmed.', action_path: '/admin/nexus-one', is_sensitive: false, default_status: 'missing', connection_state: 'manual_check' },
  { domain_key: 'google', credential_key: 'gmail_readiness', label: 'Gmail readiness', instructions: 'Confirm Gmail is configured only if it is part of the operating model.', action_path: '/settings', is_sensitive: true, default_status: 'optional', connection_state: 'manual_check' },
  { domain_key: 'google', credential_key: 'calendar_readiness', label: 'Calendar readiness', instructions: 'Confirm Calendar integration only if it is part of the operating model.', action_path: '/settings', is_sensitive: true, default_status: 'optional', connection_state: 'manual_check' },
  { domain_key: 'google', credential_key: 'drive_readiness', label: 'Drive readiness', instructions: 'Confirm Drive integration only if it is part of the operating model.', action_path: '/settings', is_sensitive: true, default_status: 'optional', connection_state: 'manual_check' },
  { domain_key: 'providers', credential_key: 'gemini_gateway', label: 'Gemini gateway readiness', instructions: 'Confirm the server-side Gemini route is configured and reachable.', action_path: '/settings', is_sensitive: true, default_status: 'unknown', connection_state: 'manual_check' },
  { domain_key: 'providers', credential_key: 'openrouter_fallback', label: 'OpenRouter fallback readiness', instructions: 'Confirm fallback providers used by AI operations are ready.', action_path: '/settings', is_sensitive: true, default_status: 'optional', connection_state: 'manual_check' },
  { domain_key: 'workers', credential_key: 'mac_mini_connection', label: 'Mac Mini worker connection', instructions: 'Confirm queue worker connectivity and heartbeat visibility from the Windows control plane.', action_path: '/admin/control-plane', is_sensitive: false, default_status: 'unknown', connection_state: 'manual_check' },
  { domain_key: 'workers', credential_key: 'openclaw_runtime', label: 'OpenClaw operator runtime', instructions: 'Confirm whether OpenClaw is installed and healthy on the Mac Mini.', action_path: '/admin/nexus-one', is_sensitive: false, default_status: 'unknown', connection_state: 'manual_check' },
  { domain_key: 'command_center', credential_key: 'plain_language_commands', label: 'Plain-language command parser', instructions: 'Confirm the command parser and approval flow can be trusted operationally.', action_path: '/admin/ai-command-center', is_sensitive: false, default_status: 'unknown', connection_state: 'manual_check' },
  { domain_key: 'source_registry', credential_key: 'source_health_visibility', label: 'Source health visibility', instructions: 'Confirm sources, warnings, and run-now or pause controls are visible and usable.', action_path: '/admin/source-registry', is_sensitive: false, default_status: 'unknown', connection_state: 'manual_check' },
  { domain_key: 'nexus_one', credential_key: 'executive_briefings', label: 'Executive briefing persistence', instructions: 'Confirm briefings are stored and visible in the Windows-side executive layer.', action_path: '/admin/ceo-briefing', is_sensitive: false, default_status: 'unknown', connection_state: 'manual_check' },
  { domain_key: 'manus_operator', credential_key: 'manus_status', label: 'Manus operator-side readiness', instructions: 'Optional. Record whether Manus is conceptually enabled without treating it as a production dependency.', action_path: '/admin/nexus-one', is_sensitive: false, default_status: 'optional', connection_state: 'manual_check' },
];

const STEP_TEMPLATES: StepTemplate[] = [
  { domain_key: 'supabase', step_key: 'confirm_supabase_project', label: 'Confirm Supabase project ownership', description: 'Verify the Windows environment owns migrations and readiness state for the correct project.', sort_order: 10, required: true, action_path: '/admin/control-plane' },
  { domain_key: 'oracle_api', step_key: 'verify_oracle_api', label: 'Verify Oracle API readiness', description: 'Confirm the API health path, auth headers, and operating mode.', sort_order: 20, required: true, action_path: '/admin/control-plane' },
  { domain_key: 'providers', step_key: 'verify_provider_credentials', label: 'Verify provider credentials', description: 'Confirm model and provider credentials required for production operations.', sort_order: 30, required: true, action_path: '/settings' },
  { domain_key: 'telegram', step_key: 'verify_telegram_bot', label: 'Verify Telegram bot', description: 'Confirm the bot token and a real test message path.', sort_order: 40, required: false, action_path: '/admin/nexus-one' },
  { domain_key: 'workers', step_key: 'verify_mac_worker_visibility', label: 'Verify Mac Mini worker visibility', description: 'Confirm heartbeats are fresh and visible before pilot operations rely on workers.', sort_order: 50, required: true, action_path: '/admin/control-plane' },
  { domain_key: 'command_center', step_key: 'verify_command_center_flow', label: 'Verify command center flow', description: 'Submit one low-risk command and confirm approval and inbox visibility.', sort_order: 60, required: true, action_path: '/admin/ai-command-center' },
  { domain_key: 'source_registry', step_key: 'verify_source_registry', label: 'Verify source registry', description: 'Confirm persistent sources, warnings, and operator actions work.', sort_order: 70, required: true, action_path: '/admin/source-registry' },
  { domain_key: 'internal_communication', step_key: 'verify_internal_communication', label: 'Verify internal communication surfaces', description: 'Confirm internal messages and readiness or briefing summaries are visible.', sort_order: 80, required: true, action_path: '/admin/nexus-one' },
  { domain_key: 'nexus_one', step_key: 'verify_nexus_one_executive_layer', label: 'Verify Nexus One executive layer', description: 'Confirm blockers, executive briefings, command status, and next-step guidance are visible in one place.', sort_order: 90, required: true, action_path: '/admin/nexus-one' },
  { domain_key: 'nexus_one', step_key: 'approve_pilot_gate', label: 'Approve 10-user pilot gate', description: 'Use the activation center and pilot docs to confirm day-0 readiness.', sort_order: 100, required: true, action_path: '/admin/nexus-one' },
  { domain_key: 'nexus_one', step_key: 'approve_100_user_gate', label: 'Approve 100-user launch gate', description: 'Confirm the remaining blockers before moving to the 100-user test.', sort_order: 110, required: true, action_path: '/admin/nexus-one' },
];

const ENVIRONMENT_TEMPLATES: EnvironmentTemplate[] = [
  { readiness_key: 'nexus_one', label: 'Nexus One', severity: 'critical' },
  { readiness_key: 'pilot_10_user', label: '10-User Pilot', severity: 'critical' },
  { readiness_key: 'launch_100_user', label: '100-User Test', severity: 'critical' },
];

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asText(entry)).filter(Boolean);
}

function isMissingSchema(error: any) {
  const message = String(error?.message || '').toLowerCase();
  return (
    (message.includes('relation') && message.includes('does not exist'))
    || (message.includes('column') && message.includes('does not exist'))
    || (message.includes('could not find the table') && message.includes('schema cache'))
  );
}

async function safeRows(query: PromiseLike<{ data?: unknown; error?: any }>) {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { rows: [], missing: true, error: null };
    return { rows: [], missing: false, error };
  }
  return { rows: Array.isArray(data) ? data : [], missing: false, error: null };
}

async function safeCount(query: PromiseLike<{ count?: number | null; error?: any }>) {
  const { count, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { count: 0, missing: true, error: null };
    return { count: 0, missing: false, error };
  }
  return { count: Number(count || 0), missing: false, error: null };
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function statusRank(status: string) {
  switch (status) {
    case 'blocked': return 5;
    case 'warn': return 4;
    case 'in_progress': return 3;
    case 'pending': return 2;
    case 'ready': return 1;
    case 'optional': return 0;
    default: return 2;
  }
}

function worseStatus(left: string, right: string) {
  return statusRank(left) >= statusRank(right) ? left : right;
}

function severityRank(value: string) {
  switch (value) {
    case 'critical': return 5;
    case 'high': return 4;
    case 'medium': return 3;
    case 'low': return 2;
    case 'info': return 1;
    default: return 3;
  }
}

function worseSeverity(left: string, right: string) {
  return severityRank(left) >= severityRank(right) ? left : right;
}

async function ensureDefaults(supabase: ReturnType<typeof getAdminSupabaseClient>, tenantId: string) {
  await Promise.all([
    supabase.from('setup_domains').upsert(DOMAIN_TEMPLATES.map((item) => ({
      tenant_id: tenantId,
      domain_key: item.domain_key,
      display_name: item.display_name,
      guidance: item.guidance,
      blocking_level: item.blocking_level,
      severity: item.severity,
      action_path: item.action_path,
    })), { onConflict: 'tenant_id,domain_key' }),
    supabase.from('setup_credentials').upsert(CREDENTIAL_TEMPLATES.map((item) => ({
      tenant_id: tenantId,
      domain_key: item.domain_key,
      credential_key: item.credential_key,
      label: item.label,
      instructions: item.instructions,
      action_path: item.action_path,
      is_sensitive: item.is_sensitive,
      status: item.default_status,
      connection_state: item.connection_state,
    })), { onConflict: 'tenant_id,domain_key,credential_key' }),
    supabase.from('activation_steps').upsert(STEP_TEMPLATES.map((item) => ({
      tenant_id: tenantId,
      domain_key: item.domain_key,
      step_key: item.step_key,
      label: item.label,
      description: item.description,
      sort_order: item.sort_order,
      required: item.required,
      action_path: item.action_path,
    })), { onConflict: 'tenant_id,step_key' }),
    supabase.from('environment_readiness').upsert(ENVIRONMENT_TEMPLATES.map((item) => ({
      tenant_id: tenantId,
      readiness_key: item.readiness_key,
      label: item.label,
      severity: item.severity,
    })), { onConflict: 'tenant_id,readiness_key' }),
  ]);
}

function credentialStatusForDomain(credentials: Array<Record<string, unknown>>, domainKey: string) {
  const items = credentials.filter((item) => asText(item.domain_key) === domainKey);
  const configured = items.filter((item) => asText(item.status) === 'configured').length;
  const required = items.filter((item) => asText(item.status) !== 'optional').length;
  const missing = items.filter((item) => asText(item.status) === 'missing').length;
  const review = items.filter((item) => asText(item.status) === 'needs_review').length;
  return { items, configured, required, missing, review };
}

function deriveDomainState(
  domain: Record<string, unknown>,
  credentials: Array<Record<string, unknown>>,
  context: {
    systemMode: string;
    notificationsEnabled: boolean;
    missingTables: string[];
    launchBlockedCount: number;
    launchWarnCount: number;
    readinessTotal: number;
    pendingApprovals: number;
    totalCommands: number;
    sourceCount: number;
    sourceWarnings: number;
    internalMessageCount: number;
    freshWorkers: number;
    staleWorkers: number;
    latestBriefingTitle: string;
    briefingsCount: number;
    recentAgentRuns: number;
    variantReviewPending: number;
  },
) {
  const domainKey = asText(domain.domain_key);
  const manualStatus = asText(domain.status) || 'pending';
  const manualSeverity = asText(domain.severity) || 'medium';
  const manualMissing = asList(domain.missing_items);
  const creds = credentialStatusForDomain(credentials, domainKey);

  let derivedStatus = 'pending';
  let derivedSeverity = manualSeverity;
  let derivedMissing: string[] = [];

  if (domainKey === 'supabase') {
    if (context.missingTables.length > 0) {
      derivedStatus = 'blocked';
      derivedSeverity = 'critical';
      derivedMissing = context.missingTables.map((item) => `Missing table: ${item}`);
    } else if (context.readinessTotal === 0) {
      derivedStatus = 'warn';
      derivedSeverity = 'high';
      derivedMissing = ['Add and verify launch readiness checks owned by Windows and Supabase.'];
    } else {
      derivedStatus = 'ready';
      derivedSeverity = 'low';
    }
  } else if (domainKey === 'oracle_api') {
    if (!context.systemMode || context.systemMode === 'unknown') {
      derivedStatus = 'blocked';
      derivedSeverity = 'critical';
      derivedMissing = ['Confirm Oracle API mode and Windows-side health visibility.'];
    } else {
      derivedStatus = 'ready';
      derivedSeverity = 'low';
    }
  } else if (domainKey === 'telegram') {
    if (creds.configured >= 2) {
      derivedStatus = 'ready';
      derivedSeverity = 'low';
    } else {
      derivedStatus = 'warn';
      derivedSeverity = 'high';
      derivedMissing = ['Confirm Telegram bot token readiness.', 'Confirm chat routing and test-message path.'];
    }
  } else if (domainKey === 'google') {
    if (creds.configured > 0) {
      derivedStatus = 'ready';
      derivedSeverity = 'low';
    } else {
      derivedStatus = 'optional';
      derivedSeverity = 'low';
      derivedMissing = ['Optional: confirm Gmail, Calendar, or Drive only if those integrations are in scope.'];
    }
  } else if (domainKey === 'providers') {
    if (creds.configured >= 1 && creds.missing === 0) {
      derivedStatus = 'ready';
      derivedSeverity = 'low';
    } else if (creds.configured >= 1) {
      derivedStatus = 'warn';
      derivedSeverity = 'high';
      derivedMissing = ['Review remaining provider fallback or routing credentials.'];
    } else {
      derivedStatus = 'blocked';
      derivedSeverity = 'critical';
      derivedMissing = ['Confirm production model or provider credentials.'];
    }
  } else if (domainKey === 'workers') {
    if (context.freshWorkers > 0) {
      derivedStatus = 'ready';
      derivedSeverity = 'low';
    } else if (context.staleWorkers > 0) {
      derivedStatus = 'warn';
      derivedSeverity = 'critical';
      derivedMissing = ['Mac Mini workers are stale. Verify heartbeat freshness and recovery steps.'];
    } else {
      derivedStatus = 'blocked';
      derivedSeverity = 'critical';
      derivedMissing = ['No fresh Mac Mini worker heartbeat is visible from Windows.'];
    }
  } else if (domainKey === 'review_dashboard') {
    if (context.readinessTotal > 0) {
      derivedStatus = context.launchBlockedCount > 0 ? 'warn' : 'ready';
      derivedSeverity = context.launchBlockedCount > 0 ? 'high' : 'low';
      if (context.launchBlockedCount > 0) derivedMissing = ['Review blocked or warning readiness items before launch approval.'];
    } else {
      derivedStatus = 'in_progress';
      derivedSeverity = 'medium';
      derivedMissing = ['Populate review and readiness surfaces with real pilot or launch evidence.'];
    }
  } else if (domainKey === 'command_center') {
    if (context.totalCommands === 0) {
      derivedStatus = 'warn';
      derivedSeverity = 'high';
      derivedMissing = ['Submit and validate one low-risk plain-language command.'];
    } else if (context.pendingApprovals > 0) {
      derivedStatus = 'warn';
      derivedSeverity = 'high';
      derivedMissing = ['Resolve pending command approvals before activation sign-off.'];
    } else {
      derivedStatus = 'ready';
      derivedSeverity = 'low';
    }
  } else if (domainKey === 'source_registry') {
    if (context.sourceCount === 0) {
      derivedStatus = 'warn';
      derivedSeverity = 'high';
      derivedMissing = ['Add at least one persistent research source.'];
    } else if (context.sourceWarnings > 0) {
      derivedStatus = 'warn';
      derivedSeverity = 'medium';
      derivedMissing = ['Resolve source warnings or duplicates before wider activation.'];
    } else {
      derivedStatus = 'ready';
      derivedSeverity = 'low';
    }
  } else if (domainKey === 'internal_communication') {
    if (context.internalMessageCount > 0 && context.notificationsEnabled) {
      derivedStatus = 'ready';
      derivedSeverity = 'low';
    } else {
      derivedStatus = 'warn';
      derivedSeverity = 'medium';
      derivedMissing = ['Confirm internal message summaries and notifications are visible to staff.'];
    }
  } else if (domainKey === 'nexus_one') {
    if (context.briefingsCount > 0 || context.recentAgentRuns > 0) {
      derivedStatus = 'ready';
      derivedSeverity = 'low';
    } else {
      derivedStatus = 'in_progress';
      derivedSeverity = 'high';
      derivedMissing = ['Generate the first executive briefing or agent run summary for Nexus One.'];
    }
  } else if (domainKey === 'self_healing_review_gate') {
    if (context.variantReviewPending > 0) {
      derivedStatus = 'warn';
      derivedSeverity = 'high';
      derivedMissing = ['Review pending self-improvement variants before promotion.'];
    } else {
      derivedStatus = 'ready';
      derivedSeverity = 'low';
    }
  } else if (domainKey === 'manus_operator') {
    derivedStatus = 'optional';
    derivedSeverity = 'low';
    derivedMissing = ['Optional: record operator-side readiness only if Manus Desktop is being prepared.'];
  }

  const effectiveStatus = worseStatus(manualStatus, derivedStatus);
  const effectiveSeverity = worseSeverity(manualSeverity, derivedSeverity);
  return {
    effective_status: effectiveStatus,
    effective_severity: effectiveSeverity,
    effective_missing_items: unique([...manualMissing, ...derivedMissing]),
    derived_status: derivedStatus,
    derived_severity: derivedSeverity,
  };
}

function deriveEnvironmentState(
  row: Record<string, unknown>,
  context: {
    blockedDomains: number;
    warningDomains: number;
    pendingSteps: number;
    blockedLaunchChecks: number;
    warningLaunchChecks: number;
    activeIncidents: number;
    recentSimulations: number;
  },
) {
  const manualStatus = asText(row.status) || 'pending';
  const manualSeverity = asText(row.severity) || 'medium';
  const manualBlocking = asList(row.blocking_items);
  const manualWarnings = asList(row.warning_items);
  const key = asText(row.readiness_key);
  let derivedStatus = 'pending';
  let derivedSeverity = manualSeverity;
  let blockingItems: string[] = [];
  let warningItems: string[] = [];

  if (key === 'nexus_one') {
    if (context.blockedDomains > 0 || context.activeIncidents > 0) {
      derivedStatus = 'blocked';
      derivedSeverity = 'critical';
      if (context.blockedDomains > 0) blockingItems.push('One or more activation domains remain blocked.');
      if (context.activeIncidents > 0) blockingItems.push('Active incidents are still open.');
    } else if (context.warningDomains > 0 || context.pendingSteps > 0) {
      derivedStatus = 'warn';
      derivedSeverity = 'high';
      if (context.warningDomains > 0) warningItems.push('Some activation domains still need attention.');
      if (context.pendingSteps > 0) warningItems.push('Required activation steps are still incomplete.');
    } else {
      derivedStatus = 'ready';
      derivedSeverity = 'low';
    }
  } else if (key === 'pilot_10_user') {
    if (context.blockedLaunchChecks > 0 || context.blockedDomains > 0) {
      derivedStatus = 'blocked';
      derivedSeverity = 'critical';
      blockingItems.push('Blocked readiness checks must be cleared before the pilot starts.');
    } else if (context.warningLaunchChecks > 0 || context.pendingSteps > 0) {
      derivedStatus = 'warn';
      derivedSeverity = 'high';
      warningItems.push('Pilot readiness still has warning-state items or incomplete activation steps.');
    } else {
      derivedStatus = 'ready';
      derivedSeverity = 'low';
    }
  } else if (key === 'launch_100_user') {
    if (context.blockedLaunchChecks > 0 || context.blockedDomains > 0) {
      derivedStatus = 'blocked';
      derivedSeverity = 'critical';
      blockingItems.push('Do not start the 100-user test until blocked domains and readiness checks are resolved.');
    } else if (context.recentSimulations === 0 || context.warningDomains > 0) {
      derivedStatus = 'warn';
      derivedSeverity = 'high';
      if (context.recentSimulations === 0) warningItems.push('No recent simulation or launch rehearsal is recorded yet.');
      if (context.warningDomains > 0) warningItems.push('Activation domains still show warning-state gaps.');
    } else {
      derivedStatus = 'ready';
      derivedSeverity = 'low';
    }
  }

  return {
    effective_status: worseStatus(manualStatus, derivedStatus),
    effective_severity: worseSeverity(manualSeverity, derivedSeverity),
    effective_blocking_items: unique([...manualBlocking, ...blockingItems]),
    effective_warning_items: unique([...manualWarnings, ...warningItems]),
  };
}

async function buildResponse(supabase: ReturnType<typeof getAdminSupabaseClient>, tenantId: string) {
  await ensureDefaults(supabase, tenantId);

  const [
    domainsRes,
    credentialsRes,
    stepsRes,
    envRes,
    systemConfigRes,
    incidentsRes,
    launchChecksRes,
    blockedLaunchChecksRes,
    warnLaunchChecksRes,
    simulationRes,
    commandPendingApprovalRes,
    commandTotalRes,
    commandRunningRes,
    sourceCountRes,
    sourceWarningRes,
    internalMessagesRes,
    workerRowsRes,
    briefingsRes,
    agentRunsRes,
    variantReviewPendingRes,
  ] = await Promise.all([
    safeRows(supabase.from('setup_domains').select('*').eq('tenant_id', tenantId).order('display_name', { ascending: true })),
    safeRows(supabase.from('setup_credentials').select('*').eq('tenant_id', tenantId).order('domain_key', { ascending: true }).order('label', { ascending: true })),
    safeRows(supabase.from('activation_steps').select('*').eq('tenant_id', tenantId).order('sort_order', { ascending: true })),
    safeRows(supabase.from('environment_readiness').select('*').eq('tenant_id', tenantId).order('label', { ascending: true })),
    safeRows(supabase.from('system_config').select('system_mode,queue_enabled,ai_jobs_enabled,research_jobs_enabled,notifications_enabled,updated_at').eq('scope', 'global').is('scope_id', null).limit(1)),
    safeCount(supabase.from('incident_events').select('*', { count: 'exact', head: true }).in('status', ['open', 'investigating', 'mitigated'])),
    safeRows(supabase.from('launch_readiness_checks').select('id,label,status,severity,updated_at').eq('tenant_id', tenantId).order('updated_at', { ascending: false }).limit(12)),
    safeCount(supabase.from('launch_readiness_checks').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'blocked')),
    safeCount(supabase.from('launch_readiness_checks').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'warn')),
    safeRows(supabase.from('simulation_runs').select('id,simulation_type,status,target_users,started_at,created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(5)),
    safeCount(supabase.from('admin_commands').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('approval_status', 'pending')),
    safeCount(supabase.from('admin_commands').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)),
    safeCount(supabase.from('admin_commands').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('queue_handoff_state', ['queued', 'running'])),
    safeCount(supabase.from('research_sources').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)),
    safeCount(supabase.from('research_sources').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['review', 'error']).or('paused.eq.true,schedule_paused.eq.true')),
    safeCount(supabase.from('internal_messages').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)),
    safeRows(supabase.from('worker_heartbeats').select('worker_id,status,last_heartbeat_at,last_seen_at,worker_type,system_mode').order('last_heartbeat_at', { ascending: false }).limit(20)),
    safeRows(supabase.from('executive_briefings').select('id,title,summary,created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(3)),
    safeCount(supabase.from('agent_run_summaries').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)),
    safeCount(supabase.from('variant_review_queue').select('*', { count: 'exact', head: true }).eq('review_status', 'pending')),
  ]);

  const missingTables = [
    ...(domainsRes.missing ? ['setup_domains'] : []),
    ...(credentialsRes.missing ? ['setup_credentials'] : []),
    ...(stepsRes.missing ? ['activation_steps'] : []),
    ...(envRes.missing ? ['environment_readiness'] : []),
    ...(systemConfigRes.missing ? ['system_config'] : []),
    ...(incidentsRes.missing ? ['incident_events'] : []),
    ...(launchChecksRes.missing ? ['launch_readiness_checks'] : []),
    ...(simulationRes.missing ? ['simulation_runs'] : []),
    ...(commandPendingApprovalRes.missing ? ['admin_commands'] : []),
    ...(sourceCountRes.missing ? ['research_sources'] : []),
    ...(internalMessagesRes.missing ? ['internal_messages'] : []),
    ...(workerRowsRes.missing ? ['worker_heartbeats'] : []),
    ...(briefingsRes.missing ? ['executive_briefings'] : []),
    ...(agentRunsRes.missing ? ['agent_run_summaries'] : []),
    ...(variantReviewPendingRes.missing ? ['variant_review_queue'] : []),
  ];

  const warnings = [
    ...(domainsRes.error ? [`setup_domains: ${asText(domainsRes.error.message)}`] : []),
    ...(credentialsRes.error ? [`setup_credentials: ${asText(credentialsRes.error.message)}`] : []),
    ...(stepsRes.error ? [`activation_steps: ${asText(stepsRes.error.message)}`] : []),
    ...(envRes.error ? [`environment_readiness: ${asText(envRes.error.message)}`] : []),
    ...(systemConfigRes.error ? [`system_config: ${asText(systemConfigRes.error.message)}`] : []),
    ...(workerRowsRes.error ? [`worker_heartbeats: ${asText(workerRowsRes.error.message)}`] : []),
  ];

  const systemConfig = (systemConfigRes.rows[0] || {}) as Record<string, unknown>;
  const workerRows = workerRowsRes.rows as Array<Record<string, unknown>>;
  const now = Date.now();
  const freshWorkers = workerRows.filter((row) => {
    const lastHeartbeat = asText(row.last_heartbeat_at || row.last_seen_at);
    if (!lastHeartbeat) return false;
    return now - new Date(lastHeartbeat).getTime() <= 5 * 60 * 1000;
  }).length;
  const staleWorkers = Math.max(0, workerRows.length - freshWorkers);

  const domainContext = {
    systemMode: asText(systemConfig.system_mode) || 'unknown',
    notificationsEnabled: Boolean(systemConfig.notifications_enabled),
    missingTables: unique(missingTables),
    launchBlockedCount: blockedLaunchChecksRes.count,
    launchWarnCount: warnLaunchChecksRes.count,
    readinessTotal: launchChecksRes.rows.length,
    pendingApprovals: commandPendingApprovalRes.count,
    totalCommands: commandTotalRes.count,
    sourceCount: sourceCountRes.count,
    sourceWarnings: sourceWarningRes.count,
    internalMessageCount: internalMessagesRes.count,
    freshWorkers,
    staleWorkers,
    latestBriefingTitle: asText((briefingsRes.rows[0] as Record<string, unknown> | undefined)?.title),
    briefingsCount: briefingsRes.rows.length,
    recentAgentRuns: agentRunsRes.count,
    variantReviewPending: variantReviewPendingRes.count,
  };

  const domains = (domainsRes.rows as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    ...deriveDomainState(row, credentialsRes.rows as Array<Record<string, unknown>>, domainContext),
  }));

  const blockedDomains = domains.filter((item) => asText(item.effective_status) === 'blocked').length;
  const warningDomains = domains.filter((item) => asText(item.effective_status) === 'warn').length;
  const missingCredentials = (credentialsRes.rows as Array<Record<string, unknown>>).filter((item) => {
    const status = asText(item.status);
    return status !== 'configured' && status !== 'optional';
  }).length;
  const pendingSteps = (stepsRes.rows as Array<Record<string, unknown>>).filter((item) => asText(item.status) !== 'completed' && Boolean(item.required)).length;
  const completedSteps = (stepsRes.rows as Array<Record<string, unknown>>).filter((item) => asText(item.status) === 'completed').length;

  const environmentContext = {
    blockedDomains,
    warningDomains,
    pendingSteps,
    blockedLaunchChecks: blockedLaunchChecksRes.count,
    warningLaunchChecks: warnLaunchChecksRes.count,
    activeIncidents: incidentsRes.count,
    recentSimulations: simulationRes.rows.length,
  };

  const environments = (envRes.rows as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    ...deriveEnvironmentState(row, environmentContext),
  }));

  const overallStatus = blockedDomains > 0 || blockedLaunchChecksRes.count > 0 || incidentsRes.count > 0
    ? 'blocked'
    : (warningDomains > 0 || warnLaunchChecksRes.count > 0 || pendingSteps > 0 || missingCredentials > 0)
    ? 'warn'
    : 'ready';

  const nextStep = (() => {
    const firstRequired = (stepsRes.rows as Array<Record<string, unknown>>).find((item) => Boolean(item.required) && asText(item.status) !== 'completed');
    if (firstRequired) return asText(firstRequired.label) || 'Complete the next required activation step.';
    if (blockedDomains > 0) return 'Resolve the blocked activation domains before pilot or launch approval.';
    if (warnLaunchChecksRes.count > 0) return 'Review warning-state launch checks before expanding readiness scope.';
    return 'Activation state is clear. Re-run readiness before the next launch gate.';
  })();

  const blockingIssues = unique([
    ...domains.filter((item) => asText(item.effective_status) === 'blocked').flatMap((item) => asList(item.effective_missing_items)),
    ...environments.flatMap((item) => asList(item.effective_blocking_items)),
    ...(incidentsRes.count > 0 ? [`${incidentsRes.count} active incidents still require review.`] : []),
  ]).slice(0, 20);

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    tenant_id: tenantId,
    summary: {
      overall_status: overallStatus,
      blocked_domains: blockedDomains,
      warning_domains: warningDomains,
      missing_credentials: missingCredentials,
      pending_steps: pendingSteps,
      completed_steps: completedSteps,
      active_incidents: incidentsRes.count,
      next_step: nextStep,
      blocking_issues: blockingIssues,
    },
    control_plane: {
      system_mode: asText(systemConfig.system_mode) || 'unknown',
      queue_enabled: Boolean(systemConfig.queue_enabled),
      ai_jobs_enabled: Boolean(systemConfig.ai_jobs_enabled),
      research_jobs_enabled: Boolean(systemConfig.research_jobs_enabled),
      notifications_enabled: Boolean(systemConfig.notifications_enabled),
      updated_at: asText(systemConfig.updated_at) || null,
    },
    nexus_one: {
      latest_briefing_title: asText((briefingsRes.rows[0] as Record<string, unknown> | undefined)?.title),
      latest_briefing_at: asText((briefingsRes.rows[0] as Record<string, unknown> | undefined)?.created_at) || null,
      briefings_count: briefingsRes.rows.length,
      pending_command_approvals: commandPendingApprovalRes.count,
      total_commands: commandTotalRes.count,
      running_or_queued_commands: commandRunningRes.count,
      recent_agent_runs: agentRunsRes.count,
      fresh_workers: freshWorkers,
      stale_workers: staleWorkers,
      manus_positioning: 'optional_operator_side_only',
    },
    launch_summary: {
      readiness_checks: launchChecksRes.rows,
      blocked_checks: blockedLaunchChecksRes.count,
      warning_checks: warnLaunchChecksRes.count,
      recent_simulations: simulationRes.rows,
    },
    domains,
    credentials: credentialsRes.rows,
    activation_steps: stepsRes.rows,
    environment_readiness: environments,
    missing_tables: unique(missingTables),
    warnings,
  };
}

export const handler: Handler = async (event) => {
  try {
    await requireStaffUser(event);
    const supabase = getAdminSupabaseClient();

    if (event.httpMethod === 'GET') {
      const query = QuerySchema.parse(event.queryStringParameters || {});
      const body = await buildResponse(supabase, query.tenant_id);
      return json(200, body);
    }

    if (event.httpMethod === 'PATCH') {
      const payload = PatchSchema.parse(JSON.parse(event.body || '{}'));
      await ensureDefaults(supabase, payload.tenant_id);

      if (payload.action === 'update_domain') {
        if (!payload.domain_key) return json(400, { ok: false, error: 'domain_key_required' });
        const update: Record<string, unknown> = { last_checked_at: new Date().toISOString() };
        if (payload.status) update.status = payload.status;
        if (payload.severity) update.severity = payload.severity;
        if (payload.blocking_level) update.blocking_level = payload.blocking_level;
        if (payload.notes !== undefined) update.notes = payload.notes;
        if (payload.missing_items) update.missing_items = payload.missing_items;
        const { error } = await supabase.from('setup_domains').update(update).eq('tenant_id', payload.tenant_id).eq('domain_key', payload.domain_key);
        if (error) throw error;
      }

      if (payload.action === 'update_credential') {
        if (!payload.domain_key || !payload.credential_key) return json(400, { ok: false, error: 'domain_key_and_credential_key_required' });
        const update: Record<string, unknown> = { last_checked_at: new Date().toISOString() };
        if (payload.status) update.status = payload.status;
        if (payload.notes !== undefined) update.notes = payload.notes;
        if (payload.masked_value !== undefined) update.masked_value = payload.masked_value;
        const { error } = await supabase.from('setup_credentials').update(update).eq('tenant_id', payload.tenant_id).eq('domain_key', payload.domain_key).eq('credential_key', payload.credential_key);
        if (error) throw error;
      }

      if (payload.action === 'update_step') {
        if (!payload.step_key) return json(400, { ok: false, error: 'step_key_required' });
        const update: Record<string, unknown> = {};
        if (payload.status) update.status = payload.status;
        if (payload.notes !== undefined) update.notes = payload.notes;
        update.completed_at = payload.status === 'completed' ? new Date().toISOString() : null;
        const { error } = await supabase.from('activation_steps').update(update).eq('tenant_id', payload.tenant_id).eq('step_key', payload.step_key);
        if (error) throw error;
      }

      if (payload.action === 'update_environment') {
        if (!payload.readiness_key) return json(400, { ok: false, error: 'readiness_key_required' });
        const update: Record<string, unknown> = { last_checked_at: new Date().toISOString() };
        if (payload.status) update.status = payload.status;
        if (payload.severity) update.severity = payload.severity;
        if (payload.notes !== undefined) update.notes = payload.notes;
        if (payload.blocking_items) update.blocking_items = payload.blocking_items;
        if (payload.warning_items) update.warning_items = payload.warning_items;
        if (payload.recommended_order) update.recommended_order = payload.recommended_order;
        const { error } = await supabase.from('environment_readiness').update(update).eq('tenant_id', payload.tenant_id).eq('readiness_key', payload.readiness_key);
        if (error) throw error;
      }

      const body = await buildResponse(supabase, payload.tenant_id);
      return json(200, body);
    }

    return json(405, { ok: false, error: 'method_not_allowed' });
  } catch (error: any) {
    return json(Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
};
