import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { requireTenantRole } from '../lib/auth/requireTenantRole.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';
import { hasValidCronToken, isLocalRequest, parseAllowedTenantIds } from '../util/cron-auth.js';
import { redactSecrets, redactText } from '../util/redact.js';

const MAX_ERROR_LEN = 500;

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function asBool(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function safeErrorText(value) {
  return redactText(String(value || '')).slice(0, MAX_ERROR_LEN);
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

function sanitizeAlertDetails(details) {
  return redactSecrets(details || {});
}

function alertThresholds() {
  return {
    outboxFailed: Math.max(1, asInt(ENV.ALERT_OUTBOX_FAILED_THRESHOLD, 10)),
    outboxOldestDueMinutes: Math.max(1, asInt(ENV.ALERT_OUTBOX_OLDEST_DUE_MINUTES_THRESHOLD, 15)),
    webhookFailed24h: Math.max(1, asInt(ENV.ALERT_WEBHOOK_FAILED_24H_THRESHOLD, 10)),
    deliveryFailed: Math.max(1, asInt(ENV.ALERT_DELIVERY_FAILED_THRESHOLD, 10)),
    channelsDown: Math.max(1, asInt(ENV.ALERT_CHANNELS_DOWN_THRESHOLD, 1)),
    cooldownMinutes: Math.max(1, asInt(ENV.ALERT_NOTIFICATION_COOLDOWN_MINUTES, 30)),
  };
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
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return Number(count || 0);
}

async function countRowsSince(table, tenantId, status, sinceIso) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', status)
    .gte('received_at', sinceIso);

  if (error) throw new Error(`${table} 24h count failed: ${error.message}`);
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

async function loadChannelDownCount(tenantId) {
  const { count, error } = await supabaseAdmin
    .from('channel_accounts')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('health_status', 'down');

  if (error) {
    if (isMissingSchema(error)) return 0;
    throw new Error(`channel down count failed: ${error.message}`);
  }

  return Number(count || 0);
}

async function loadHealthSnapshot(tenantId) {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    queued,
    sending,
    failed,
    oldestDueMinutes,
    accepted24h,
    ignored24h,
    failed24h,
    deliveryPending,
    deliveryDelivered,
    deliveryFailed,
    channelsDown,
  ] = await Promise.all([
    countRows('outbox_messages', tenantId, 'status', 'queued'),
    countRows('outbox_messages', tenantId, 'status', 'sending'),
    countRows('outbox_messages', tenantId, 'status', 'failed'),
    loadOldestDueMinutes(tenantId),
    countRowsSince('webhook_events', tenantId, 'accepted', sinceIso),
    countRowsSince('webhook_events', tenantId, 'ignored', sinceIso),
    countRowsSince('webhook_events', tenantId, 'failed', sinceIso),
    countRows('messages', tenantId, 'delivery_status', 'pending'),
    countRows('messages', tenantId, 'delivery_status', 'delivered'),
    countRows('messages', tenantId, 'delivery_status', 'failed'),
    loadChannelDownCount(tenantId),
  ]);

  return {
    outbox: {
      queued,
      sending,
      failed,
      oldest_due_minutes: oldestDueMinutes,
    },
    webhooks: {
      accepted_24h: accepted24h,
      ignored_24h: ignored24h,
      failed_24h: failed24h,
    },
    delivery: {
      pending: deliveryPending,
      delivered: deliveryDelivered,
      failed: deliveryFailed,
    },
    channels: {
      down: channelsDown,
    },
  };
}

function buildAlertChecks(snapshot) {
  const thresholds = alertThresholds();

  return [
    {
      alert_key: 'outbox_failed_backlog',
      severity: 'critical',
      is_open: snapshot.outbox.failed >= thresholds.outboxFailed,
      summary: `Outbox failed backlog is ${snapshot.outbox.failed} (threshold ${thresholds.outboxFailed})`,
      details: {
        metric: 'outbox.failed',
        value: snapshot.outbox.failed,
        threshold: thresholds.outboxFailed,
      },
    },
    {
      alert_key: 'outbox_oldest_due_lag',
      severity: 'warning',
      is_open: snapshot.outbox.oldest_due_minutes >= thresholds.outboxOldestDueMinutes,
      summary: `Outbox oldest due lag is ${snapshot.outbox.oldest_due_minutes}m (threshold ${thresholds.outboxOldestDueMinutes}m)`,
      details: {
        metric: 'outbox.oldest_due_minutes',
        value: snapshot.outbox.oldest_due_minutes,
        threshold: thresholds.outboxOldestDueMinutes,
      },
    },
    {
      alert_key: 'webhooks_failed_24h_spike',
      severity: 'warning',
      is_open: snapshot.webhooks.failed_24h >= thresholds.webhookFailed24h,
      summary: `Webhook failures in last 24h are ${snapshot.webhooks.failed_24h} (threshold ${thresholds.webhookFailed24h})`,
      details: {
        metric: 'webhooks.failed_24h',
        value: snapshot.webhooks.failed_24h,
        threshold: thresholds.webhookFailed24h,
      },
    },
    {
      alert_key: 'delivery_failed_backlog',
      severity: 'warning',
      is_open: snapshot.delivery.failed >= thresholds.deliveryFailed,
      summary: `Delivery failed backlog is ${snapshot.delivery.failed} (threshold ${thresholds.deliveryFailed})`,
      details: {
        metric: 'delivery.failed',
        value: snapshot.delivery.failed,
        threshold: thresholds.deliveryFailed,
      },
    },
    {
      alert_key: 'channels_down',
      severity: 'critical',
      is_open: snapshot.channels.down >= thresholds.channelsDown,
      summary: `Down channels are ${snapshot.channels.down} (threshold ${thresholds.channelsDown})`,
      details: {
        metric: 'channels.down',
        value: snapshot.channels.down,
        threshold: thresholds.channelsDown,
      },
    },
  ];
}

async function readAlertState(tenantId, alertKey) {
  const { data, error } = await supabaseAdmin
    .from('monitoring_alerts')
    .select('id,tenant_id,alert_key,status,severity,summary,details,first_triggered_at,last_triggered_at,last_notified_at,occurrences,resolved_at')
    .eq('tenant_id', tenantId)
    .eq('alert_key', alertKey)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) {
      throw new Error('monitoring_alerts_missing_schema');
    }
    throw new Error(`monitoring_alerts read failed: ${error.message}`);
  }

  return data || null;
}

async function writeAlertState(tenantId, check) {
  const nowIso = new Date().toISOString();
  const current = await readAlertState(tenantId, check.alert_key);
  const details = sanitizeAlertDetails(check.details);

  if (check.is_open) {
    if (!current) {
      const { data, error } = await supabaseAdmin
        .from('monitoring_alerts')
        .insert({
          tenant_id: tenantId,
          alert_key: check.alert_key,
          status: 'open',
          severity: check.severity,
          summary: check.summary,
          details,
          first_triggered_at: nowIso,
          last_triggered_at: nowIso,
          occurrences: 1,
          resolved_at: null,
          updated_at: nowIso,
        })
        .select('id,tenant_id,alert_key,status,severity,summary,details,first_triggered_at,last_triggered_at,last_notified_at,occurrences,resolved_at')
        .single();

      if (error) throw new Error(`monitoring_alerts insert failed: ${error.message}`);
      return { transition: 'opened', row: data };
    }

    const nextOccurrences = Number(current.occurrences || 0) + 1;
    const firstTriggeredAt = current.status === 'open'
      ? (current.first_triggered_at || nowIso)
      : nowIso;

    const { data, error } = await supabaseAdmin
      .from('monitoring_alerts')
      .update({
        status: 'open',
        severity: check.severity,
        summary: check.summary,
        details,
        first_triggered_at: firstTriggeredAt,
        last_triggered_at: nowIso,
        occurrences: nextOccurrences,
        resolved_at: null,
        updated_at: nowIso,
      })
      .eq('id', current.id)
      .select('id,tenant_id,alert_key,status,severity,summary,details,first_triggered_at,last_triggered_at,last_notified_at,occurrences,resolved_at')
      .single();

    if (error) throw new Error(`monitoring_alerts update failed: ${error.message}`);

    return { transition: current.status === 'open' ? 'still_open' : 'reopened', row: data };
  }

  if (!current || current.status !== 'open') {
    return { transition: 'noop', row: current };
  }

  const { data, error } = await supabaseAdmin
    .from('monitoring_alerts')
    .update({
      status: 'resolved',
      summary: check.summary,
      details,
      resolved_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', current.id)
    .select('id,tenant_id,alert_key,status,severity,summary,details,first_triggered_at,last_triggered_at,last_notified_at,occurrences,resolved_at')
    .single();

  if (error) throw new Error(`monitoring_alerts resolve failed: ${error.message}`);

  return { transition: 'resolved', row: data };
}

async function insertNotificationLog({
  tenantId,
  alertKey,
  status,
  severity,
  summary,
  payload,
  delivered,
  responseCode,
  responseBody,
  error,
}) {
  const { error: insertError } = await supabaseAdmin
    .from('monitoring_alert_notifications')
    .insert({
      tenant_id: tenantId,
      alert_key: alertKey,
      status,
      severity,
      summary,
      payload: sanitizeAlertDetails(payload),
      delivered: Boolean(delivered),
      response_code: responseCode || null,
      response_body: responseBody ? safeErrorText(responseBody) : null,
      error: error ? safeErrorText(error) : null,
      created_at: new Date().toISOString(),
    });

  if (insertError && !isMissingSchema(insertError)) {
    throw new Error(`monitoring_alert_notifications insert failed: ${insertError.message}`);
  }
}

async function markAlertNotified(alertRowId) {
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('monitoring_alerts')
    .update({
      last_notified_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', alertRowId);

  if (error) throw new Error(`monitoring_alerts notify update failed: ${error.message}`);
}

function shouldSendNotification({ transition, row }) {
  const url = asText(ENV.ALERTS_WEBHOOK_URL);
  if (!url) return false;

  if (transition === 'opened' || transition === 'reopened') return true;
  if (transition === 'resolved') return Boolean(ENV.ALERTS_NOTIFY_ON_RESOLVE);
  if (transition !== 'still_open') return false;

  const cooldownMinutes = alertThresholds().cooldownMinutes;
  const lastNotified = row?.last_notified_at ? new Date(row.last_notified_at).getTime() : 0;
  if (!lastNotified || !Number.isFinite(lastNotified)) return true;

  const ageMinutes = (Date.now() - lastNotified) / 60000;
  return ageMinutes >= cooldownMinutes;
}

async function deliverNotification({ tenantId, check, transition, row }) {
  if (!shouldSendNotification({ transition, row })) {
    return { notified: false, reason: 'cooldown_or_disabled' };
  }

  const webhookUrl = asText(ENV.ALERTS_WEBHOOK_URL);
  const payload = {
    source: 'nexus-gateway',
    tenant_id: tenantId,
    alert_key: check.alert_key,
    status: transition === 'resolved' ? 'resolved' : 'triggered',
    severity: check.severity,
    summary: check.summary,
    details: sanitizeAlertDetails(check.details),
    occurred_at: new Date().toISOString(),
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    const text = await response.text().catch(() => '');

    await insertNotificationLog({
      tenantId,
      alertKey: check.alert_key,
      status: payload.status,
      severity: check.severity,
      summary: check.summary,
      payload,
      delivered: response.ok,
      responseCode: response.status,
      responseBody: text,
      error: response.ok ? null : `non_2xx_${response.status}`,
    });

    if (response.ok && row?.id) {
      await markAlertNotified(row.id);
    }

    return {
      notified: response.ok,
      status_code: response.status,
      error: response.ok ? null : `non_2xx_${response.status}`,
    };
  } catch (error) {
    const message = String(error?.message || error);

    try {
      await insertNotificationLog({
        tenantId,
        alertKey: check.alert_key,
        status: transition === 'resolved' ? 'resolved' : 'triggered',
        severity: check.severity,
        summary: check.summary,
        payload,
        delivered: false,
        responseCode: null,
        responseBody: null,
        error: message,
      });
    } catch {
      // Non-blocking.
    }

    return {
      notified: false,
      error: safeErrorText(message),
    };
  }
}

function formatAlertItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    alert_key: row.alert_key,
    status: row.status,
    severity: row.severity,
    summary: row.summary,
    details: sanitizeAlertDetails(row.details || {}),
    first_triggered_at: row.first_triggered_at,
    last_triggered_at: row.last_triggered_at,
    last_notified_at: row.last_notified_at,
    occurrences: Number(row.occurrences || 0),
    resolved_at: row.resolved_at,
  };
}

export async function adminMonitoringRoutes(fastify) {
  const agentRoleGuard = requireTenantRole({
    supabaseAdmin,
    allowedRoles: ['owner', 'admin', 'agent'],
  });

  const cronTenantAllowlist = parseAllowedTenantIds(ENV.ORACLE_TENANT_IDS);

  async function requireAlertsRunnerAuth(req, reply) {
    const tenantId = getTenantIdFromRequest(req);
    if (!tenantId) {
      return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });
    }

    req.alertTenantId = tenantId;

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

    await agentRoleGuard(req, reply);
    if (reply.sent) return undefined;

    const scopedTenantId = asText(req.tenant?.id);
    if (scopedTenantId && scopedTenantId !== tenantId) {
      return reply.code(403).send({ ok: false, error: 'tenant_scope_mismatch' });
    }

    req.auth_mode = 'user';
    return undefined;
  }

  fastify.get('/admin/alerts', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    const status = asText(req.query?.status);
    const limit = Math.min(200, Math.max(1, asInt(req.query?.limit, 100)));

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      let query = supabaseAdmin
        .from('monitoring_alerts')
        .select('id,tenant_id,alert_key,status,severity,summary,details,first_triggered_at,last_triggered_at,last_notified_at,occurrences,resolved_at')
        .eq('tenant_id', tenantId)
        .order('last_triggered_at', { ascending: false })
        .limit(limit);

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) {
        if (isMissingSchema(error)) {
          return reply.send({ ok: true, items: [], warning: 'monitoring_alerts_missing_schema' });
        }
        throw new Error(`monitoring_alerts list failed: ${error.message}`);
      }

      return reply.send({
        ok: true,
        items: (data || []).map(formatAlertItem),
      });
    } catch (error) {
      req.log.error({ err: error }, 'admin alerts list failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/alerts/notifications', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    const limit = Math.min(200, Math.max(1, asInt(req.query?.limit, 100)));

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const { data, error } = await supabaseAdmin
        .from('monitoring_alert_notifications')
        .select('id,tenant_id,alert_key,status,severity,summary,payload,delivered,response_code,response_body,error,created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (isMissingSchema(error)) {
          return reply.send({ ok: true, items: [], warning: 'monitoring_alert_notifications_missing_schema' });
        }
        throw new Error(`monitoring_alert_notifications list failed: ${error.message}`);
      }

      return reply.send({
        ok: true,
        items: (data || []).map((row) => ({
          id: row.id,
          tenant_id: row.tenant_id,
          alert_key: row.alert_key,
          status: row.status,
          severity: row.severity,
          summary: row.summary,
          payload: sanitizeAlertDetails(row.payload || {}),
          delivered: Boolean(row.delivered),
          response_code: row.response_code,
          response_body: safeErrorText(row.response_body || ''),
          error: safeErrorText(row.error || ''),
          created_at: row.created_at,
        })),
      });
    } catch (error) {
      req.log.error({ err: error }, 'admin alert notifications list failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/alerts/run', {
    preHandler: [requireApiKey, requireAlertsRunnerAuth],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = req.alertTenantId || getTenantIdFromRequest(req);
    const notify = asBool(req.body?.notify, true);

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const snapshot = await loadHealthSnapshot(tenantId);
      const checks = buildAlertChecks(snapshot);

      const results = [];

      for (const check of checks) {
        const state = await writeAlertState(tenantId, check);
        let notifyResult = { notified: false, reason: 'not_requested' };

        if (notify) {
          notifyResult = await deliverNotification({
            tenantId,
            check,
            transition: state.transition,
            row: state.row,
          });
        }

        results.push({
          alert_key: check.alert_key,
          severity: check.severity,
          intended_open: check.is_open,
          transition: state.transition,
          state: formatAlertItem(state.row),
          notify: notifyResult,
        });
      }

      return reply.send({
        ok: true,
        tenant_id: tenantId,
        auth_mode: req.auth_mode || 'unknown',
        snapshot,
        summary: {
          opened: results.filter((row) => row.transition === 'opened' || row.transition === 'reopened').length,
          still_open: results.filter((row) => row.transition === 'still_open').length,
          resolved: results.filter((row) => row.transition === 'resolved').length,
          noop: results.filter((row) => row.transition === 'noop').length,
          notified: results.filter((row) => row.notify?.notified).length,
        },
        alerts: results,
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId }, 'admin alerts run failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });
}
