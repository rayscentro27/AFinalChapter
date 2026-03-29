import { verifySupabaseJwt } from './verifySupabaseJwt.js';
import { enforceTenantAuthSettings } from './tenantAuthSettings.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function isMissingRelationError(error, relationName) {
  const msg = String(error?.message || '').toLowerCase();
  const relation = String(relationName || '').toLowerCase();
  return msg.includes('relation') && msg.includes(relation) && msg.includes('does not exist');
}

function getTenantId(req) {
  const fromBody = asText(req?.body?.tenant_id);
  if (fromBody) return fromBody;

  const fromQuery = asText(req?.query?.tenant_id);
  if (fromQuery) return fromQuery;

  const fromParams = asText(req?.params?.tenant_id);
  if (fromParams) return fromParams;

  return null;
}

async function lookupTenantRole({ supabaseAdmin, tenantId, userId }) {
  const primary = await supabaseAdmin
    .from('tenant_memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!primary.error) {
    return asText(primary.data?.role)?.toLowerCase() || null;
  }

  if (!isMissingRelationError(primary.error, 'tenant_memberships')) {
    throw new Error(`tenant_memberships role lookup failed: ${primary.error.message}`);
  }

  const fallback = await supabaseAdmin
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fallback.error) {
    throw new Error(`tenant_members role lookup failed: ${fallback.error.message}`);
  }

  return asText(fallback.data?.role)?.toLowerCase() || null;
}

export function requireTenantRole({ supabaseAdmin, allowedRoles = [], mfaMode = null }) {
  const allowed = new Set((allowedRoles || []).map((role) => String(role || '').toLowerCase()).filter(Boolean));

  return async function tenantRolePreHandler(req, reply) {
    try {
      const jwt = await verifySupabaseJwt(req, { supabaseAdmin });
      const userId = asText(jwt?.sub);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: 'invalid_token_subject' });
      }

      const tenantId = getTenantId(req);
      if (!tenantId) {
        return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });
      }

      await enforceTenantAuthSettings({
        supabaseAdmin,
        tenantId,
        jwt,
        mfaMode,
      });

      const role = await lookupTenantRole({
        supabaseAdmin,
        tenantId,
        userId,
      });

      if (!role) {
        return reply.code(403).send({ ok: false, error: 'not_in_tenant' });
      }

      if (allowed.size > 0 && !allowed.has(role)) {
        return reply.code(403).send({
          ok: false,
          error: 'insufficient_role',
          details: {
            role,
            allowed_roles: Array.from(allowed),
          },
        });
      }

      req.user = { id: userId, jwt };
      req.tenant = { id: tenantId, role };
      return undefined;
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 401;
      req.log.warn({ err: error }, 'Tenant role auth check failed');
      return reply.code(statusCode).send({ ok: false, error: String(error?.message || 'unauthorized') });
    }
  };
}
