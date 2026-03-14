import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { requireTenantRole } from '../lib/auth/requireTenantRole.js';
import { requireTenantPermission } from '../lib/auth/requireTenantPermission.js';
import { logAudit } from '../lib/audit/auditLog.js';
import { resolveMembershipAccess } from '../lib/billing/membershipOverrideResolver.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
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
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function parseIsoOrNull(value) {
  const text = asText(value);
  if (!text) return null;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function addDaysIso(startIso, days) {
  const start = new Date(startIso);
  const out = new Date(start.getTime() + (days * 24 * 60 * 60 * 1000));
  return out.toISOString();
}

async function requireApiKey(req, reply) {
  const key = asText(req.headers['x-api-key']);
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    return reply.code(401).send({ ok: false, error: 'unauthorized' });
  }
  return undefined;
}

function normalizeTenantId(req) {
  return asText(req.body?.tenant_id || req.query?.tenant_id || req.params?.tenant_id || req.tenant?.id);
}

function normalizeUserId(req) {
  const value = asText(req.body?.user_id || req.query?.user_id || req.params?.user_id);
  return value || null;
}

function ensureTenantScope(req, reply, tenantId) {
  const scopedTenantId = asText(req?.tenant?.id);
  if (scopedTenantId && scopedTenantId !== tenantId) {
    reply.code(403).send({ ok: false, error: 'tenant_scope_mismatch' });
    return false;
  }
  return true;
}

function summarizeSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    user_id: row.user_id,
    tier: row.tier || null,
    plan_code: row.plan_code || null,
    status: row.status || null,
    provider: row.provider || null,
    current_period_end: row.current_period_end || null,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    updated_at: row.updated_at || null,
    created_at: row.created_at || null,
  };
}

function summarizeOverride(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    user_id: row.user_id,
    override_type: row.override_type,
    override_reason: row.override_reason || null,
    override_start: row.override_start || null,
    override_end: row.override_end || null,
    promo_code: row.promo_code || null,
    promo_duration_days: row.promo_duration_days || null,
    promo_applied_at: row.promo_applied_at || null,
    promo_expires_at: row.promo_expires_at || null,
    active: Boolean(row.active),
    created_by: row.created_by || null,
    restored_at: row.restored_at || null,
    restored_by: row.restored_by || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function loadLatestSubscription({ tenantId, userId = null }) {
  let query = supabaseAdmin
    .from('subscriptions')
    .select('id,tenant_id,user_id,tier,plan_code,status,provider,current_period_end,cancel_at_period_end,created_at,updated_at')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20);

  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { row: null, schema_missing: true };
    throw new Error(`subscriptions lookup failed: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const row = rows.find((item) => !userId || asText(item.user_id) === userId) || rows[0] || null;
  return { row, schema_missing: false };
}

async function loadActiveOverrides({ tenantId }) {
  const { data, error } = await supabaseAdmin
    .from('membership_overrides')
    .select('id,tenant_id,user_id,subscription_id,override_type,override_reason,override_start,override_end,promo_code,promo_duration_days,promo_applied_at,promo_expires_at,active,created_by,restored_at,restored_by,metadata,created_at,updated_at')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    if (isMissingSchema(error)) return { rows: [], schema_missing: true };
    throw new Error(`membership_overrides lookup failed: ${error.message}`);
  }

  return { rows: Array.isArray(data) ? data : [], schema_missing: false };
}

function nowActiveRows(rows, nowIso) {
  const now = new Date(nowIso).getTime();
  return rows.filter((row) => {
    const start = row.override_start ? new Date(row.override_start).getTime() : null;
    const end = row.override_end ? new Date(row.override_end).getTime() : null;

    if (Number.isFinite(start) && start > now) return false;
    if (Number.isFinite(end) && end <= now) return false;
    return true;
  });
}

async function writeMembershipOverrideAudit(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return { inserted: 0 };

  const { error } = await supabaseAdmin
    .from('membership_override_audit')
    .insert(entries);

  if (error) {
    if (isMissingSchema(error)) return { inserted: 0, skipped: true };
    throw new Error(`membership_override_audit insert failed: ${error.message}`);
  }

  return { inserted: entries.length };
}

function makeResolutionPayload({ tenantId, userId, subscription, overrides, nowIso, schemaWarnings = [] }) {
  const activeRows = nowActiveRows(overrides || [], nowIso);

  const resolution = resolveMembershipAccess({
    subscription,
    overrides: activeRows,
    user_id: userId,
    now: new Date(nowIso),
  });

  return {
    tenant_id: tenantId,
    user_id: userId,
    resolved_access: {
      allowed: Boolean(resolution.access_allowed),
      source: resolution.source,
      reason: resolution.reason,
      evaluated_at: nowIso,
      evaluation_order: [
        'active_override',
        'active_promotion',
        'active_paid_subscription',
        'expired_subscription',
      ],
    },
    active_override: summarizeOverride(resolution.active_override),
    subscription: summarizeSubscription(subscription),
    warnings: schemaWarnings,
  };
}

export async function adminMembershipRoutes(fastify) {
  const ownerAdminRoleGuard = requireTenantRole({
    supabaseAdmin,
    allowedRoles: ['owner', 'admin', 'super_admin'],
  });
  const billingManageGuard = requireTenantPermission({
    supabaseAdmin,
    permission: 'billing.manage',
  });

  fastify.get('/api/admin/membership/status', {
    preHandler: [requireApiKey, ownerAdminRoleGuard, billingManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const userId = normalizeUserId(req);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (userId && !isUuid(userId)) return reply.code(400).send({ ok: false, error: 'invalid_user_id' });
    if (!ensureTenantScope(req, reply, tenantId)) return undefined;

    try {
      const nowIso = new Date().toISOString();
      const schemaWarnings = [];

      const subRes = await loadLatestSubscription({ tenantId, userId });
      if (subRes.schema_missing) schemaWarnings.push('subscriptions_schema_missing');

      const ovRes = await loadActiveOverrides({ tenantId });
      if (ovRes.schema_missing) schemaWarnings.push('membership_overrides_schema_missing');

      const payload = makeResolutionPayload({
        tenantId,
        userId,
        subscription: subRes.row,
        overrides: ovRes.rows,
        nowIso,
        schemaWarnings,
      });

      await writeMembershipOverrideAudit([
        {
          tenant_id: tenantId,
          user_id: userId,
          action: 'status_read',
          previous_status: null,
          new_status: payload.resolved_access.source,
          reason: payload.resolved_access.reason,
          admin_user_id: asText(req.user?.id) || null,
          payload: {
            source: payload.resolved_access.source,
            allowed: payload.resolved_access.allowed,
            warnings: payload.warnings,
          },
        },
      ]).catch(() => {});

      return reply.send({ ok: true, ...payload });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, user_id: userId }, 'membership status lookup failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/api/admin/membership/waive', {
    preHandler: [requireApiKey, ownerAdminRoleGuard, billingManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const userId = normalizeUserId(req);
    const reason = asText(req.body?.override_reason || req.body?.reason);
    const endAt = parseIsoOrNull(req.body?.override_end);

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (userId && !isUuid(userId)) return reply.code(400).send({ ok: false, error: 'invalid_user_id' });
    if (!reason) return reply.code(400).send({ ok: false, error: 'missing_override_reason' });
    if (req.body?.override_end && !endAt) return reply.code(400).send({ ok: false, error: 'invalid_override_end' });
    if (!ensureTenantScope(req, reply, tenantId)) return undefined;

    try {
      const nowIso = new Date().toISOString();
      const actorId = asText(req.user?.id) || null;
      const subRes = await loadLatestSubscription({ tenantId, userId });

      const insertRes = await supabaseAdmin
        .from('membership_overrides')
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          subscription_id: subRes.row?.id || null,
          override_type: 'waived',
          override_reason: reason,
          override_start: nowIso,
          override_end: endAt,
          active: true,
          created_by: actorId,
          metadata: asObject(req.body?.metadata),
        })
        .select('id,tenant_id,user_id,subscription_id,override_type,override_reason,override_start,override_end,promo_code,promo_duration_days,promo_applied_at,promo_expires_at,active,created_by,restored_at,restored_by,metadata,created_at,updated_at')
        .single();

      if (insertRes.error) {
        if (isMissingSchema(insertRes.error)) {
          return reply.code(400).send({ ok: false, error: 'membership_overrides_schema_missing' });
        }
        throw new Error(`waive insert failed: ${insertRes.error.message}`);
      }

      await writeMembershipOverrideAudit([
        {
          membership_override_id: insertRes.data.id,
          tenant_id: tenantId,
          user_id: userId,
          action: 'waived',
          previous_status: subRes.row?.status || null,
          new_status: 'override_active',
          reason,
          admin_user_id: actorId,
          payload: {
            override_type: 'waived',
            override_end: endAt,
            subscription_id: subRes.row?.id || null,
          },
        },
      ]);

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: actorId,
        actor_type: 'user',
        action: 'membership_waived',
        entity_type: 'membership_override',
        entity_id: insertRes.data.id,
        metadata: {
          user_id: userId,
          reason,
          override_type: 'waived',
        },
      }).catch(() => {});

      const ovRes = await loadActiveOverrides({ tenantId });
      const payload = makeResolutionPayload({
        tenantId,
        userId,
        subscription: subRes.row,
        overrides: ovRes.rows,
        nowIso,
      });

      return reply.send({ ok: true, override: summarizeOverride(insertRes.data), status: payload });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, user_id: userId }, 'membership waive failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/api/admin/membership/promo', {
    preHandler: [requireApiKey, ownerAdminRoleGuard, billingManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const userId = normalizeUserId(req);
    const reason = asText(req.body?.override_reason || req.body?.reason || 'promotional_access');
    const promoCode = asText(req.body?.promo_code || req.body?.code) || null;
    const durationDays = Math.max(1, Math.min(365, asInt(req.body?.promo_duration_days, 30)));

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (userId && !isUuid(userId)) return reply.code(400).send({ ok: false, error: 'invalid_user_id' });
    if (!ensureTenantScope(req, reply, tenantId)) return undefined;

    try {
      const nowIso = new Date().toISOString();
      const actorId = asText(req.user?.id) || null;
      const endIso = addDaysIso(nowIso, durationDays);
      const subRes = await loadLatestSubscription({ tenantId, userId });

      const insertRes = await supabaseAdmin
        .from('membership_overrides')
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          subscription_id: subRes.row?.id || null,
          override_type: 'promo',
          override_reason: reason,
          promo_code: promoCode,
          promo_duration_days: durationDays,
          promo_applied_at: nowIso,
          promo_expires_at: endIso,
          override_start: nowIso,
          override_end: endIso,
          active: true,
          created_by: actorId,
          metadata: asObject(req.body?.metadata),
        })
        .select('id,tenant_id,user_id,subscription_id,override_type,override_reason,override_start,override_end,promo_code,promo_duration_days,promo_applied_at,promo_expires_at,active,created_by,restored_at,restored_by,metadata,created_at,updated_at')
        .single();

      if (insertRes.error) {
        if (isMissingSchema(insertRes.error)) {
          return reply.code(400).send({ ok: false, error: 'membership_overrides_schema_missing' });
        }
        throw new Error(`promo insert failed: ${insertRes.error.message}`);
      }

      await writeMembershipOverrideAudit([
        {
          membership_override_id: insertRes.data.id,
          tenant_id: tenantId,
          user_id: userId,
          action: 'promo_created',
          previous_status: subRes.row?.status || null,
          new_status: 'promotion_active',
          reason,
          admin_user_id: actorId,
          payload: {
            promo_code: promoCode,
            promo_duration_days: durationDays,
            promo_applied_at: nowIso,
            promo_expires_at: endIso,
          },
        },
      ]);

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: actorId,
        actor_type: 'user',
        action: 'membership_promo_created',
        entity_type: 'membership_override',
        entity_id: insertRes.data.id,
        metadata: {
          user_id: userId,
          reason,
          promo_code: promoCode,
          promo_duration_days: durationDays,
        },
      }).catch(() => {});

      const ovRes = await loadActiveOverrides({ tenantId });
      const payload = makeResolutionPayload({
        tenantId,
        userId,
        subscription: subRes.row,
        overrides: ovRes.rows,
        nowIso,
      });

      return reply.send({ ok: true, override: summarizeOverride(insertRes.data), status: payload });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, user_id: userId }, 'membership promo failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/api/admin/membership/restore', {
    preHandler: [requireApiKey, ownerAdminRoleGuard, billingManageGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const userId = normalizeUserId(req);
    const reason = asText(req.body?.override_reason || req.body?.reason || 'manual_restore');

    if (!isUuid(tenantId)) return reply.code(400).send({ ok: false, error: 'invalid_tenant_id' });
    if (userId && !isUuid(userId)) return reply.code(400).send({ ok: false, error: 'invalid_user_id' });
    if (!ensureTenantScope(req, reply, tenantId)) return undefined;

    try {
      const nowIso = new Date().toISOString();
      const actorId = asText(req.user?.id) || null;
      const subRes = await loadLatestSubscription({ tenantId, userId });
      const ovRes = await loadActiveOverrides({ tenantId });

      const candidates = nowActiveRows(ovRes.rows, nowIso).filter((row) => {
        const rowUser = asText(row.user_id) || null;
        if (!userId) return true;
        return rowUser === null || rowUser === userId;
      });

      if (!candidates.length) {
        const payload = makeResolutionPayload({
          tenantId,
          userId,
          subscription: subRes.row,
          overrides: ovRes.rows,
          nowIso,
        });

        return reply.send({ ok: true, restored_count: 0, status: payload });
      }

      const ids = candidates.map((row) => row.id);

      const updateRes = await supabaseAdmin
        .from('membership_overrides')
        .update({
          active: false,
          restored_at: nowIso,
          restored_by: actorId,
          updated_at: nowIso,
        })
        .in('id', ids)
        .eq('tenant_id', tenantId)
        .select('id,tenant_id,user_id,subscription_id,override_type,override_reason,override_start,override_end,promo_code,promo_duration_days,promo_applied_at,promo_expires_at,active,created_by,restored_at,restored_by,metadata,created_at,updated_at');

      if (updateRes.error) {
        if (isMissingSchema(updateRes.error)) {
          return reply.code(400).send({ ok: false, error: 'membership_overrides_schema_missing' });
        }
        throw new Error(`restore update failed: ${updateRes.error.message}`);
      }

      const auditRows = candidates.map((row) => ({
        membership_override_id: row.id,
        tenant_id: tenantId,
        user_id: asText(row.user_id) || null,
        action: 'restored',
        previous_status: row.override_type === 'promo' ? 'promotion_active' : 'override_active',
        new_status: 'restored',
        reason,
        admin_user_id: actorId,
        payload: {
          override_type: row.override_type,
          restored_at: nowIso,
        },
      }));

      await writeMembershipOverrideAudit(auditRows);

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: actorId,
        actor_type: 'user',
        action: 'membership_restored',
        entity_type: 'membership_override',
        entity_id: ids[0],
        metadata: {
          user_id: userId,
          restored_count: ids.length,
          reason,
        },
      }).catch(() => {});

      const postOverrides = await loadActiveOverrides({ tenantId });
      const payload = makeResolutionPayload({
        tenantId,
        userId,
        subscription: subRes.row,
        overrides: postOverrides.rows,
        nowIso,
      });

      return reply.send({
        ok: true,
        restored_count: ids.length,
        restored_ids: ids,
        status: payload,
      });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, user_id: userId }, 'membership restore failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });
}
