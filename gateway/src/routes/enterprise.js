import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';

import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';
import { verifySupabaseJwt } from '../lib/auth/verifySupabaseJwt.js';
import { requireTenantPermission } from '../lib/auth/requireTenantPermission.js';
import {
  LEGACY_ROLE_PERMISSION_MAP,
  PERMISSION_LIST,
} from '../lib/auth/permissionConstants.js';
import { clearPermissionCache } from '../lib/auth/permissions.js';
import { evaluatePolicy } from '../lib/policy/policyEngine.js';
import { clearTenantAuthSettingsCache } from '../lib/auth/tenantAuthSettings.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function lower(value) {
  return asText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || msg.includes('schema cache')
  );
}

function isMissingColumn(error, columnName) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('column') && msg.includes(String(columnName || '').toLowerCase()) && msg.includes('does not exist');
}

function requireApiKey(req, reply) {
  const key = req.headers['x-api-key'];
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    reply.code(401).send({ ok: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

async function requireApiKeyPreHandler(req, reply) {
  if (!requireApiKey(req, reply)) return;
  return undefined;
}

function sanitizePermissions(permissions) {
  const allowed = new Set(PERMISSION_LIST);
  return Array.from(
    new Set(
      asArray(permissions)
        .map((item) => lower(item))
        .filter(Boolean)
        .filter((item) => allowed.has(item) || item === '*')
    )
  );
}

const SYSTEM_ROLE_NAMES = {
  owner: 'Owner',
  admin: 'Admin',
  agent: 'Agent',
  viewer: 'Viewer',
};

async function ensureSystemRoles({ tenantId }) {
  for (const [key, name] of Object.entries(SYSTEM_ROLE_NAMES)) {
    const roleRes = await supabaseAdmin
      .from('tenant_roles')
      .upsert({
        tenant_id: tenantId,
        key,
        name,
        is_system: true,
      }, { onConflict: 'tenant_id,key' })
      .select('id,key')
      .single();

    if (roleRes.error) {
      if (isMissingSchema(roleRes.error)) return;
      throw new Error(`tenant_roles upsert failed: ${roleRes.error.message}`);
    }

    const roleId = roleRes.data?.id;
    if (!roleId) continue;

    const permissions = sanitizePermissions(LEGACY_ROLE_PERMISSION_MAP[key] || []);
    for (const permission of permissions) {
      const insert = await supabaseAdmin
        .from('tenant_role_permissions')
        .upsert({
          tenant_id: tenantId,
          role_id: roleId,
          permission,
        }, { onConflict: 'tenant_id,role_id,permission' });

      if (insert.error && !isMissingSchema(insert.error)) {
        throw new Error(`tenant_role_permissions upsert failed: ${insert.error.message}`);
      }
    }
  }
}

async function listRolesWithPermissions({ tenantId }) {
  await ensureSystemRoles({ tenantId });

  const rolesRes = await supabaseAdmin
    .from('tenant_roles')
    .select('id,tenant_id,key,name,is_system,created_at')
    .eq('tenant_id', tenantId)
    .order('is_system', { ascending: false })
    .order('key', { ascending: true });

  if (rolesRes.error) {
    if (isMissingSchema(rolesRes.error)) return [];
    throw new Error(`roles lookup failed: ${rolesRes.error.message}`);
  }

  const roleIds = (rolesRes.data || []).map((row) => asText(row.id)).filter(Boolean);
  const permsRes = roleIds.length
    ? await supabaseAdmin
      .from('tenant_role_permissions')
      .select('role_id,permission')
      .eq('tenant_id', tenantId)
      .in('role_id', roleIds)
      .order('permission', { ascending: true })
    : { data: [], error: null };

  if (permsRes.error) {
    if (isMissingSchema(permsRes.error)) return rolesRes.data || [];
    throw new Error(`permissions lookup failed: ${permsRes.error.message}`);
  }

  const byRole = new Map();
  for (const row of permsRes.data || []) {
    const roleId = asText(row.role_id);
    if (!roleId) continue;
    const list = byRole.get(roleId) || [];
    list.push(lower(row.permission));
    byRole.set(roleId, list);
  }

  return (rolesRes.data || []).map((row) => ({
    ...row,
    permissions: byRole.get(asText(row.id)) || [],
  }));
}

async function resolveMembershipTable() {
  const preferred = await supabaseAdmin
    .from('tenant_memberships')
    .select('tenant_id')
    .limit(1);

  if (!preferred.error) return 'tenant_memberships';
  if (!isMissingSchema(preferred.error)) throw new Error(`tenant_memberships lookup failed: ${preferred.error.message}`);
  return 'tenant_members';
}

async function listTenantMembers({ tenantId }) {
  const table = await resolveMembershipTable();

  let membersRes = await supabaseAdmin
    .from(table)
    .select('tenant_id,user_id,role,role_id,created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (membersRes.error && isMissingColumn(membersRes.error, 'role_id')) {
    membersRes = await supabaseAdmin
      .from(table)
      .select('tenant_id,user_id,role,created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });
  }

  if (membersRes.error) throw new Error(`tenant members lookup failed: ${membersRes.error.message}`);

  const rows = membersRes.data || [];
  const roleIds = Array.from(new Set(rows.map((row) => asText(row.role_id)).filter(Boolean)));

  const roleMap = new Map();
  if (roleIds.length > 0) {
    const rolesRes = await supabaseAdmin
      .from('tenant_roles')
      .select('id,key,name,is_system')
      .eq('tenant_id', tenantId)
      .in('id', roleIds);

    if (!rolesRes.error) {
      for (const role of rolesRes.data || []) roleMap.set(asText(role.id), role);
    }
  }

  return rows.map((row) => ({
    tenant_id: asText(row.tenant_id),
    user_id: asText(row.user_id),
    role: lower(row.role) || null,
    role_id: asText(row.role_id) || null,
    role_key: row.role_id ? (roleMap.get(asText(row.role_id))?.key || null) : null,
    role_name: row.role_id ? (roleMap.get(asText(row.role_id))?.name || null) : null,
    created_at: row.created_at || null,
  }));
}

async function setMemberRole({ tenantId, userId, roleId }) {
  const roleRes = await supabaseAdmin
    .from('tenant_roles')
    .select('id,key,name,is_system')
    .eq('tenant_id', tenantId)
    .eq('id', roleId)
    .maybeSingle();

  if (roleRes.error) throw new Error(`role lookup failed: ${roleRes.error.message}`);
  if (!roleRes.data) {
    const err = new Error('role_not_found');
    err.statusCode = 404;
    throw err;
  }

  const table = await resolveMembershipTable();
  let upsert = await supabaseAdmin
    .from(table)
    .upsert({
      tenant_id: tenantId,
      user_id: userId,
      role: roleRes.data.key,
      role_id: roleId,
    }, { onConflict: 'tenant_id,user_id' });

  if (upsert.error && isMissingColumn(upsert.error, 'role_id')) {
    upsert = await supabaseAdmin
      .from(table)
      .upsert({
        tenant_id: tenantId,
        user_id: userId,
        role: roleRes.data.key,
      }, { onConflict: 'tenant_id,user_id' });
  }

  if (upsert.error) throw new Error(`member role update failed: ${upsert.error.message}`);

  clearPermissionCache();

  return {
    tenant_id: tenantId,
    user_id: userId,
    role_id: roleId,
    role_key: roleRes.data.key,
    role_name: roleRes.data.name,
  };
}

function inviteTokenHash(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

async function sendInviteEmail({ to, tenantId, token, roleName }) {
  const host = asText(process.env.SMTP_HOST);
  const user = asText(process.env.SMTP_USER);
  const pass = asText(process.env.SMTP_PASS);
  const from = asText(process.env.SMTP_FROM) || user;
  const port = Number(process.env.SMTP_PORT || 587);

  if (!host || !user || !pass || !from) {
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const baseUrl = asText(process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || '');
  const link = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/#/invite-accept?token=${encodeURIComponent(token)}`
    : null;

  await transporter.sendMail({
    from,
    to,
    subject: 'Nexus tenant invite',
    text: [
      `You were invited to tenant ${tenantId}.`,
      roleName ? `Assigned role: ${roleName}` : '',
      link ? `Accept link: ${link}` : `Invite token: ${token}`,
    ].filter(Boolean).join('\n'),
  });

  return { sent: true, link };
}

export async function enterpriseRoutes(fastify) {
  const rolesReadGuard = requireTenantPermission({ supabaseAdmin, permission: 'roles.read' });
  const rolesWriteGuard = requireTenantPermission({ supabaseAdmin, permission: 'roles.write' });
  const membersReadGuard = requireTenantPermission({ supabaseAdmin, permission: 'members.read' });
  const membersWriteGuard = requireTenantPermission({ supabaseAdmin, permission: 'members.write' });
  const policyManageGuard = requireTenantPermission({ supabaseAdmin, permission: 'policy.manage', mfaMode: 'admin' });

  fastify.get('/admin/roles', {
    preHandler: [requireApiKeyPreHandler, rolesReadGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'missing_or_invalid_tenant_id' });

    try {
      const roles = await listRolesWithPermissions({ tenantId });
      return reply.send({ ok: true, tenant_id: tenantId, roles });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/roles', {
    preHandler: [requireApiKeyPreHandler, rolesWriteGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const key = lower(req.body?.key);
    const name = asText(req.body?.name);
    const permissions = sanitizePermissions(req.body?.permissions);

    if (!isUuid(tenantId) || !key || !name) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields' });
    }

    if (!/^[a-z0-9_][a-z0-9_.-]{1,47}$/.test(key)) {
      return reply.code(400).send({ ok: false, error: 'invalid_role_key' });
    }

    try {
      const roleInsert = await supabaseAdmin
        .from('tenant_roles')
        .insert({
          tenant_id: tenantId,
          key,
          name,
          is_system: false,
        })
        .select('id,tenant_id,key,name,is_system,created_at')
        .single();

      if (roleInsert.error) throw new Error(`role create failed: ${roleInsert.error.message}`);

      for (const permission of permissions) {
        const permInsert = await supabaseAdmin
          .from('tenant_role_permissions')
          .upsert({
            tenant_id: tenantId,
            role_id: roleInsert.data.id,
            permission,
          }, { onConflict: 'tenant_id,role_id,permission' });

        if (permInsert.error) throw new Error(`role permission insert failed: ${permInsert.error.message}`);
      }

      clearPermissionCache();
      const roles = await listRolesWithPermissions({ tenantId });
      const role = roles.find((row) => asText(row.id) === asText(roleInsert.data.id)) || {
        ...roleInsert.data,
        permissions,
      };

      return reply.send({ ok: true, tenant_id: tenantId, role });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.put('/admin/roles/:role_id', {
    preHandler: [requireApiKeyPreHandler, rolesWriteGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.query?.tenant_id || req.tenant?.id);
    const roleId = asText(req.params?.role_id);
    const key = lower(req.body?.key);
    const name = asText(req.body?.name);
    const permissions = req.body && Object.prototype.hasOwnProperty.call(req.body, 'permissions')
      ? sanitizePermissions(req.body.permissions)
      : null;

    if (!isUuid(tenantId) || !isUuid(roleId)) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields' });
    }

    try {
      const existing = await supabaseAdmin
        .from('tenant_roles')
        .select('id,tenant_id,key,name,is_system')
        .eq('tenant_id', tenantId)
        .eq('id', roleId)
        .maybeSingle();

      if (existing.error) throw new Error(`role lookup failed: ${existing.error.message}`);
      if (!existing.data) return reply.code(404).send({ ok: false, error: 'role_not_found' });

      const updatePayload = {
        key: key || existing.data.key,
        name: name || existing.data.name,
      };

      const updated = await supabaseAdmin
        .from('tenant_roles')
        .update(updatePayload)
        .eq('tenant_id', tenantId)
        .eq('id', roleId)
        .select('id,tenant_id,key,name,is_system,created_at')
        .single();

      if (updated.error) throw new Error(`role update failed: ${updated.error.message}`);

      if (permissions) {
        const clearRes = await supabaseAdmin
          .from('tenant_role_permissions')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('role_id', roleId);

        if (clearRes.error) throw new Error(`role permission clear failed: ${clearRes.error.message}`);

        for (const permission of permissions) {
          const permInsert = await supabaseAdmin
            .from('tenant_role_permissions')
            .insert({
              tenant_id: tenantId,
              role_id: roleId,
              permission,
            });
          if (permInsert.error) throw new Error(`role permission insert failed: ${permInsert.error.message}`);
        }
      }

      clearPermissionCache();
      const roles = await listRolesWithPermissions({ tenantId });
      const role = roles.find((row) => asText(row.id) === roleId) || null;
      return reply.send({ ok: true, tenant_id: tenantId, role });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.delete('/admin/roles/:role_id', {
    preHandler: [requireApiKeyPreHandler, rolesWriteGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.body?.tenant_id || req.tenant?.id);
    const roleId = asText(req.params?.role_id);
    if (!isUuid(tenantId) || !isUuid(roleId)) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields' });
    }

    try {
      const role = await supabaseAdmin
        .from('tenant_roles')
        .select('id,is_system,key')
        .eq('tenant_id', tenantId)
        .eq('id', roleId)
        .maybeSingle();

      if (role.error) throw new Error(`role lookup failed: ${role.error.message}`);
      if (!role.data) return reply.code(404).send({ ok: false, error: 'role_not_found' });
      if (role.data.is_system) return reply.code(400).send({ ok: false, error: 'cannot_delete_system_role' });

      const table = await resolveMembershipTable();
      const usage = await supabaseAdmin
        .from(table)
        .select('user_id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('role_id', roleId);

      if (!usage.error && Number(usage.count || 0) > 0) {
        return reply.code(409).send({ ok: false, error: 'role_in_use' });
      }

      const delPerms = await supabaseAdmin
        .from('tenant_role_permissions')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('role_id', roleId);
      if (delPerms.error) throw new Error(`role permission delete failed: ${delPerms.error.message}`);

      const delRole = await supabaseAdmin
        .from('tenant_roles')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('id', roleId);
      if (delRole.error) throw new Error(`role delete failed: ${delRole.error.message}`);

      clearPermissionCache();
      return reply.send({ ok: true, tenant_id: tenantId, role_id: roleId });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/members', {
    preHandler: [requireApiKeyPreHandler, membersReadGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'missing_or_invalid_tenant_id' });

    try {
      const members = await listTenantMembers({ tenantId });
      return reply.send({ ok: true, tenant_id: tenantId, members });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.put('/admin/members/:user_id/role', {
    preHandler: [requireApiKeyPreHandler, membersWriteGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const userId = asText(req.params?.user_id);
    const roleId = asText(req.body?.role_id);

    if (!isUuid(tenantId) || !isUuid(roleId) || !isUuid(userId)) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields' });
    }

    try {
      const updated = await setMemberRole({ tenantId, userId, roleId });
      return reply.send({ ok: true, member: updated });
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      return reply.code(statusCode).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/auth/settings', {
    preHandler: [requireApiKeyPreHandler, membersReadGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'missing_or_invalid_tenant_id' });

    const res = await supabaseAdmin
      .from('tenant_auth_settings')
      .select('tenant_id,sso_enabled,allowed_email_domains,require_email_verified,require_mfa_for_admin,require_mfa_for_merge,created_at,updated_at')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (res.error) {
      if (isMissingSchema(res.error)) {
        return reply.code(400).send({ ok: false, error: 'tenant_auth_settings_schema_missing' });
      }
      return reply.code(500).send({ ok: false, error: res.error.message });
    }

    return reply.send({ ok: true, settings: res.data || {
      tenant_id: tenantId,
      sso_enabled: false,
      allowed_email_domains: [],
      require_email_verified: true,
      require_mfa_for_admin: false,
      require_mfa_for_merge: true,
    } });
  });

  fastify.put('/admin/auth/settings', {
    preHandler: [requireApiKeyPreHandler, membersWriteGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'missing_or_invalid_tenant_id' });

    const payload = {
      tenant_id: tenantId,
      sso_enabled: Boolean(req.body?.sso_enabled),
      allowed_email_domains: asArray(req.body?.allowed_email_domains).map((item) => lower(item)).filter(Boolean),
      require_email_verified: req.body?.require_email_verified !== false,
      require_mfa_for_admin: Boolean(req.body?.require_mfa_for_admin),
      require_mfa_for_merge: req.body?.require_mfa_for_merge !== false,
      updated_at: new Date().toISOString(),
    };

    const res = await supabaseAdmin
      .from('tenant_auth_settings')
      .upsert(payload, { onConflict: 'tenant_id' })
      .select('tenant_id,sso_enabled,allowed_email_domains,require_email_verified,require_mfa_for_admin,require_mfa_for_merge,created_at,updated_at')
      .single();

    if (res.error) {
      if (isMissingSchema(res.error)) {
        return reply.code(400).send({ ok: false, error: 'tenant_auth_settings_schema_missing' });
      }
      return reply.code(500).send({ ok: false, error: res.error.message });
    }

    clearTenantAuthSettingsCache();
    return reply.send({ ok: true, settings: res.data });
  });

  fastify.post('/admin/invites', {
    preHandler: [requireApiKeyPreHandler, membersWriteGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const email = lower(req.body?.email);
    const roleId = asText(req.body?.role_id);

    if (!isUuid(tenantId) || !email || !isUuid(roleId)) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields' });
    }

    try {
      const roleRes = await supabaseAdmin
        .from('tenant_roles')
        .select('id,key,name')
        .eq('tenant_id', tenantId)
        .eq('id', roleId)
        .maybeSingle();

      if (roleRes.error) throw new Error(`role lookup failed: ${roleRes.error.message}`);
      if (!roleRes.data) return reply.code(404).send({ ok: false, error: 'role_not_found' });

      const rawToken = `${randomUUID()}${randomUUID().replace(/-/g, '')}`;
      const tokenHash = inviteTokenHash(rawToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const upsert = await supabaseAdmin
        .from('tenant_invites')
        .upsert({
          tenant_id: tenantId,
          email,
          role_id: roleId,
          token_hash: tokenHash,
          expires_at: expiresAt,
          accepted_at: null,
          accepted_by: null,
        }, { onConflict: 'tenant_id,email' })
        .select('id,tenant_id,email,role_id,expires_at,accepted_at,accepted_by')
        .single();

      if (upsert.error) {
        if (isMissingSchema(upsert.error)) return reply.code(400).send({ ok: false, error: 'tenant_invites_schema_missing' });
        throw new Error(`invite upsert failed: ${upsert.error.message}`);
      }

      const emailResult = await sendInviteEmail({
        to: email,
        tenantId,
        token: rawToken,
        roleName: roleRes.data.name,
      }).catch((error) => ({ sent: false, reason: String(error?.message || error) }));

      return reply.send({
        ok: true,
        invite: upsert.data,
        delivery: emailResult,
        invite_token: emailResult?.sent ? null : rawToken,
      });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/invites/accept', {
    preHandler: [requireApiKeyPreHandler],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const token = asText(req.body?.token);
    if (!token) return reply.code(400).send({ ok: false, error: 'missing_token' });

    let jwt;
    try {
      jwt = await verifySupabaseJwt(req, { supabaseAdmin });
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 401;
      return reply.code(statusCode).send({ ok: false, error: String(error?.message || 'unauthorized') });
    }

    const userId = asText(jwt?.sub);
    const email = lower(jwt?.email);
    if (!isUuid(userId) || !email) {
      return reply.code(401).send({ ok: false, error: 'invalid_user_context' });
    }

    const tokenHash = inviteTokenHash(token);

    try {
      const inviteRes = await supabaseAdmin
        .from('tenant_invites')
        .select('id,tenant_id,email,role_id,expires_at,accepted_at,accepted_by')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (inviteRes.error) {
        if (isMissingSchema(inviteRes.error)) return reply.code(400).send({ ok: false, error: 'tenant_invites_schema_missing' });
        throw new Error(`invite lookup failed: ${inviteRes.error.message}`);
      }

      const invite = inviteRes.data;
      if (!invite) return reply.code(404).send({ ok: false, error: 'invite_not_found' });
      if (lower(invite.email) !== email) return reply.code(403).send({ ok: false, error: 'invite_email_mismatch' });
      if (invite.accepted_at) return reply.code(409).send({ ok: false, error: 'invite_already_accepted' });
      if (new Date(invite.expires_at).getTime() < Date.now()) return reply.code(410).send({ ok: false, error: 'invite_expired' });

      const member = await setMemberRole({
        tenantId: asText(invite.tenant_id),
        userId,
        roleId: asText(invite.role_id),
      });

      const markAccepted = await supabaseAdmin
        .from('tenant_invites')
        .update({
          accepted_at: new Date().toISOString(),
          accepted_by: userId,
        })
        .eq('id', invite.id)
        .eq('token_hash', tokenHash);

      if (markAccepted.error) throw new Error(`invite accept update failed: ${markAccepted.error.message}`);

      return reply.send({ ok: true, tenant_id: invite.tenant_id, member });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/policies', {
    preHandler: [requireApiKeyPreHandler, policyManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    const action = lower(req.query?.action);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'missing_or_invalid_tenant_id' });

    let query = supabaseAdmin
      .from('tenant_policies')
      .select('id,tenant_id,is_active,priority,effect,action,conditions,created_at')
      .eq('tenant_id', tenantId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(500);

    if (action) query = query.eq('action', action);

    const res = await query;
    if (res.error) {
      if (isMissingSchema(res.error)) return reply.code(400).send({ ok: false, error: 'tenant_policies_schema_missing' });
      return reply.code(500).send({ ok: false, error: res.error.message });
    }

    return reply.send({ ok: true, tenant_id: tenantId, policies: res.data || [] });
  });

  fastify.post('/admin/policies', {
    preHandler: [requireApiKeyPreHandler, policyManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const action = lower(req.body?.action);
    const effect = lower(req.body?.effect || 'deny');
    const priority = Number(req.body?.priority || 100);
    const conditions = asObject(req.body?.conditions);

    if (!isUuid(tenantId) || !action || !['allow', 'deny'].includes(effect)) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields' });
    }

    const policyRes = await evaluatePolicy({
      supabaseAdmin,
      action: 'policy.manage',
      context: {
        tenant_id: tenantId,
        user_id: req.user?.id || null,
        ip: req.ip,
        mfa_present: Boolean(req.user?.jwt?.aal === 'aal2' || req.user?.jwt?.aal === 'aal3'),
      },
    });

    if (!policyRes.allowed) {
      return reply.code(403).send({ ok: false, error: 'policy_denied', reason: policyRes.reason, policy_id: policyRes.policy?.id || null });
    }

    const insert = await supabaseAdmin
      .from('tenant_policies')
      .insert({
        tenant_id: tenantId,
        is_active: req.body?.is_active !== false,
        priority: Number.isFinite(priority) ? Math.trunc(priority) : 100,
        effect,
        action,
        conditions,
      })
      .select('id,tenant_id,is_active,priority,effect,action,conditions,created_at')
      .single();

    if (insert.error) {
      if (isMissingSchema(insert.error)) return reply.code(400).send({ ok: false, error: 'tenant_policies_schema_missing' });
      return reply.code(500).send({ ok: false, error: insert.error.message });
    }

    return reply.send({ ok: true, policy: insert.data });
  });

  fastify.put('/admin/policies/:id', {
    preHandler: [requireApiKeyPreHandler, policyManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const id = asText(req.params?.id);
    if (!isUuid(tenantId) || !isUuid(id)) return reply.code(400).send({ ok: false, error: 'missing_required_fields' });

    const updatePayload = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'is_active')) updatePayload.is_active = Boolean(req.body?.is_active);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'priority')) updatePayload.priority = Math.trunc(Number(req.body?.priority || 100));
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'effect')) updatePayload.effect = lower(req.body?.effect);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'action')) updatePayload.action = lower(req.body?.action);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'conditions')) updatePayload.conditions = asObject(req.body?.conditions);

    const update = await supabaseAdmin
      .from('tenant_policies')
      .update(updatePayload)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('id,tenant_id,is_active,priority,effect,action,conditions,created_at')
      .single();

    if (update.error) {
      if (isMissingSchema(update.error)) return reply.code(400).send({ ok: false, error: 'tenant_policies_schema_missing' });
      return reply.code(500).send({ ok: false, error: update.error.message });
    }

    return reply.send({ ok: true, policy: update.data });
  });

  fastify.delete('/admin/policies/:id', {
    preHandler: [requireApiKeyPreHandler, policyManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.body?.tenant_id || req.tenant?.id);
    const id = asText(req.params?.id);
    if (!isUuid(tenantId) || !isUuid(id)) return reply.code(400).send({ ok: false, error: 'missing_required_fields' });

    const delRes = await supabaseAdmin
      .from('tenant_policies')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);

    if (delRes.error) {
      if (isMissingSchema(delRes.error)) return reply.code(400).send({ ok: false, error: 'tenant_policies_schema_missing' });
      return reply.code(500).send({ ok: false, error: delRes.error.message });
    }

    return reply.send({ ok: true, tenant_id: tenantId, id });
  });
}
