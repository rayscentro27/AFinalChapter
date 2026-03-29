import { ALL_PERMISSIONS, LEGACY_ROLE_PERMISSION_MAP } from './permissionConstants.js';

const CACHE_TTL_MS = 60_000;
const permissionCache = new Map();
let membershipTableCache = null;

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function lower(value) {
  return asText(value).toLowerCase();
}

function isMissingRelationError(error, relationName) {
  const msg = String(error?.message || '').toLowerCase();
  const relation = String(relationName || '').toLowerCase();
  return msg.includes('relation') && msg.includes(relation) && msg.includes('does not exist');
}

function cacheKey(tenantId, userId) {
  return `${asText(tenantId)}::${asText(userId)}`;
}

function fromCache(tenantId, userId) {
  const key = cacheKey(tenantId, userId);
  const hit = permissionCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    permissionCache.delete(key);
    return null;
  }
  return hit.value;
}

function toCache(tenantId, userId, value) {
  permissionCache.set(cacheKey(tenantId, userId), {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return value;
}

function normalizePermission(permission) {
  const p = lower(permission);
  return p || null;
}

function normalizePermissions(permissions) {
  return new Set((permissions || []).map(normalizePermission).filter(Boolean));
}

function legacyPermissionsForRole(role) {
  return LEGACY_ROLE_PERMISSION_MAP[lower(role)] || [];
}

async function resolveMembershipTable(supabaseAdmin) {
  if (membershipTableCache) return membershipTableCache;

  const preferred = await supabaseAdmin
    .from('tenant_memberships')
    .select('tenant_id')
    .limit(1);

  if (!preferred.error) {
    membershipTableCache = 'tenant_memberships';
    return membershipTableCache;
  }

  if (!isMissingRelationError(preferred.error, 'tenant_memberships')) {
    throw new Error(`tenant_memberships lookup failed: ${preferred.error.message}`);
  }

  membershipTableCache = 'tenant_members';
  return membershipTableCache;
}

async function loadMembership({ supabaseAdmin, tenantId, userId }) {
  const table = await resolveMembershipTable(supabaseAdmin);

  const res = await supabaseAdmin
    .from(table)
    .select('tenant_id,user_id,role,role_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!res.error) {
    return {
      table,
      row: res.data || null,
    };
  }

  if (table !== 'tenant_memberships' || !isMissingRelationError(res.error, table)) {
    throw new Error(`${table} membership lookup failed: ${res.error.message}`);
  }

  const fallback = await supabaseAdmin
    .from('tenant_members')
    .select('tenant_id,user_id,role,role_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fallback.error) {
    throw new Error(`tenant_members membership lookup failed: ${fallback.error.message}`);
  }

  membershipTableCache = 'tenant_members';
  return {
    table: 'tenant_members',
    row: fallback.data || null,
  };
}

async function loadRoleData({ supabaseAdmin, tenantId, roleId }) {
  if (!roleId) return { role: null, permissions: [] };

  const roleRes = await supabaseAdmin
    .from('tenant_roles')
    .select('id,tenant_id,key,name,is_system')
    .eq('tenant_id', tenantId)
    .eq('id', roleId)
    .maybeSingle();

  if (roleRes.error && !isMissingRelationError(roleRes.error, 'tenant_roles')) {
    throw new Error(`tenant_roles lookup failed: ${roleRes.error.message}`);
  }

  const permRes = await supabaseAdmin
    .from('tenant_role_permissions')
    .select('permission')
    .eq('tenant_id', tenantId)
    .eq('role_id', roleId)
    .limit(5000);

  if (permRes.error && !isMissingRelationError(permRes.error, 'tenant_role_permissions')) {
    throw new Error(`tenant_role_permissions lookup failed: ${permRes.error.message}`);
  }

  return {
    role: roleRes.data || null,
    permissions: (permRes.data || []).map((row) => lower(row?.permission)).filter(Boolean),
  };
}

export function clearPermissionCache() {
  permissionCache.clear();
}

export async function getUserPermissions({ supabaseAdmin, tenant_id, user_id }) {
  const tenantId = asText(tenant_id);
  const userId = asText(user_id);
  if (!tenantId || !userId) {
    return {
      tenant_id: tenantId,
      user_id: userId,
      role: null,
      role_id: null,
      role_key: null,
      membership_table: null,
      permissions: new Set(),
      permissions_array: [],
    };
  }

  const hit = fromCache(tenantId, userId);
  if (hit) return hit;

  const membership = await loadMembership({ supabaseAdmin, tenantId, userId });
  const row = membership.row;

  if (!row) {
    const result = {
      tenant_id: tenantId,
      user_id: userId,
      role: null,
      role_id: null,
      role_key: null,
      membership_table: membership.table,
      permissions: new Set(),
      permissions_array: [],
    };
    return toCache(tenantId, userId, result);
  }

  const legacyRole = lower(row.role);
  const roleId = asText(row.role_id) || null;

  const roleData = await loadRoleData({ supabaseAdmin, tenantId, roleId });
  const roleKey = lower(roleData.role?.key) || legacyRole || null;

  const customPermissions = normalizePermissions(roleData.permissions || []);
  if (customPermissions.size === 0 && legacyRole) {
    for (const permission of legacyPermissionsForRole(legacyRole)) {
      const p = normalizePermission(permission);
      if (p) customPermissions.add(p);
    }
  }

  const permissionsArray = Array.from(customPermissions.values());

  const result = {
    tenant_id: tenantId,
    user_id: userId,
    role: legacyRole || roleKey || null,
    role_id: roleId,
    role_key: roleKey || legacyRole || null,
    membership_table: membership.table,
    permissions: customPermissions,
    permissions_array: permissionsArray,
  };

  return toCache(tenantId, userId, result);
}

export async function hasPermission({ supabaseAdmin, tenant_id, user_id, permission }) {
  const normalized = normalizePermission(permission);
  if (!normalized) return false;

  const userPermissions = await getUserPermissions({
    supabaseAdmin,
    tenant_id,
    user_id,
  });

  if (userPermissions.permissions.has(ALL_PERMISSIONS)) return true;
  return userPermissions.permissions.has(normalized);
}
