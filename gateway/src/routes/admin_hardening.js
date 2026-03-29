import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { requireTenantRole } from '../lib/auth/requireTenantRole.js';
import { requireTenantPermission } from '../lib/auth/requireTenantPermission.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';
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

async function loadRecentWebhookFailures(tenantId, limit = 10) {
  const { data, error } = await supabaseAdmin
    .from('webhook_events')
    .select('id,provider,external_event_id,received_at,status,error')
    .eq('tenant_id', tenantId)
    .eq('status', 'failed')
    .order('received_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`webhook failures lookup failed: ${error.message}`);

  return (data || []).map((row) => ({
    id: row.id,
    provider: row.provider,
    external_event_id: row.external_event_id,
    received_at: row.received_at,
    status: row.status,
    error: safeErrorText(row.error || ''),
  }));
}

async function loadChannelHealthRows(tenantId) {
  let query = supabaseAdmin
    .from('channel_accounts')
    .select('id,tenant_id,provider,label,is_active,health_status,health_fail_count,health_next_retry_at,health_last_error,health_last_fail_at,health_last_changed_at')
    .eq('tenant_id', tenantId)
    .order('provider', { ascending: true })
    .order('label', { ascending: true });

  let result = await query;

  if (result.error) {
    const msg = String(result.error.message || '').toLowerCase();
    const displayNameMissing = msg.includes('column') && msg.includes('display_name');
    if (displayNameMissing) {
      result = await supabaseAdmin
        .from('channel_accounts')
        .select('id,tenant_id,provider,label,is_active,health_status,health_fail_count,health_next_retry_at,health_last_error,health_last_fail_at,health_last_changed_at')
        .eq('tenant_id', tenantId)
        .order('provider', { ascending: true })
        .order('label', { ascending: true });
    }
  }

  if (result.error) throw new Error(`channel health query failed: ${result.error.message}`);

  return (result.data || []).map((row) => ({
    channel_account_id: row.id,
    tenant_id: row.tenant_id,
    provider: row.provider,
    display_name: row.display_name || row.label || null,
    label: row.label || null,
    is_active: Boolean(row.is_active),
    health_status: row.health_status || 'healthy',
    fail_count: Number(row.health_fail_count || 0),
    next_retry_at: row.health_next_retry_at || null,
    last_error: safeErrorText(row.health_last_error || ''),
    last_fail_at: row.health_last_fail_at || null,
    last_changed_at: row.health_last_changed_at || null,
  }));
}

async function insertProviderHealthEvent({
  tenantId,
  channelAccountId,
  provider,
  severity,
  error,
  context,
}) {
  const { error: insertError } = await supabaseAdmin
    .from('provider_health_events')
    .insert({
      tenant_id: tenantId,
      channel_account_id: channelAccountId,
      provider,
      severity,
      occurred_at: new Date().toISOString(),
      error: error ? safeErrorText(error) : null,
      context: redactSecrets(context || {}),
    });

  if (insertError && !isMissingSchema(insertError)) {
    throw new Error(`provider_health_events insert failed: ${insertError.message}`);
  }
}

export async function adminHardeningRoutes(fastify) {
  const agentRoleGuard = requireTenantRole({
    supabaseAdmin,
    allowedRoles: ['owner', 'admin', 'agent'],
  });
  const channelsManageGuard = requireTenantPermission({
    supabaseAdmin,
    permission: 'channels.manage',
  });

  fastify.get('/admin/health', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [
        queued,
        sending,
        failed,
        oldestDueMinutes,
        accepted24h,
        ignored24h,
        failed24h,
        lastFailures,
        deliveryPending,
        deliveryDelivered,
        deliveryFailed,
      ] = await Promise.all([
        countRows('outbox_messages', tenantId, 'status', 'queued'),
        countRows('outbox_messages', tenantId, 'status', 'sending'),
        countRows('outbox_messages', tenantId, 'status', 'failed'),
        loadOldestDueMinutes(tenantId),
        countRowsSince('webhook_events', tenantId, 'accepted', sinceIso),
        countRowsSince('webhook_events', tenantId, 'ignored', sinceIso),
        countRowsSince('webhook_events', tenantId, 'failed', sinceIso),
        loadRecentWebhookFailures(tenantId, 10),
        countRows('messages', tenantId, 'delivery_status', 'pending'),
        countRows('messages', tenantId, 'delivery_status', 'delivered'),
        countRows('messages', tenantId, 'delivery_status', 'failed'),
      ]);

      return reply.send({
        ok: true,
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
          last_failures: lastFailures,
        },
        delivery: {
          pending: deliveryPending,
          delivered: deliveryDelivered,
          failed: deliveryFailed,
        },
      });
    } catch (error) {
      req.log.error({ err: error }, 'admin health failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/webhooks/failures', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    const limit = Math.min(200, Math.max(1, asInt(req.query?.limit, 50)));

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const { data, error } = await supabaseAdmin
        .from('webhook_events')
        .select('id,provider,external_event_id,received_at,status,error,payload')
        .eq('tenant_id', tenantId)
        .eq('status', 'failed')
        .order('received_at', { ascending: false })
        .limit(limit);

      if (error) throw new Error(`webhook failures query failed: ${error.message}`);

      return reply.send({
        ok: true,
        items: (data || []).map((row) => ({
          id: row.id,
          provider: row.provider,
          external_event_id: row.external_event_id,
          received_at: row.received_at,
          status: row.status,
          error: safeErrorText(row.error || ''),
          payload: redactSecrets(row.payload || {}),
        })),
      });
    } catch (error) {
      req.log.error({ err: error }, 'admin webhook failures failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/channel-health', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const items = await loadChannelHealthRows(tenantId);
      return reply.send({ ok: true, items });
    } catch (error) {
      req.log.error({ err: error }, 'channel health list failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/channel-health/reset', {
    preHandler: [requireApiKey, channelsManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const channelAccountId = asText(req.body?.channel_account_id);

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });
    if (!channelAccountId) return reply.code(400).send({ ok: false, error: 'missing_channel_account_id' });

    try {
      const { data: current, error: currentError } = await supabaseAdmin
        .from('channel_accounts')
        .select('id,tenant_id,provider,label,is_active,health_status,health_fail_count,health_next_retry_at,health_last_error,health_last_fail_at,health_last_changed_at')
        .eq('tenant_id', tenantId)
        .eq('id', channelAccountId)
        .maybeSingle();

      if (currentError) throw new Error(`channel health reset lookup failed: ${currentError.message}`);
      if (!current) return reply.code(404).send({ ok: false, error: 'channel_account_not_found' });

      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('channel_accounts')
        .update({
          health_status: 'healthy',
          health_fail_count: 0,
          health_first_fail_at: null,
          health_last_fail_at: null,
          health_last_error: null,
          health_next_retry_at: null,
          health_last_changed_at: now,
        })
        .eq('tenant_id', tenantId)
        .eq('id', channelAccountId)
        .select('id,tenant_id,provider,label,is_active,health_status,health_fail_count,health_next_retry_at,health_last_error,health_last_fail_at,health_last_changed_at')
        .single();

      if (updateError) throw new Error(`channel health reset failed: ${updateError.message}`);

      try {
        await insertProviderHealthEvent({
          tenantId,
          channelAccountId,
          provider: updated.provider,
          severity: 'info',
          error: null,
          context: {
            action: 'reset',
            by: req.user?.id || null,
          },
        });
      } catch {
        // Non-blocking telemetry.
      }

      return reply.send({
        ok: true,
        item: {
          channel_account_id: updated.id,
          tenant_id: updated.tenant_id,
          provider: updated.provider,
          display_name: updated.display_name || updated.label || null,
          label: updated.label || null,
          is_active: Boolean(updated.is_active),
          health_status: updated.health_status || 'healthy',
          fail_count: Number(updated.health_fail_count || 0),
          next_retry_at: updated.health_next_retry_at || null,
          last_error: safeErrorText(updated.health_last_error || ''),
          last_fail_at: updated.health_last_fail_at || null,
          last_changed_at: updated.health_last_changed_at || null,
        },
      });
    } catch (error) {
      req.log.error({ err: error }, 'channel health reset failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/channel-health/events', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    const channelAccountId = asText(req.query?.channel_account_id);
    const limit = Math.min(200, Math.max(1, asInt(req.query?.limit, 100)));

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      let query = supabaseAdmin
        .from('provider_health_events')
        .select('id,tenant_id,channel_account_id,provider,severity,occurred_at,error,context')
        .eq('tenant_id', tenantId)
        .order('occurred_at', { ascending: false })
        .limit(limit);

      if (channelAccountId) {
        query = query.eq('channel_account_id', channelAccountId);
      }

      const { data, error } = await query;

      if (error) {
        if (isMissingSchema(error)) {
          return reply.send({ ok: true, items: [] });
        }
        throw new Error(`channel health events query failed: ${error.message}`);
      }

      return reply.send({
        ok: true,
        items: (data || []).map((row) => ({
          id: row.id,
          tenant_id: row.tenant_id,
          channel_account_id: row.channel_account_id,
          provider: row.provider,
          severity: row.severity,
          occurred_at: row.occurred_at,
          error: safeErrorText(row.error || ''),
          context: redactSecrets(row.context || {}),
        })),
      });
    } catch (error) {
      req.log.error({ err: error }, 'channel health events failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });
}
