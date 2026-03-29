import { verifySupabaseJwt } from './verifySupabaseJwt.js';
import { getUserPermissions, hasPermission } from './permissions.js';
import { enforceTenantAuthSettings } from './tenantAuthSettings.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
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

export function requireTenantPermission({ supabaseAdmin, permission, mfaMode = null }) {
  const normalizedPermission = asText(permission).toLowerCase();

  return async function tenantPermissionPreHandler(req, reply) {
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

      const membership = await getUserPermissions({
        supabaseAdmin,
        tenant_id: tenantId,
        user_id: userId,
      });

      if (!membership?.role && !membership?.role_id) {
        return reply.code(403).send({ ok: false, error: 'not_in_tenant' });
      }

      const allowed = await hasPermission({
        supabaseAdmin,
        tenant_id: tenantId,
        user_id: userId,
        permission: normalizedPermission,
      });

      if (!allowed) {
        req.log.warn({
          tenant_id: tenantId,
          user_id: userId,
          required_permission: normalizedPermission,
          role: membership.role || membership.role_key || null,
          role_id: membership.role_id || null,
          membership_table: membership.membership_table || null,
        }, 'Tenant permission denied');

        return reply.code(403).send({
          ok: false,
          error: 'missing_permission',
          details: {
            required_permission: normalizedPermission,
            role: membership.role || membership.role_key || null,
            role_id: membership.role_id || null,
            membership_table: membership.membership_table || null,
          },
        });
      }

      req.user = { id: userId, jwt };
      req.tenant = {
        id: tenantId,
        role: membership.role || membership.role_key || null,
        role_id: membership.role_id || null,
        permissions: membership.permissions_array || [],
      };
      req.permission = normalizedPermission;

      return undefined;
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 401;
      req.log.warn({ err: error, permission: normalizedPermission }, 'Tenant permission auth check failed');
      return reply.code(statusCode).send({ ok: false, error: String(error?.message || 'unauthorized') });
    }
  };
}
