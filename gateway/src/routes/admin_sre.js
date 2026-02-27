import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { requireTenantRole } from '../lib/auth/requireTenantRole.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';
import { hasValidCronToken, isLocalRequest, parseAllowedTenantIds } from '../util/cron-auth.js';
import { loadCapacitySnapshot, loadSreSeries, rollup1h, rollup5m } from '../lib/sre/rollup.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
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

async function requireApiKey(req, reply) {
  const key = asText(req.headers['x-api-key']);
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    reply.code(401).send({ ok: false, error: 'unauthorized' });
    return;
  }
  return undefined;
}

function normalizeRange(value) {
  const candidate = asText(value);
  if (candidate === '7d' || candidate === '30d') return candidate;
  return '24h';
}

export async function adminSreRoutes(fastify) {
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

    req.sreTenantId = tenantId;

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

  fastify.post('/admin/sre/rollup/run', {
    preHandler: [requireApiKey, requireRunnerAuth],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = req.sreTenantId || getTenantIdFromRequest(req);
    const horizonHours = Math.min(24 * 7, Math.max(1, asInt(req.body?.horizon_hours, 24)));

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const [fiveMinute, hourly] = await Promise.all([
        rollup5m({ supabaseAdmin, tenant_id: tenantId, horizon_hours: horizonHours }),
        rollup1h({ supabaseAdmin, tenant_id: tenantId }),
      ]);

      const charts = await loadSreSeries({
        supabaseAdmin,
        tenant_id: tenantId,
        range: horizonHours <= 24 ? '24h' : horizonHours <= (7 * 24) ? '7d' : '30d',
      });

      return reply.send({
        ok: true,
        tenant_id: tenantId,
        auth_mode: req.auth_mode || 'unknown',
        rollup_5m: fiveMinute,
        rollup_1h: hourly,
        chart_points: {
          outbox_sent: charts.series?.outbox_sent?.length || 0,
          outbox_failed: charts.series?.outbox_failed?.length || 0,
          webhook_failed: charts.series?.webhook_failed?.length || 0,
        },
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId }, 'admin sre rollup run failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/sre/charts', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    const range = normalizeRange(req.query?.range);

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const result = await loadSreSeries({ supabaseAdmin, tenant_id: tenantId, range });
      return reply.send(result);
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, range }, 'admin sre charts failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/sre/capacity', {
    preHandler: [requireApiKey, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const result = await loadCapacitySnapshot({ supabaseAdmin, tenant_id: tenantId });
      return reply.send(result);
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId }, 'admin sre capacity failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });
}
