import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { verifySupabaseJwt } from '../lib/auth/verifySupabaseJwt.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';
import { buildCredentialReadinessSnapshot, verifyCredentialIntegration } from '../lib/adminCredentialReadiness.js';

const ADMIN_ROLES = new Set(['owner', 'admin', 'super_admin']);

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

async function requireApiKey(req, reply) {
  const key = asText(req.headers['x-api-key']);
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    return reply.code(401).send({ ok: false, error: 'unauthorized' });
  }
  return undefined;
}

async function requireAdminUser(req, reply) {
  try {
    const jwt = await verifySupabaseJwt(req, { supabaseAdmin });
    const userId = asText(jwt?.sub);
    if (!userId) return reply.code(401).send({ ok: false, error: 'invalid_token_subject' });

    const memberships = await supabaseAdmin
      .from('tenant_memberships')
      .select('tenant_id,role')
      .eq('user_id', userId);

    if (memberships.error && !isMissingSchema(memberships.error)) {
      throw new Error(`tenant_memberships lookup failed: ${memberships.error.message}`);
    }

    const rows = Array.isArray(memberships.data) ? memberships.data : [];
    const adminMemberships = rows.filter((row) => ADMIN_ROLES.has(asText(row.role).toLowerCase()));
    if (adminMemberships.length === 0) {
      return reply.code(403).send({ ok: false, error: 'admin_role_required' });
    }

    req.user = { id: userId, jwt };
    req.admin = {
      roles: Array.from(new Set(adminMemberships.map((row) => asText(row.role).toLowerCase()))),
      tenant_ids: Array.from(new Set(adminMemberships.map((row) => asText(row.tenant_id)).filter(Boolean))),
    };
    return undefined;
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 401;
    req.log.warn({ err: error }, 'Admin auth failed');
    return reply.code(statusCode).send({ ok: false, error: String(error?.message || 'unauthorized') });
  }
}

function tenantAllowed(req, tenantId) {
  return Array.isArray(req?.admin?.tenant_ids) && req.admin.tenant_ids.includes(tenantId);
}

export async function adminCredentialRoutes(fastify) {
  fastify.get('/api/admin/credential-readiness', {
    preHandler: [requireApiKey, requireAdminUser],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id);
    if (!tenantId) return reply.code(400).send({ ok: false, error: 'tenant_id_required' });
    if (!tenantAllowed(req, tenantId)) return reply.code(403).send({ ok: false, error: 'tenant_scope_required' });

    try {
      const snapshot = await buildCredentialReadinessSnapshot(tenantId);
      return reply.send(snapshot);
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId }, 'credential readiness snapshot failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/api/admin/credential-readiness/:integration_key/verify', {
    preHandler: [requireApiKey, requireAdminUser],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.query?.tenant_id);
    const integrationKey = asText(req.params?.integration_key);
    if (!tenantId) return reply.code(400).send({ ok: false, error: 'tenant_id_required' });
    if (!integrationKey) return reply.code(400).send({ ok: false, error: 'integration_key_required' });
    if (!tenantAllowed(req, tenantId)) return reply.code(403).send({ ok: false, error: 'tenant_scope_required' });

    try {
      const verification = await verifyCredentialIntegration(tenantId, integrationKey);
      const snapshot = await buildCredentialReadinessSnapshot(tenantId);
      return reply.send({ ok: true, verification, ...snapshot });
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      req.log.error({ err: error, tenant_id: tenantId, integration_key: integrationKey }, 'credential readiness verify failed');
      return reply.code(statusCode).send({ ok: false, error: String(error?.message || error) });
    }
  });
}