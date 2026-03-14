import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { requireTenantRole } from '../lib/auth/requireTenantRole.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';
import { hasValidCronToken, isLocalRequest, parseAllowedTenantIds } from '../util/cron-auth.js';
import { redactText } from '../util/redact.js';
import { openAlert, recordMetric, resolveAlert, sanitizeDetails } from '../lib/monitoring/metrics.js';
import { sendNotifications } from '../lib/monitoring/notify.js';

const MAX_ERROR_LEN = 500;

export const ALERT_RULES = {
  OUTBOX_FAILED_SPIKE_MIN: 10,
  OUTBOX_FAILED_RATE_MIN: 0.2,
  WEBHOOK_FAILED_SPIKE_MIN: 10,
  WEBHOOK_LAG_P95_WARN_SECONDS: 120,
  PROVIDER_DOWN_MINUTES: 10,
  DELIVERY_FAILED_SPIKE_MIN: 10,
  QUEUE_PENDING_WARN_MIN: 100,
  QUEUE_PENDING_CRITICAL_MIN: 500,
  DEAD_LETTER_GROWTH_HOURLY_CRITICAL_MIN: 10,
  WORKER_STALE_ALERT_SECONDS: 300,
  STALE_WORKERS_WHILE_QUEUE_ENABLED_MIN: 1,
};

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback = 15) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function safeErrorText(value) {
  return redactText(String(value || '')).slice(0, MAX_ERROR_LEN);
}

function shouldReturnZeroOnCountError(error) {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  return (
    !message
    || message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('permission denied')
    || details.includes('does not exist')
    || hint.includes('does not exist')
    || code === '42p01'
    || code === '42703'
  );
}

function getTenantIdFromRequest(req) {
  return (
    asText(req.body?.tenant_id)
    || asText(req.query?.tenant_id)
    || asText(req.params?.tenant_id)
    || asText(req.tenant?.id)
    || ''
  );
}

function minutesAgoIso(minutes) {
  return new Date(Date.now() - Math.max(0, minutes) * 60_000).toISOString();
}

async function requireApiKey(req, reply) {
  const key = asText(req.headers['x-api-key']);
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    reply.code(401).send({ ok: false, error: 'unauthorized' });
    return;
  }
  return undefined;
}

async function countRows(table, tenantId, filterColumn, filterValue) {
  let query = supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (filterColumn) query = query.eq(filterColumn, filterValue);

  const { count, error } = await query;
  if (error) {
    if (shouldReturnZeroOnCountError(error)) return 0;
    throw new Error(table + " count failed: " + (error.message || error.details || "unknown"));
  }

  return Number(count || 0);
}

async function countRowsSince(table, tenantId, status, sinceIso, tsColumn) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', status)
    .gte(tsColumn, sinceIso);

  if (error) {
    if (shouldReturnZeroOnCountError(error)) return 0;
    throw new Error(table + " since count failed: " + (error.message || error.details || "unknown"));
  }

  return Number(count || 0);
}

async function loadOldestDueMinutes(tenantId) {
  const now = Date.now();

  const { data, error } = await supabaseAdmin
    .from('outbox_messages')
    .select('next_attempt_at')
    .eq('tenant_id', tenantId)
    .in('status', ['queued', 'failed'])
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`outbox oldest due lookup failed: ${error.message}`);

  const next = data?.next_attempt_at ? new Date(data.next_attempt_at).getTime() : null;
  if (!next || !Number.isFinite(next)) return 0;
  return Math.max(0, Math.floor((now - next) / 60000));
}

function computeLagP95Seconds(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  const now = Date.now();
  const values = rows
    .map((row) => {
      const ts = new Date(row?.received_at || '').getTime();
      if (!Number.isFinite(ts)) return null;
      return Math.max(0, (now - ts) / 1000);
    })
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) return 0;

  values.sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(values.length * 0.95) - 1);
  return Math.round(values[idx]);
}

async function loadWebhookLagP95Seconds(tenantId, sinceIso) {
  const { data, error } = await supabaseAdmin
    .from('webhook_events')
    .select('received_at')
    .eq('tenant_id', tenantId)
    .gte('received_at', sinceIso)
    .order('received_at', { ascending: false })
    .limit(500);

  if (error) {
    if (shouldReturnZeroOnCountError(error)) return 0;
    throw new Error("webhook lag lookup failed: " + (error.message || error.details || "unknown"));
  }
  return computeLagP95Seconds(data || []);
}

async function loadProviderSummary(tenantId) {
  let result = await supabaseAdmin
    .from('channel_accounts')
    .select('provider,is_active,health_status,health_last_changed_at')
    .eq('tenant_id', tenantId);

  if (result.error) {
    const message = String(result.error.message || '').toLowerCase();

    if (shouldReturnZeroOnCountError(result.error)) return {};

    if (message.includes('health_status') || message.includes('health_last_changed_at')) {
      result = await supabaseAdmin
        .from('channel_accounts')
        .select('provider,is_active')
        .eq('tenant_id', tenantId);
    }
  }

  if (result.error) {
    if (shouldReturnZeroOnCountError(result.error)) return {};
    throw new Error('provider summary query failed: ' + (result.error.message || result.error.details || 'unknown'));
  }

  const summary = {};

  for (const row of result.data || []) {
    const provider = asText(row.provider || 'unknown') || 'unknown';
    if (!summary[provider]) {
      summary[provider] = {
        total: 0,
        active: 0,
        healthy: 0,
        degraded: 0,
        down: 0,
      };
    }

    summary[provider].total += 1;
    if (row.is_active) summary[provider].active += 1;

    const status = asText(row.health_status || 'healthy') || 'healthy';
    if (status === 'healthy') summary[provider].healthy += 1;
    if (status === 'degraded') summary[provider].degraded += 1;
    if (status === 'down') summary[provider].down += 1;
  }

  return summary;
}

async function loadDownChannelsOverMinutes(tenantId, minutes) {
  const thresholdIso = minutesAgoIso(minutes);
  const { count, error } = await supabaseAdmin
    .from('channel_accounts')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('health_status', 'down')
    .lte('health_last_changed_at', thresholdIso);

  if (error) {
    if (shouldReturnZeroOnCountError(error)) return 0;
    throw new Error('provider down count failed: ' + (error.message || error.details || 'unknown'));
  }

  return Number(count || 0);
}


async function countQueueRows(tenantId, statuses, sinceIso = null, tsColumn = 'updated_at') {
  let query = supabaseAdmin
    .from('job_queue')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (Array.isArray(statuses) && statuses.length > 0) query = query.in('status', statuses);
  if (sinceIso) query = query.gte(tsColumn, sinceIso);

  const { count, error } = await query;
  if (error) {
    if (shouldReturnZeroOnCountError(error)) return 0;
    throw new Error('job_queue count failed: ' + (error.message || error.details || 'unknown'));
  }

  return Number(count || 0);
}

async function countWorkerRowsByFreshness(tenantId, staleCutoffIso, isStale) {
  let query = supabaseAdmin
    .from('worker_heartbeats')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_scope', tenantId);

  query = isStale
    ? query.lt('last_seen_at', staleCutoffIso)
    : query.gte('last_seen_at', staleCutoffIso);

  const { count, error } = await query;
  if (error) {
    if (shouldReturnZeroOnCountError(error)) return 0;
    throw new Error('worker_heartbeats freshness count failed: ' + (error.message || error.details || 'unknown'));
  }

  return Number(count || 0);
}

async function loadOpenAlerts(tenantId, limit = 10) {
  const { data, error } = await supabaseAdmin
    .from('alert_events')
    .select('id,tenant_id,alert_key,severity,message,details,status,opened_at,resolved_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(limit);

  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('relation') && message.includes('does not exist')) return [];
    throw new Error(`alert events query failed: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    alert_key: row.alert_key,
    severity: row.severity,
    message: row.message,
    details: sanitizeDetails(row.details || {}),
    status: row.status,
    opened_at: row.opened_at,
    resolved_at: row.resolved_at,
  }));
}

async function loadOverviewSnapshot(tenantId, windowMinutes = 15) {
  const sinceIso = minutesAgoIso(windowMinutes);
  const deadLetterSinceIso = minutesAgoIso(60);
  const staleCutoffIso = new Date(Date.now() - (ALERT_RULES.WORKER_STALE_ALERT_SECONDS * 1000)).toISOString();

  const [
    queued,
    sending,
    failed,
    oldestDueMinutes,
    accepted15m,
    ignored15m,
    failed15m,
    lagP95Seconds,
    deliveryPending,
    deliveryDelivered,
    deliveryFailed,
    providers,
    alertsOpen,
    queuePending,
    queueRetryWait,
    queueRunning,
    queueDeadLetter,
    queueDeadLetterLastHour,
    workersStale,
    workersFresh,
  ] = await Promise.all([
    countRows('outbox_messages', tenantId, 'status', 'queued'),
    countRows('outbox_messages', tenantId, 'status', 'sending'),
    countRows('outbox_messages', tenantId, 'status', 'failed'),
    loadOldestDueMinutes(tenantId),
    countRowsSince('webhook_events', tenantId, 'accepted', sinceIso, 'received_at'),
    countRowsSince('webhook_events', tenantId, 'ignored', sinceIso, 'received_at'),
    countRowsSince('webhook_events', tenantId, 'failed', sinceIso, 'received_at'),
    loadWebhookLagP95Seconds(tenantId, sinceIso),
    countRows('messages', tenantId, 'delivery_status', 'pending'),
    countRows('messages', tenantId, 'delivery_status', 'delivered'),
    countRows('messages', tenantId, 'delivery_status', 'failed'),
    loadProviderSummary(tenantId),
    loadOpenAlerts(tenantId, 10),
    countQueueRows(tenantId, ['pending']),
    countQueueRows(tenantId, ['retry_wait']),
    countQueueRows(tenantId, ['running', 'leased']),
    countQueueRows(tenantId, ['dead_letter']),
    countQueueRows(tenantId, ['dead_letter'], deadLetterSinceIso, 'updated_at'),
    countWorkerRowsByFreshness(tenantId, staleCutoffIso, true),
    countWorkerRowsByFreshness(tenantId, staleCutoffIso, false),
  ]);

  return {
    outbox: {
      queued,
      sending,
      failed,
      oldest_due_minutes: oldestDueMinutes,
    },
    webhooks: {
      accepted_15m: accepted15m,
      ignored_15m: ignored15m,
      failed_15m: failed15m,
      lag_p95_seconds: lagP95Seconds,
    },
    delivery: {
      pending: deliveryPending,
      delivered: deliveryDelivered,
      failed: deliveryFailed,
    },
    queue: {
      pending: queuePending,
      retry_wait: queueRetryWait,
      running: queueRunning,
      dead_letter: queueDeadLetter,
      dead_letter_last_hour: queueDeadLetterLastHour,
    },
    workers: {
      stale_count: workersStale,
      fresh_count: workersFresh,
      stale_cutoff_iso: staleCutoffIso,
    },
    providers,
    alerts_open: alertsOpen,
  };
}

function normalizeStatusInput(value) {
  const text = asText(value).toLowerCase();
  if (!text || text === 'open') return 'open';
  if (text === 'all') return 'all';
  if (text === 'ack') return 'ack';
  if (text === 'resolved') return 'resolved';
  return 'open';
}

export function buildAlertRules(snapshot, ruleContext) {
  const failedRecent = Number(ruleContext.failedOutboxLastWindow || 0);
  const totalRecent = Number(ruleContext.totalOutboxLastWindow || 0);
  const failedRate = totalRecent > 0 ? failedRecent / totalRecent : 0;

  return [
    {
      alert_key: 'OUTBOX_FAILED_SPIKE',
      severity: 'critical',
      triggered: failedRecent >= ALERT_RULES.OUTBOX_FAILED_SPIKE_MIN || failedRate >= ALERT_RULES.OUTBOX_FAILED_RATE_MIN,
      message: `Outbox failures are ${failedRecent} in last window, failed rate ${(failedRate * 100).toFixed(1)}%`,
      details: {
        failed_recent: failedRecent,
        total_recent: totalRecent,
        failed_rate: Number(failedRate.toFixed(4)),
      },
    },
    {
      alert_key: 'WEBHOOK_FAILED_SPIKE',
      severity: 'critical',
      triggered: snapshot.webhooks.failed_15m >= ALERT_RULES.WEBHOOK_FAILED_SPIKE_MIN,
      message: `Webhook failed in window: ${snapshot.webhooks.failed_15m}`,
      details: {
        failed_15m: snapshot.webhooks.failed_15m,
      },
    },
    {
      alert_key: 'WEBHOOK_LAG_HIGH',
      severity: 'warn',
      triggered: snapshot.webhooks.lag_p95_seconds > ALERT_RULES.WEBHOOK_LAG_P95_WARN_SECONDS,
      message: `Webhook lag p95 is ${snapshot.webhooks.lag_p95_seconds}s`,
      details: {
        lag_p95_seconds: snapshot.webhooks.lag_p95_seconds,
      },
    },
    {
      alert_key: 'NO_WEBHOOKS_RECEIVED',
      severity: 'warn',
      triggered: snapshot.webhooks.accepted_15m === 0 && Number(ruleContext.activeChannels || 0) > 0,
      message: `No accepted webhooks in last window while ${ruleContext.activeChannels} channels are active`,
      details: {
        accepted_15m: snapshot.webhooks.accepted_15m,
        active_channels: Number(ruleContext.activeChannels || 0),
      },
    },
    {
      alert_key: 'PROVIDER_DOWN',
      severity: Number(ruleContext.providersDownOverThreshold || 0) > 0 ? 'critical' : 'warn',
      triggered: Number(ruleContext.providersDownOverThreshold || 0) > 0,
      message: `Providers down for >${ALERT_RULES.PROVIDER_DOWN_MINUTES}m: ${ruleContext.providersDownOverThreshold}`,
      details: {
        down_channels: Number(ruleContext.providersDownOverThreshold || 0),
      },
    },
    {
      alert_key: 'DELIVERY_FAILURE_SPIKE',
      severity: 'warn',
      triggered: Number(ruleContext.deliveryFailedLastWindow || 0) >= ALERT_RULES.DELIVERY_FAILED_SPIKE_MIN,
      message: `Delivery failures in window: ${ruleContext.deliveryFailedLastWindow}`,
      details: {
        failed_15m: Number(ruleContext.deliveryFailedLastWindow || 0),
      },
    },
    {
      alert_key: 'QUEUE_PENDING_SPIKE',
      severity: Number(snapshot.queue.pending || 0) + Number(snapshot.queue.retry_wait || 0) >= ALERT_RULES.QUEUE_PENDING_CRITICAL_MIN ? 'critical' : 'warn',
      triggered: Number(snapshot.queue.pending || 0) + Number(snapshot.queue.retry_wait || 0) >= ALERT_RULES.QUEUE_PENDING_WARN_MIN,
      message: `Queue pending depth is ${Number(snapshot.queue.pending || 0) + Number(snapshot.queue.retry_wait || 0)} (warn ${ALERT_RULES.QUEUE_PENDING_WARN_MIN}, critical ${ALERT_RULES.QUEUE_PENDING_CRITICAL_MIN})`,
      details: {
        pending: Number(snapshot.queue.pending || 0),
        retry_wait: Number(snapshot.queue.retry_wait || 0),
        running: Number(snapshot.queue.running || 0),
        warn_threshold: ALERT_RULES.QUEUE_PENDING_WARN_MIN,
        critical_threshold: ALERT_RULES.QUEUE_PENDING_CRITICAL_MIN,
      },
    },
    {
      alert_key: 'QUEUE_DEAD_LETTER_GROWTH',
      severity: 'critical',
      triggered: Number(snapshot.queue.dead_letter_last_hour || 0) >= ALERT_RULES.DEAD_LETTER_GROWTH_HOURLY_CRITICAL_MIN,
      message: `Queue dead-letter growth in last hour is ${snapshot.queue.dead_letter_last_hour} (threshold ${ALERT_RULES.DEAD_LETTER_GROWTH_HOURLY_CRITICAL_MIN})`,
      details: {
        dead_letter_total: Number(snapshot.queue.dead_letter || 0),
        dead_letter_last_hour: Number(snapshot.queue.dead_letter_last_hour || 0),
        threshold: ALERT_RULES.DEAD_LETTER_GROWTH_HOURLY_CRITICAL_MIN,
      },
    },
    {
      alert_key: 'WORKERS_STALE_WHILE_QUEUE_ENABLED',
      severity: 'critical',
      triggered: Boolean(ruleContext.queueEnabled) && Number(snapshot.workers.stale_count || 0) >= ALERT_RULES.STALE_WORKERS_WHILE_QUEUE_ENABLED_MIN,
      message: `Stale workers detected while queue enabled: ${snapshot.workers.stale_count}`,
      details: {
        queue_enabled: Boolean(ruleContext.queueEnabled),
        stale_workers: Number(snapshot.workers.stale_count || 0),
        fresh_workers: Number(snapshot.workers.fresh_count || 0),
        threshold: ALERT_RULES.STALE_WORKERS_WHILE_QUEUE_ENABLED_MIN,
        stale_cutoff_iso: snapshot.workers.stale_cutoff_iso || null,
      },
    },
  ];
}

export async function adminMonitoringV2Routes(fastify) {
  const agentRoleGuard = requireTenantRole({
    supabaseAdmin,
    allowedRoles: ['owner', 'admin', 'agent'],
  });

  const ownerAdminRoleGuard = requireTenantRole({
    supabaseAdmin,
    allowedRoles: ['owner', 'admin'],
  });

  const cronTenantAllowlist = parseAllowedTenantIds(ENV.ORACLE_TENANT_IDS);

  async function requireRunnerAuth(req, reply) {
    const tenantId = getTenantIdFromRequest(req);
    if (!tenantId) {
      return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });
    }

    req.monitoringTenantId = tenantId;

    const hasCronHeader = Boolean(asText(req.headers['x-cron-token']));
    if (hasCronHeader) {
      if (!hasValidCronToken(req, ENV.ORACLE_CRON_TOKEN)) {
        return reply.code(401).send({ ok: false, error: 'invalid_cron_token' });
      }

      if (!isLocalRequest(req)) {
        return reply.code(403).send({ ok: false, error: 'cron_not_from_localhost' });
      }

      if (cronTenantAllowlist.size === 0) {
        return reply.code(500).send({ ok: false, error: 'cron_tenant_allowlist_not_configured' });
      }

      if (!cronTenantAllowlist.has(tenantId)) {
        return reply.code(403).send({ ok: false, error: 'tenant_not_allowed_for_cron' });
      }

      req.user = { id: 'system:cron', jwt: null };
      req.tenant = { id: tenantId, role: 'system' };
      req.auth_mode = 'cron';
      return undefined;
    }

    await ownerAdminRoleGuard(req, reply);
    if (reply.sent) return undefined;

    const scopedTenantId = asText(req.tenant?.id);
    if (scopedTenantId && scopedTenantId !== tenantId) {
      return reply.code(403).send({ ok: false, error: 'tenant_scope_mismatch' });
    }

    req.auth_mode = 'user';
    return undefined;
  }

  fastify.get('/admin/monitoring/overview', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const snapshot = await loadOverviewSnapshot(tenantId, 15);
      return reply.send({
        ok: true,
        now: new Date().toISOString(),
        safe_mode: ENV.SAFE_MODE,
        ...snapshot,
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId }, 'admin monitoring overview failed');
      return reply.code(500).send({ ok: false, error: safeErrorText(error?.message || error) });
    }
  });

  fastify.get('/admin/monitoring/alerts', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    const status = normalizeStatusInput(req.query?.status);
    const limit = Math.min(200, Math.max(1, asInt(req.query?.limit, 50)));

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      let query = supabaseAdmin
        .from('alert_events')
        .select('id,tenant_id,alert_key,severity,message,details,status,opened_at,resolved_at')
        .eq('tenant_id', tenantId)
        .order('opened_at', { ascending: false })
        .limit(limit);

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw new Error(`alert events list failed: ${error.message}`);

      return reply.send({
        ok: true,
        items: (data || []).map((row) => ({
          id: row.id,
          tenant_id: row.tenant_id,
          alert_key: row.alert_key,
          severity: row.severity,
          message: row.message,
          details: sanitizeDetails(row.details || {}),
          status: row.status,
          opened_at: row.opened_at,
          resolved_at: row.resolved_at,
        })),
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId }, 'admin monitoring alerts failed');
      return reply.code(500).send({ ok: false, error: safeErrorText(error?.message || error) });
    }
  });

  fastify.post('/admin/monitoring/alerts/ack', {
    preHandler: [requireApiKey, ownerAdminRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const alertId = asInt(req.body?.alert_id, 0);

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });
    if (!alertId) return reply.code(400).send({ ok: false, error: 'missing_alert_id' });

    try {
      const { data, error } = await supabaseAdmin
        .from('alert_events')
        .update({ status: 'ack' })
        .eq('tenant_id', tenantId)
        .eq('id', alertId)
        .in('status', ['open'])
        .select('id,tenant_id,alert_key,severity,message,details,status,opened_at,resolved_at')
        .maybeSingle();

      if (error) throw new Error(`alert ack failed: ${error.message}`);
      if (!data) return reply.code(404).send({ ok: false, error: 'alert_not_found_or_not_open' });

      return reply.send({
        ok: true,
        item: {
          ...data,
          details: sanitizeDetails(data.details || {}),
        },
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, alert_id: alertId }, 'admin monitoring alert ack failed');
      return reply.code(500).send({ ok: false, error: safeErrorText(error?.message || error) });
    }
  });

  fastify.post('/admin/monitoring/alerts/test', {
    preHandler: [requireApiKey, ownerAdminRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const severity = asText(req.body?.severity || 'info') || 'info';
    const message = asText(req.body?.message || 'Nexus test alert') || 'Nexus test alert';

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const alertEvent = {
        tenant_id: tenantId,
        alert_key: 'TEST_ALERT',
        severity,
        message,
        details: { source: 'manual_test' },
      };

      const notifyResult = await sendNotifications({ tenant_id: tenantId, alert_event: alertEvent });

      return reply.send({
        ok: true,
        tenant_id: tenantId,
        ...notifyResult,
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId }, 'admin monitoring test alert failed');
      return reply.code(500).send({ ok: false, error: safeErrorText(error?.message || error) });
    }
  });

  fastify.post('/admin/monitoring/run', {
    preHandler: [requireApiKey, requireRunnerAuth],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = req.monitoringTenantId || getTenantIdFromRequest(req);
    const windowMinutes = Math.min(60, Math.max(5, asInt(req.body?.window_minutes, 15)));

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const snapshot = await loadOverviewSnapshot(tenantId, windowMinutes);
      const sinceIso = minutesAgoIso(windowMinutes);

      const [
        failedOutboxLastWindow,
        totalOutboxLastWindow,
        deliveryFailedLastWindow,
        providersDownOverThreshold,
        activeChannels,
      ] = await Promise.all([
        countRowsSince('outbox_messages', tenantId, 'failed', sinceIso, 'updated_at'),
        (async () => {
          const { count, error } = await supabaseAdmin
            .from('outbox_messages')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .in('status', ['sent', 'failed'])
            .gte('updated_at', sinceIso);

          if (error) throw new Error(`outbox total recent count failed: ${error.message}`);
          return Number(count || 0);
        })(),
        countRowsSince('message_delivery_events', tenantId, 'failed', sinceIso, 'occurred_at'),
        loadDownChannelsOverMinutes(tenantId, ALERT_RULES.PROVIDER_DOWN_MINUTES),
        (async () => {
          const { count, error } = await supabaseAdmin
            .from('channel_accounts')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('is_active', true);
          if (error) {
            if (shouldReturnZeroOnCountError(error)) return 0;
            throw new Error("active channel count failed: " + (error.message || error.details || "unknown"));
          }
          return Number(count || 0);
        })(),
      ]);

      const rules = buildAlertRules(snapshot, {
        failedOutboxLastWindow,
        totalOutboxLastWindow,
        deliveryFailedLastWindow,
        providersDownOverThreshold,
        activeChannels,
        queueEnabled: ENV.QUEUE_ENABLED,
      });

      const results = [];

      for (const rule of rules) {
        if (rule.triggered) {
          const opened = await openAlert({
            tenant_id: tenantId,
            alert_key: rule.alert_key,
            severity: rule.severity,
            message: rule.message,
            details: rule.details,
            debounceMinutes: 10,
          });

          let notify = { ok: true, skipped: true, reason: 'already_open' };
          if (opened.action === 'opened') {
            notify = await sendNotifications({
              tenant_id: tenantId,
              alert_event: {
                tenant_id: tenantId,
                alert_key: rule.alert_key,
                severity: rule.severity,
                message: rule.message,
                details: rule.details,
              },
            });
          }

          results.push({
            alert_key: rule.alert_key,
            severity: rule.severity,
            triggered: true,
            action: opened.action,
            notify,
          });
          continue;
        }

        const resolved = await resolveAlert({
          tenant_id: tenantId,
          alert_key: rule.alert_key,
          message: `Recovered: ${rule.message}`,
          details: rule.details,
        });

        results.push({
          alert_key: rule.alert_key,
          severity: rule.severity,
          triggered: false,
          action: resolved.action,
        });
      }

      await Promise.allSettled([
        recordMetric({ tenant_id: tenantId, metric: 'monitoring.outbox.failed', value_num: snapshot.outbox.failed }),
        recordMetric({ tenant_id: tenantId, metric: 'monitoring.webhooks.failed_15m', value_num: snapshot.webhooks.failed_15m }),
        recordMetric({ tenant_id: tenantId, metric: 'monitoring.webhooks.lag_p95_seconds', value_num: snapshot.webhooks.lag_p95_seconds }),
        recordMetric({ tenant_id: tenantId, metric: 'monitoring.delivery.failed', value_num: snapshot.delivery.failed }),
        recordMetric({ tenant_id: tenantId, metric: 'monitoring.queue.pending', value_num: Number(snapshot.queue.pending || 0) + Number(snapshot.queue.retry_wait || 0) }),
        recordMetric({ tenant_id: tenantId, metric: 'monitoring.queue.dead_letter_last_hour', value_num: snapshot.queue.dead_letter_last_hour }),
        recordMetric({ tenant_id: tenantId, metric: 'monitoring.workers.stale', value_num: snapshot.workers.stale_count }),
      ]);

      return reply.send({
        ok: true,
        tenant_id: tenantId,
        auth_mode: req.auth_mode || 'unknown',
        window_minutes: windowMinutes,
        snapshot,
        rules: results,
        summary: {
          opened: results.filter((row) => row.action === 'opened').length,
          already_open: results.filter((row) => row.action === 'already_open').length,
          debounced: results.filter((row) => row.action === 'debounced').length,
          resolved: results.filter((row) => row.action === 'resolved').length,
          noop: results.filter((row) => row.action === 'noop').length,
        },
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId }, 'admin monitoring run failed');
      return reply.code(500).send({ ok: false, error: safeErrorText(error?.message || error) });
    }
  });
}
