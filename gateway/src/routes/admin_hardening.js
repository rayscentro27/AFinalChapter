import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { requireTenantRole } from '../lib/auth/requireTenantRole.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';
import { redactSecrets, redactText } from '../util/redact.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
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
    error: redactText(row.error || ''),
  }));
}

export async function adminHardeningRoutes(fastify) {
  const agentRoleGuard = requireTenantRole({
    supabaseAdmin,
    allowedRoles: ['owner', 'admin', 'agent'],
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
          error: redactText(row.error || ''),
          payload: redactSecrets(row.payload || {}),
        })),
      });
    } catch (error) {
      req.log.error({ err: error }, 'admin webhook failures failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });
}
