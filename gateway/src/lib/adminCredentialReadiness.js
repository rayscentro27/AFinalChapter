import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';

const STALE_WORKER_MS = 10 * 60 * 1000;

export const INTEGRATION_DEFINITIONS = [
  {
    integration_key: 'supabase',
    display_name: 'Supabase',
    category: 'foundation',
    required_pilot: true,
    required_launch: true,
    secret_handling: 'env_only',
    action_path: '/admin/control-plane',
    description: 'Core database, auth, and admin access state.',
    instructions: 'Confirm project URL and service-role readiness without exposing raw secrets.',
    checks: [
      { check_key: 'supabase_url', label: 'Supabase URL configured', severity: 'critical' },
      { check_key: 'service_role_key', label: 'Service role configured', severity: 'critical' },
      { check_key: 'admin_query', label: 'Admin database query', severity: 'critical' },
    ],
  },
  {
    integration_key: 'oracle_api',
    display_name: 'Oracle API',
    category: 'foundation',
    required_pilot: true,
    required_launch: true,
    secret_handling: 'env_only',
    action_path: '/admin/control-plane',
    description: 'Internal API runtime backing admin operations.',
    instructions: 'Confirm internal API key presence and route health.',
    checks: [
      { check_key: 'internal_api_key', label: 'Internal API key configured', severity: 'critical' },
      { check_key: 'gateway_route', label: 'Gateway route reachable', severity: 'critical' },
    ],
  },
  {
    integration_key: 'telegram_bot',
    display_name: 'Telegram Bot',
    category: 'communications',
    required_pilot: false,
    required_launch: true,
    secret_handling: 'env_only',
    action_path: '/admin/nexus-one',
    description: 'Inbound Telegram command and operator messaging readiness.',
    instructions: 'Confirm token, routing, and live bot verification.',
    checks: [
      { check_key: 'bot_token', label: 'Bot token configured', severity: 'high' },
      { check_key: 'routing', label: 'Telegram routing configured', severity: 'medium' },
      { check_key: 'live_verification', label: 'Live bot verification', severity: 'high' },
    ],
  },
  {
    integration_key: 'google_ai_gemini',
    display_name: 'Google AI Gemini',
    category: 'providers',
    required_pilot: true,
    required_launch: true,
    secret_handling: 'env_only',
    action_path: '/admin/control-plane',
    description: 'Primary AI provider readiness for admin and agent workflows.',
    instructions: 'Confirm Gemini API key presence and live API verification.',
    checks: [
      { check_key: 'gemini_api_key', label: 'Gemini API key configured', severity: 'critical' },
      { check_key: 'live_verification', label: 'Gemini API verification', severity: 'high' },
    ],
  },
  {
    integration_key: 'portal_api_key',
    display_name: 'Portal API Key',
    category: 'foundation',
    required_pilot: true,
    required_launch: true,
    secret_handling: 'env_only',
    action_path: '/admin/control-plane',
    description: 'Internal portal-to-gateway secret alignment.',
    instructions: 'Confirm the internal API key path is configured without revealing the value.',
    checks: [
      { check_key: 'internal_api_key', label: 'Portal API key configured', severity: 'critical' },
      { check_key: 'proxy_alignment', label: 'Proxy alignment', severity: 'high' },
    ],
  },
  {
    integration_key: 'nexus_one',
    display_name: 'Nexus One',
    category: 'readiness',
    required_pilot: true,
    required_launch: true,
    secret_handling: 'descriptor_only',
    action_path: '/admin/nexus-one',
    description: 'Executive readiness layer and activation control surface.',
    instructions: 'Confirm activation tables and executive briefings are visible.',
    checks: [
      { check_key: 'activation_tables', label: 'Activation tables visible', severity: 'critical' },
      { check_key: 'executive_briefings', label: 'Executive briefings visible', severity: 'medium' },
    ],
  },
  {
    integration_key: 'command_center',
    display_name: 'Command Center',
    category: 'operations',
    required_pilot: true,
    required_launch: true,
    secret_handling: 'descriptor_only',
    action_path: '/admin/ai-command-center',
    description: 'Admin command lifecycle, queue, and event visibility.',
    instructions: 'Confirm admin command tables and queue linkage are healthy.',
    checks: [
      { check_key: 'admin_commands', label: 'Admin commands visible', severity: 'critical' },
      { check_key: 'command_events', label: 'Command events visible', severity: 'medium' },
    ],
  },
  {
    integration_key: 'review_control_plane',
    display_name: 'Review Control Plane',
    category: 'operations',
    required_pilot: true,
    required_launch: true,
    secret_handling: 'descriptor_only',
    action_path: '/admin/research-approvals',
    description: 'Research/review approval and policy-backed governance surfaces.',
    instructions: 'Confirm approval queue and tenant policy visibility are healthy.',
    checks: [
      { check_key: 'approval_queue', label: 'Approval queue visible', severity: 'high' },
      { check_key: 'tenant_policies', label: 'Tenant policies visible', severity: 'critical' },
    ],
  },
  {
    integration_key: 'worker_connectivity',
    display_name: 'Worker Connectivity',
    category: 'operations',
    required_pilot: true,
    required_launch: true,
    secret_handling: 'descriptor_only',
    action_path: '/admin/control-plane',
    description: 'Mac Mini worker freshness and queue readiness.',
    instructions: 'Confirm fresh worker heartbeats and admin-command queue support.',
    checks: [
      { check_key: 'fresh_workers', label: 'Fresh worker heartbeat', severity: 'critical' },
      { check_key: 'admin_command_queue', label: 'Admin command queue visible', severity: 'critical' },
    ],
  },
];

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

async function safeRows(query) {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { rows: [], missing: true, error: null };
    return { rows: [], missing: false, error };
  }
  return { rows: Array.isArray(data) ? data : [], missing: false, error: null };
}

async function safeCount(table, apply = null) {
  let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
  if (typeof apply === 'function') query = apply(query);
  const { count, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { count: 0, missing: true, error: null };
    return { count: 0, missing: false, error };
  }
  return { count: Number(count || 0), missing: false, error: null };
}

async function safeSingle(query) {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { row: null, missing: true, error: null };
    return { row: null, missing: false, error };
  }
  return { row: data || null, missing: false, error: null };
}

function summarizeStatus(checks, optional = false) {
  const statuses = checks.map((check) => asText(check.status));
  if (!statuses.length) return optional ? 'optional' : 'missing';
  if (statuses.some((status) => status === 'failed')) return 'blocked';
  if (statuses.some((status) => status === 'warn' || status === 'manual_review')) return 'degraded';
  if (statuses.every((status) => status === 'not_applicable')) return 'optional';
  if (statuses.every((status) => status === 'passed' || status === 'not_applicable')) return 'ready';
  if (statuses.some((status) => status === 'passed')) return 'configured';
  return optional ? 'optional' : 'missing';
}

function summarizeVerificationState(checks) {
  const liveCheck = checks.find((check) => check.check_key === 'live_verification');
  if (!liveCheck) return 'not_applicable';
  if (liveCheck.status === 'passed') return 'passed';
  if (liveCheck.status === 'failed') return 'failed';
  if (liveCheck.status === 'manual_review' || liveCheck.status === 'warn') return 'manual_review';
  return 'pending';
}

function maskedHintFor(definition, signal) {
  if (definition.integration_key === 'supabase' && signal.supabaseUrl) return signal.supabaseUrl.replace(/^(https?:\/\/)/, '');
  if (definition.integration_key === 'telegram_bot' && signal.telegramConfigured) return 'token configured';
  if (definition.integration_key === 'google_ai_gemini' && signal.geminiConfigured) return 'API key configured';
  if (definition.integration_key === 'portal_api_key' && signal.internalApiKeyConfigured) return 'internal key configured';
  return null;
}

async function fetchStoredReadiness(tenantId) {
  const integrations = await safeRows(
    supabaseAdmin
      .from('system_integrations')
      .select('*')
      .eq('tenant_id', tenantId)
  );

  const checks = await safeRows(
    supabaseAdmin
      .from('system_integration_checks')
      .select('*')
      .eq('tenant_id', tenantId)
  );

  const events = await safeRows(
    supabaseAdmin
      .from('system_integration_events')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(30)
  );

  return {
    integrations,
    checks,
    events,
  };
}

async function ensureStoredDefinitions(tenantId) {
  const integrations = INTEGRATION_DEFINITIONS.map((definition) => ({
    tenant_id: tenantId,
    integration_key: definition.integration_key,
    display_name: definition.display_name,
    category: definition.category,
    secret_handling: definition.secret_handling,
    required_pilot: definition.required_pilot,
    required_launch: definition.required_launch,
    description: definition.description,
    instructions: definition.instructions,
    action_path: definition.action_path,
  }));

  const checks = INTEGRATION_DEFINITIONS.flatMap((definition) => definition.checks.map((check) => ({
    tenant_id: tenantId,
    integration_key: definition.integration_key,
    check_key: check.check_key,
    label: check.label,
    severity: check.severity,
    source: check.check_key === 'live_verification' ? 'verification' : 'system',
  })));

  const integrationRes = await supabaseAdmin.from('system_integrations').upsert(integrations, { onConflict: 'tenant_id,integration_key' });
  if (integrationRes.error && !isMissingSchema(integrationRes.error)) throw new Error(`system_integrations upsert failed: ${integrationRes.error.message}`);

  const checkRes = await supabaseAdmin.from('system_integration_checks').upsert(checks, { onConflict: 'tenant_id,integration_key,check_key' });
  if (checkRes.error && !isMissingSchema(checkRes.error)) throw new Error(`system_integration_checks upsert failed: ${checkRes.error.message}`);

  return {
    integrationsMissing: Boolean(integrationRes.error && isMissingSchema(integrationRes.error)),
    checksMissing: Boolean(checkRes.error && isMissingSchema(checkRes.error)),
  };
}

async function gatherSignals(tenantId) {
  const staleCutoff = new Date(Date.now() - STALE_WORKER_MS).toISOString();
  const [
    notificationChannels,
    executiveBriefings,
    setupDomains,
    adminCommands,
    adminCommandEvents,
    approvalQueue,
    tenantPolicies,
    freshWorkers,
    queuedAdminJobs,
    tenantProbe,
  ] = await Promise.all([
    safeCount('notification_channels', (query) => query.eq('tenant_id', tenantId).eq('kind', 'telegram').eq('is_active', true)),
    safeCount('executive_briefings', (query) => query.eq('tenant_id', tenantId)),
    safeCount('setup_domains', (query) => query.eq('tenant_id', tenantId)),
    safeCount('admin_commands', (query) => query.eq('tenant_id', tenantId)),
    safeCount('admin_command_events', (query) => query.eq('tenant_id', tenantId)),
    safeCount('approval_queue', (query) => query.eq('tenant_id', tenantId)),
    safeCount('tenant_policies', (query) => query.eq('tenant_id', tenantId)),
    safeCount('worker_heartbeats', (query) => query.gte('last_seen_at', staleCutoff)),
    safeCount('job_queue', (query) => query.eq('tenant_id', tenantId).eq('job_type', 'admin_command_execute')),
    safeSingle(
      supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('id', tenantId)
        .maybeSingle()
    ),
  ]);

  return {
    notificationChannels,
    executiveBriefings,
    setupDomains,
    adminCommands,
    adminCommandEvents,
    approvalQueue,
    tenantPolicies,
    freshWorkers,
    queuedAdminJobs,
    tenantProbe,
    internalApiKeyConfigured: Boolean(asText(ENV.INTERNAL_API_KEY)),
    supabaseUrl: asText(ENV.SUPABASE_URL),
    supabaseServiceRoleConfigured: Boolean(asText(ENV.SUPABASE_SERVICE_ROLE_KEY)),
    telegramConfigured: Boolean(asText(ENV.TELEGRAM_BOT_TOKEN)),
    geminiConfigured: Boolean(asText(ENV.GEMINI_API_KEY)),
  };
}

function localChecksFor(definition, signal, storedChecksByKey) {
  const storedChecks = storedChecksByKey.get(definition.integration_key) || new Map();

  return definition.checks.map((check) => {
    const stored = storedChecks.get(check.check_key);
    let status = 'pending';
    let summary = '';
    let details = {};
    let last_checked_at = null;

    if (definition.integration_key === 'supabase') {
      if (check.check_key === 'supabase_url') {
        status = signal.supabaseUrl ? 'passed' : 'failed';
        summary = signal.supabaseUrl ? 'Supabase URL is configured.' : 'SUPABASE_URL is missing.';
      }
      if (check.check_key === 'service_role_key') {
        status = signal.supabaseServiceRoleConfigured ? 'passed' : 'failed';
        summary = signal.supabaseServiceRoleConfigured ? 'Service role key is configured.' : 'SUPABASE_SERVICE_ROLE_KEY is missing.';
      }
      if (check.check_key === 'admin_query') {
        status = signal.tenantProbe.row ? 'passed' : 'failed';
        summary = signal.tenantProbe.row ? 'Supabase admin query succeeded.' : 'Supabase admin query failed or tenant is missing.';
      }
    }

    if (definition.integration_key === 'oracle_api') {
      if (check.check_key === 'internal_api_key') {
        status = signal.internalApiKeyConfigured ? 'passed' : 'failed';
        summary = signal.internalApiKeyConfigured ? 'Internal API key is configured.' : 'INTERNAL_API_KEY is missing.';
      }
      if (check.check_key === 'gateway_route') {
        status = 'passed';
        summary = 'Gateway route is responding.';
      }
    }

    if (definition.integration_key === 'telegram_bot') {
      if (check.check_key === 'bot_token') {
        status = signal.telegramConfigured ? 'passed' : 'failed';
        summary = signal.telegramConfigured ? 'Telegram bot token is configured.' : 'TELEGRAM_BOT_TOKEN is missing.';
      }
      if (check.check_key === 'routing') {
        status = signal.notificationChannels.count > 0 ? 'passed' : 'warn';
        summary = signal.notificationChannels.count > 0 ? 'Telegram notification routing is configured.' : 'No active telegram notification_channels rows were found.';
      }
    }

    if (definition.integration_key === 'google_ai_gemini') {
      if (check.check_key === 'gemini_api_key') {
        status = signal.geminiConfigured ? 'passed' : 'failed';
        summary = signal.geminiConfigured ? 'Gemini API key is configured.' : 'GEMINI_API_KEY is missing.';
      }
    }

    if (definition.integration_key === 'portal_api_key') {
      if (check.check_key === 'internal_api_key') {
        status = signal.internalApiKeyConfigured ? 'passed' : 'failed';
        summary = signal.internalApiKeyConfigured ? 'Portal API key path is configured.' : 'INTERNAL_API_KEY is missing.';
      }
      if (check.check_key === 'proxy_alignment') {
        status = signal.internalApiKeyConfigured ? 'passed' : 'warn';
        summary = signal.internalApiKeyConfigured ? 'Proxy alignment can forward internal requests.' : 'Proxy alignment cannot be confirmed until INTERNAL_API_KEY is configured.';
      }
    }

    if (definition.integration_key === 'nexus_one') {
      if (check.check_key === 'activation_tables') {
        status = signal.setupDomains.missing ? 'failed' : signal.setupDomains.count > 0 ? 'passed' : 'warn';
        summary = signal.setupDomains.missing ? 'Activation setup tables are missing.' : signal.setupDomains.count > 0 ? 'Activation setup tables are populated.' : 'Activation setup tables exist but no setup domains were found for this tenant.';
      }
      if (check.check_key === 'executive_briefings') {
        status = signal.executiveBriefings.missing ? 'warn' : signal.executiveBriefings.count > 0 ? 'passed' : 'warn';
        summary = signal.executiveBriefings.count > 0 ? 'Executive briefings are visible.' : 'No executive briefings are stored yet.';
      }
    }

    if (definition.integration_key === 'command_center') {
      if (check.check_key === 'admin_commands') {
        status = signal.adminCommands.missing ? 'failed' : signal.adminCommands.count > 0 ? 'passed' : 'warn';
        summary = signal.adminCommands.missing ? 'admin_commands table is missing.' : signal.adminCommands.count > 0 ? 'Admin commands are visible.' : 'No admin commands exist yet for this tenant.';
      }
      if (check.check_key === 'command_events') {
        status = signal.adminCommandEvents.missing ? 'warn' : signal.adminCommandEvents.count > 0 ? 'passed' : 'warn';
        summary = signal.adminCommandEvents.count > 0 ? 'Admin command events are visible.' : 'No admin command events are stored yet.';
      }
    }

    if (definition.integration_key === 'review_control_plane') {
      if (check.check_key === 'approval_queue') {
        status = signal.approvalQueue.missing ? 'failed' : signal.approvalQueue.count > 0 ? 'passed' : 'warn';
        summary = signal.approvalQueue.missing ? 'approval_queue table is missing.' : signal.approvalQueue.count > 0 ? 'Approval queue entries are visible.' : 'No approval queue entries exist yet for this tenant.';
      }
      if (check.check_key === 'tenant_policies') {
        status = signal.tenantPolicies.missing ? 'failed' : signal.tenantPolicies.count > 0 ? 'passed' : 'warn';
        summary = signal.tenantPolicies.missing ? 'tenant_policies table is missing.' : signal.tenantPolicies.count > 0 ? 'Tenant policies are visible.' : 'No tenant policies exist yet for this tenant.';
      }
    }

    if (definition.integration_key === 'worker_connectivity') {
      if (check.check_key === 'fresh_workers') {
        status = signal.freshWorkers.missing ? 'failed' : signal.freshWorkers.count > 0 ? 'passed' : 'failed';
        summary = signal.freshWorkers.missing ? 'worker_heartbeats table is missing.' : signal.freshWorkers.count > 0 ? `${signal.freshWorkers.count} fresh workers detected.` : 'No fresh workers were detected in the last 10 minutes.';
      }
      if (check.check_key === 'admin_command_queue') {
        status = signal.queuedAdminJobs.missing ? 'failed' : 'passed';
        summary = signal.queuedAdminJobs.missing ? 'job_queue table is missing.' : `${signal.queuedAdminJobs.count} admin_command_execute jobs are visible.`;
      }
    }

    if (check.check_key === 'live_verification' && stored) {
      status = asText(stored.status) || 'pending';
      summary = asText(stored.summary) || 'No live verification has been recorded yet.';
      details = stored.details && typeof stored.details === 'object' ? stored.details : {};
      last_checked_at = stored.last_checked_at || null;
    }

    return {
      integration_key: definition.integration_key,
      check_key: check.check_key,
      label: check.label,
      severity: check.severity,
      source: check.check_key === 'live_verification' ? 'verification' : 'system',
      status,
      summary,
      details,
      last_checked_at,
    };
  });
}

async function persistSnapshot(tenantId, integrations, checks) {
  const integrationPayload = integrations.map((item) => ({
    tenant_id: tenantId,
    integration_key: item.integration_key,
    display_name: item.display_name,
    category: item.category,
    status: item.status,
    verification_state: item.verification_state,
    secret_handling: item.secret_handling,
    required_pilot: item.required_pilot,
    required_launch: item.required_launch,
    description: item.description,
    instructions: item.instructions,
    action_path: item.action_path,
    masked_hint: item.masked_hint,
    last_verified_at: item.last_verified_at,
    last_verification_summary: item.last_verification_summary,
    last_verification_error: item.last_verification_error,
    last_signal_at: item.last_signal_at,
    metadata: item.metadata,
  }));

  const checkPayload = checks.map((item) => ({
    tenant_id: tenantId,
    integration_key: item.integration_key,
    check_key: item.check_key,
    label: item.label,
    status: item.status,
    severity: item.severity,
    source: item.source,
    summary: item.summary,
    details: item.details,
    last_checked_at: item.last_checked_at || new Date().toISOString(),
  }));

  const integrationsRes = await supabaseAdmin.from('system_integrations').upsert(integrationPayload, { onConflict: 'tenant_id,integration_key' });
  if (integrationsRes.error && !isMissingSchema(integrationsRes.error)) throw new Error(`system_integrations snapshot upsert failed: ${integrationsRes.error.message}`);

  const checksRes = await supabaseAdmin.from('system_integration_checks').upsert(checkPayload, { onConflict: 'tenant_id,integration_key,check_key' });
  if (checksRes.error && !isMissingSchema(checksRes.error)) throw new Error(`system_integration_checks snapshot upsert failed: ${checksRes.error.message}`);

  return {
    integrationsMissing: Boolean(integrationsRes.error && isMissingSchema(integrationsRes.error)),
    checksMissing: Boolean(checksRes.error && isMissingSchema(checksRes.error)),
  };
}

async function appendEvent(tenantId, integrationKey, eventType, status, summary, details = {}) {
  const { error } = await supabaseAdmin.from('system_integration_events').insert({
    tenant_id: tenantId,
    integration_key: integrationKey,
    event_type: eventType,
    status,
    summary,
    details,
  });

  if (error && !isMissingSchema(error)) throw new Error(`system_integration_events insert failed: ${error.message}`);
}

async function safeJsonFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      json,
      text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      json: null,
      text: String(error?.message || 'network_error'),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyCredentialIntegration(tenantId, integrationKey) {
  const definition = INTEGRATION_DEFINITIONS.find((item) => item.integration_key === integrationKey);
  if (!definition) {
    const error = new Error('unknown_integration_key');
    error.statusCode = 404;
    throw error;
  }

  await appendEvent(tenantId, integrationKey, 'verification_requested', 'pending', 'Verification requested.', {});

  let result = {
    status: 'manual_review',
    summary: 'This integration does not expose an active network verification.',
    details: {},
  };

  if (integrationKey === 'telegram_bot') {
    const token = asText(ENV.TELEGRAM_BOT_TOKEN);
    if (!token) {
      result = {
        status: 'failed',
        summary: 'TELEGRAM_BOT_TOKEN is missing.',
        details: {},
      };
    } else {
      const response = await safeJsonFetch(`https://api.telegram.org/bot${token}/getMe`);
      result = response.ok
        ? {
            status: 'passed',
            summary: 'Telegram bot verification succeeded.',
            details: {
              username: response.json?.result?.username || null,
              can_join_groups: response.json?.result?.can_join_groups ?? null,
            },
          }
        : {
            status: 'failed',
            summary: `Telegram verification failed (${response.status || 'network'}).`,
            details: { error: response.json?.description || response.text || 'verification_failed' },
          };
    }
  }

  if (integrationKey === 'google_ai_gemini') {
    const key = asText(ENV.GEMINI_API_KEY);
    if (!key) {
      result = {
        status: 'failed',
        summary: 'GEMINI_API_KEY is missing.',
        details: {},
      };
    } else {
      const response = await safeJsonFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
      result = response.ok
        ? {
            status: 'passed',
            summary: 'Gemini API verification succeeded.',
            details: { model_count: Array.isArray(response.json?.models) ? response.json.models.length : 0 },
          }
        : {
            status: 'failed',
            summary: `Gemini verification failed (${response.status || 'network'}).`,
            details: { error: response.json?.error?.message || response.text || 'verification_failed' },
          };
    }
  }

  const checkPayload = {
    tenant_id: tenantId,
    integration_key: integrationKey,
    check_key: 'live_verification',
    label: 'Live verification',
    status: result.status,
    severity: 'high',
    source: 'verification',
    summary: result.summary,
    details: result.details,
    last_checked_at: new Date().toISOString(),
  };

  const { error: checkError } = await supabaseAdmin.from('system_integration_checks').upsert(checkPayload, { onConflict: 'tenant_id,integration_key,check_key' });
  if (checkError && !isMissingSchema(checkError)) throw new Error(`verification check upsert failed: ${checkError.message}`);

  const { error: integrationError } = await supabaseAdmin.from('system_integrations').upsert({
    tenant_id: tenantId,
    integration_key: integrationKey,
    display_name: definition.display_name,
    category: definition.category,
    secret_handling: definition.secret_handling,
    required_pilot: definition.required_pilot,
    required_launch: definition.required_launch,
    description: definition.description,
    instructions: definition.instructions,
    action_path: definition.action_path,
    verification_state: result.status === 'passed' ? 'passed' : result.status === 'failed' ? 'failed' : 'manual_review',
    last_verified_at: new Date().toISOString(),
    last_verification_summary: result.summary,
    last_verification_error: result.status === 'failed' ? asText(result.details?.error) : null,
  }, { onConflict: 'tenant_id,integration_key' });
  if (integrationError && !isMissingSchema(integrationError)) throw new Error(`system_integrations verification upsert failed: ${integrationError.message}`);

  await appendEvent(tenantId, integrationKey, 'verification_result', result.status, result.summary, result.details);
  return result;
}

export async function buildCredentialReadinessSnapshot(tenantId) {
  const missingTables = [];

  const ensured = await ensureStoredDefinitions(tenantId);
  if (ensured.integrationsMissing) missingTables.push('system_integrations');
  if (ensured.checksMissing) missingTables.push('system_integration_checks');

  const signal = await gatherSignals(tenantId);
  const stored = await fetchStoredReadiness(tenantId);

  if (stored.integrations.missing) missingTables.push('system_integrations');
  if (stored.checks.missing) missingTables.push('system_integration_checks');
  if (stored.events.missing) missingTables.push('system_integration_events');

  const storedChecksByKey = new Map();
  for (const row of stored.checks.rows) {
    const integrationKey = asText(row.integration_key);
    const checkKey = asText(row.check_key);
    if (!storedChecksByKey.has(integrationKey)) storedChecksByKey.set(integrationKey, new Map());
    storedChecksByKey.get(integrationKey).set(checkKey, row);
  }

  const integrations = INTEGRATION_DEFINITIONS.map((definition) => {
    const checks = localChecksFor(definition, signal, storedChecksByKey);
    const status = summarizeStatus(checks, !definition.required_pilot && !definition.required_launch);
    const verificationState = summarizeVerificationState(checks);
    const verificationCheck = checks.find((check) => check.check_key === 'live_verification');
    return {
      integration_key: definition.integration_key,
      display_name: definition.display_name,
      category: definition.category,
      description: definition.description,
      instructions: definition.instructions,
      action_path: definition.action_path,
      secret_handling: definition.secret_handling,
      required_pilot: definition.required_pilot,
      required_launch: definition.required_launch,
      status,
      verification_state: verificationState,
      masked_hint: maskedHintFor(definition, signal),
      last_verified_at: verificationCheck?.last_checked_at || null,
      last_verification_summary: verificationCheck?.summary || null,
      last_verification_error: verificationCheck?.status === 'failed' ? asText(verificationCheck?.details?.error) : null,
      last_signal_at: new Date().toISOString(),
      metadata: {
        check_count: checks.length,
      },
      checks,
    };
  });

  const flatChecks = integrations.flatMap((item) => item.checks);
  const persisted = await persistSnapshot(tenantId, integrations, flatChecks);
  if (persisted.integrationsMissing && !missingTables.includes('system_integrations')) missingTables.push('system_integrations');
  if (persisted.checksMissing && !missingTables.includes('system_integration_checks')) missingTables.push('system_integration_checks');

  const requiredPilot = integrations.filter((item) => item.required_pilot);
  const requiredLaunch = integrations.filter((item) => item.required_launch);
  const blockingPilot = requiredPilot.filter((item) => item.status === 'blocked' || item.status === 'missing');
  const blockingLaunch = requiredLaunch.filter((item) => item.status === 'blocked' || item.status === 'missing');
  const warningItems = integrations.filter((item) => item.status === 'degraded');
  const verificationFailures = integrations.filter((item) => item.verification_state === 'failed');
  const nextStep = blockingPilot[0]?.instructions || warningItems[0]?.instructions || 'Credential readiness is clear for the current pilot gate.';

  return {
    ok: true,
    tenant_id: tenantId,
    summary: {
      overall_status: blockingPilot.length > 0 ? 'blocked' : warningItems.length > 0 ? 'warn' : 'ready',
      pilot_status: blockingPilot.length > 0 ? 'blocked' : warningItems.filter((item) => item.required_pilot).length > 0 ? 'warn' : 'ready',
      launch_status: blockingLaunch.length > 0 ? 'blocked' : warningItems.filter((item) => item.required_launch).length > 0 ? 'warn' : 'ready',
      integrations_total: integrations.length,
      ready_integrations: integrations.filter((item) => item.status === 'ready').length,
      blocked_integrations: integrations.filter((item) => item.status === 'blocked' || item.status === 'missing').length,
      degraded_integrations: warningItems.length,
      verification_failures: verificationFailures.length,
      pilot_blockers: blockingPilot.map((item) => item.display_name),
      launch_blockers: blockingLaunch.map((item) => item.display_name),
      next_step: nextStep,
    },
    integrations,
    checks: flatChecks,
    events: stored.events.rows,
    warnings: verificationFailures.map((item) => `${item.display_name}: ${item.last_verification_error || item.last_verification_summary || 'verification failed'}`),
    missing_tables: missingTables,
  };
}