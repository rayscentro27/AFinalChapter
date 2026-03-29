import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { requireTenantRole } from '../lib/auth/requireTenantRole.js';
import { requireTenantPermission } from '../lib/auth/requireTenantPermission.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';

const VALID_SYSTEM_MODES = new Set([
  'development',
  'research',
  'production',
  'maintenance',
  'degraded',
  'emergency_stop',
]);

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asBool(value, fallback = null) {
  if (typeof value === 'boolean') return value;
  const text = asText(value).toLowerCase();
  if (!text) return fallback;
  if (text === 'true' || text === '1' || text === 'yes' || text === 'on') return true;
  if (text === 'false' || text === '0' || text === 'no' || text === 'off') return false;
  return fallback;
}

function asInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, asInt(value, min)));
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

function actorFromRequest(req) {
  return {
    user_id: asText(req.user?.id) || asText(req.headers['x-actor-id']) || null,
    role: asText(req.tenant?.role) || asText(req.headers['x-actor-role']) || 'internal_api_key',
  };
}

function parseScope(query = {}) {
  const scope = asText(query.scope || 'global').toLowerCase() || 'global';
  const scopeId = asText(query.scope_id) || null;
  return { scope, scope_id: scopeId };
}

async function safeRows(query) {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { rows: [], missing: true, error: null };
    return { rows: [], missing: false, error };
  }
  return { rows: Array.isArray(data) ? data : [], missing: false, error: null };
}

async function safeCount(query) {
  const { count, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { count: 0, missing: true, error: null };
    return { count: 0, missing: false, error };
  }
  return { count: Number(count || 0), missing: false, error: null };
}

async function writeAudit({ actor, action, targetType, targetId, beforeState = {}, afterState = {}, reason = null, metadata = {} }) {
  const payload = {
    actor_user_id: actor?.user_id || null,
    actor_role: actor?.role || 'unknown',
    action,
    target_type: targetType,
    target_id: targetId || null,
    before_state: beforeState,
    after_state: afterState,
    reason: reason || null,
    metadata: metadata || {},
  };

  const { error } = await supabaseAdmin.from('control_plane_audit_log').insert(payload);
  if (error && !isMissingSchema(error)) {
    throw new Error(`control_plane_audit_log insert failed: ${error.message}`);
  }
}

function writeModeDisabled(reply) {
  return reply.code(503).send({
    ok: false,
    error: 'control_plane_write_disabled',
    message: 'Set CONTROL_PLANE_WRITE_ENABLED=true to enable write endpoints.',
  });
}

async function upsertGlobalSystemConfig(nextState) {
  const read = await safeRows(
    supabaseAdmin
      .from('system_config')
      .select('id,scope,scope_id,system_mode,queue_enabled,ai_jobs_enabled,research_jobs_enabled,notifications_enabled,metadata,updated_at')
      .eq('scope', 'global')
      .is('scope_id', null)
      .limit(1)
  );

  if (read.error) throw new Error(`system_config read failed: ${read.error.message}`);
  if (read.missing) throw new Error('system_config table missing; run migrations first');

  const existing = read.rows[0] || null;
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('system_config')
      .update({
        ...nextState,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) throw new Error(`system_config update failed: ${error.message}`);
    return { before: existing, after: data };
  }

  const { data, error } = await supabaseAdmin
    .from('system_config')
    .insert({
      scope: 'global',
      scope_id: null,
      ...nextState,
    })
    .select('*')
    .single();

  if (error) throw new Error(`system_config insert failed: ${error.message}`);
  return { before: null, after: data };
}

export async function controlPlaneRoutes(fastify) {
  const ownerAdminRoleGuard = requireTenantRole({
    supabaseAdmin,
    allowedRoles: ['owner', 'admin', 'super_admin'],
  });
  const controlPlaneWriteGuard = requireTenantPermission({
    supabaseAdmin,
    permission: 'policy.manage',
  });
  fastify.get('/api/control-plane/state', {
    preHandler: [requireApiKey, ownerAdminRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (_req, reply) => {
    const systemConfig = await safeRows(
      supabaseAdmin
        .from('system_config')
        .select('id,scope,scope_id,system_mode,queue_enabled,ai_jobs_enabled,research_jobs_enabled,notifications_enabled,metadata,updated_at')
        .eq('scope', 'global')
        .is('scope_id', null)
        .limit(1)
    );

    const incidentsOpen = await safeCount(
      supabaseAdmin
        .from('incident_events')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'investigating', 'mitigated'])
    );

    const checks = { systemConfig, incidentsOpen };
    const missing_tables = Object.entries(checks)
      .filter(([, value]) => Boolean(value?.missing))
      .map(([key]) => key);

    const current = systemConfig.rows[0] || {};

    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
      write_enabled: ENV.CONTROL_PLANE_WRITE_ENABLED,
      state: {
        system_mode: asText(current.system_mode) || ENV.SYSTEM_MODE,
        queue_enabled: typeof current.queue_enabled === 'boolean' ? current.queue_enabled : ENV.QUEUE_ENABLED,
        ai_jobs_enabled: typeof current.ai_jobs_enabled === 'boolean' ? current.ai_jobs_enabled : ENV.AI_JOBS_ENABLED,
        research_jobs_enabled: typeof current.research_jobs_enabled === 'boolean' ? current.research_jobs_enabled : ENV.RESEARCH_JOBS_ENABLED,
        notifications_enabled: typeof current.notifications_enabled === 'boolean' ? current.notifications_enabled : ENV.NOTIFICATIONS_ENABLED,
        metadata: (current.metadata && typeof current.metadata === 'object') ? current.metadata : {},
      },
      active_incidents: incidentsOpen.count,
      missing_tables,
      warnings: [
        ...(systemConfig.error ? [`system_config: ${asText(systemConfig.error.message || 'query_error')}`] : []),
        ...(incidentsOpen.error ? [`incident_events: ${asText(incidentsOpen.error.message || 'query_error')}`] : []),
      ],
    });
  });

  fastify.get('/api/control-plane/flags', {
    preHandler: [requireApiKey, ownerAdminRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const { scope, scope_id } = parseScope(req.query || {});
    const limit = clampInt(req.query?.limit, 1, 500);
    const enabledOnly = asBool(req.query?.enabled_only, false);

    let query = supabaseAdmin
      .from('feature_flags')
      .select('id,flag_key,enabled,scope,scope_id,rollout_pct,expires_at,metadata,updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (scope) query = query.eq('scope', scope);
    if (scope_id) query = query.eq('scope_id', scope_id);
    if (enabledOnly) query = query.eq('enabled', true);

    const flags = await safeRows(query);

    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
      scope,
      scope_id,
      count: flags.rows.length,
      flags: flags.rows,
      missing_tables: flags.missing ? ['feature_flags'] : [],
      warnings: flags.error ? [`feature_flags: ${asText(flags.error.message || 'query_error')}`] : [],
    });
  });

  fastify.get('/api/control-plane/incidents', {
    preHandler: [requireApiKey, ownerAdminRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const status = asText(req.query?.status || 'active').toLowerCase();
    const limit = clampInt(req.query?.limit, 1, 200);

    let query = supabaseAdmin
      .from('incident_events')
      .select('id,severity,status,title,details,owner_user_id,started_at,resolved_at,updated_at')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (status === 'active') query = query.in('status', ['open', 'investigating', 'mitigated']);
    if (status && status !== 'all' && status !== 'active') query = query.eq('status', status);

    const incidents = await safeRows(query);

    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
      status,
      count: incidents.rows.length,
      incidents: incidents.rows,
      missing_tables: incidents.missing ? ['incident_events'] : [],
      warnings: incidents.error ? [`incident_events: ${asText(incidents.error.message || 'query_error')}`] : [],
    });
  });

  fastify.get('/api/control-plane/audit', {
    preHandler: [requireApiKey, ownerAdminRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const limit = clampInt(req.query?.limit, 1, 500);
    const action = asText(req.query?.action);

    let query = supabaseAdmin
      .from('control_plane_audit_log')
      .select('id,actor_user_id,actor_role,action,target_type,target_id,before_state,after_state,reason,metadata,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (action) query = query.eq('action', action);

    const audit = await safeRows(query);

    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
      count: audit.rows.length,
      entries: audit.rows,
      missing_tables: audit.missing ? ['control_plane_audit_log'] : [],
      warnings: audit.error ? [`control_plane_audit_log: ${asText(audit.error.message || 'query_error')}`] : [],
    });
  });

  fastify.post('/api/control-plane/mode', {
    preHandler: [requireApiKey, ownerAdminRoleGuard, controlPlaneWriteGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    if (!ENV.CONTROL_PLANE_WRITE_ENABLED) return writeModeDisabled(reply);

    const actor = actorFromRequest(req);
    const mode = asText(req.body?.system_mode).toLowerCase();
    const reason = asText(req.body?.reason);

    if (!VALID_SYSTEM_MODES.has(mode)) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_system_mode',
        valid_modes: Array.from(VALID_SYSTEM_MODES),
      });
    }
    if (!reason) return reply.code(400).send({ ok: false, error: 'missing_reason' });

    try {
      const result = await upsertGlobalSystemConfig({
        system_mode: mode,
        updated_by: actor.user_id,
      });

      await writeAudit({
        actor,
        action: 'set_system_mode',
        targetType: 'system_config',
        targetId: result.after?.id || null,
        beforeState: result.before || {},
        afterState: result.after || {},
        reason,
        metadata: {
          tenant_id: asText(req.tenant?.id) || null,
        },
      });

      return reply.send({
        ok: true,
        timestamp: new Date().toISOString(),
        system_mode: mode,
      });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: asText(error?.message || error) });
    }
  });

  fastify.post('/api/control-plane/feature-flags/:flagKey', {
    preHandler: [requireApiKey, ownerAdminRoleGuard, controlPlaneWriteGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    if (!ENV.CONTROL_PLANE_WRITE_ENABLED) return writeModeDisabled(reply);

    const actor = actorFromRequest(req);
    const flagKey = asText(req.params?.flagKey).toLowerCase();
    const enabled = asBool(req.body?.enabled, null);
    const reason = asText(req.body?.reason);
    const scope = asText(req.body?.scope || 'global').toLowerCase() || 'global';
    const scopeId = asText(req.body?.scope_id) || null;
    const rolloutPct = req.body?.rollout_pct == null ? null : clampInt(req.body?.rollout_pct, 0, 100);

    if (!flagKey) return reply.code(400).send({ ok: false, error: 'missing_flag_key' });
    if (enabled == null) return reply.code(400).send({ ok: false, error: 'missing_enabled_boolean' });
    if (!reason) return reply.code(400).send({ ok: false, error: 'missing_reason' });

    try {
      let readQuery = supabaseAdmin
        .from('feature_flags')
        .select('*')
        .eq('flag_key', flagKey)
        .eq('scope', scope)
        .limit(1);

      readQuery = scopeId ? readQuery.eq('scope_id', scopeId) : readQuery.is('scope_id', null);

      const current = await safeRows(readQuery);
      if (current.error) throw new Error(`feature_flags read failed: ${current.error.message}`);
      if (current.missing) throw new Error('feature_flags table missing; run migrations first');

      const existing = current.rows[0] || null;
      let next = null;

      if (existing) {
        const { data, error } = await supabaseAdmin
          .from('feature_flags')
          .update({
            enabled,
            rollout_pct: rolloutPct,
            updated_by: actor.user_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select('*')
          .single();
        if (error) throw new Error(`feature_flags update failed: ${error.message}`);
        next = data;
      } else {
        const { data, error } = await supabaseAdmin
          .from('feature_flags')
          .insert({
            flag_key: flagKey,
            enabled,
            scope,
            scope_id: scopeId,
            rollout_pct: rolloutPct,
            updated_by: actor.user_id,
          })
          .select('*')
          .single();
        if (error) throw new Error(`feature_flags insert failed: ${error.message}`);
        next = data;
      }

      await writeAudit({
        actor,
        action: 'set_feature_flag',
        targetType: 'feature_flag',
        targetId: next?.id || null,
        beforeState: existing || {},
        afterState: next || {},
        reason,
        metadata: {
          tenant_id: asText(req.tenant?.id) || null,
        },
      });

      return reply.send({ ok: true, timestamp: new Date().toISOString(), flag: next });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: asText(error?.message || error) });
    }
  });

  fastify.post('/api/control-plane/emergency-stop', {
    preHandler: [requireApiKey, ownerAdminRoleGuard, controlPlaneWriteGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    if (!ENV.CONTROL_PLANE_WRITE_ENABLED) return writeModeDisabled(reply);

    const actor = actorFromRequest(req);
    const reason = asText(req.body?.reason);
    const title = asText(req.body?.title || 'Emergency stop activated');

    if (!reason) return reply.code(400).send({ ok: false, error: 'missing_reason' });

    try {
      const result = await upsertGlobalSystemConfig({
        system_mode: 'emergency_stop',
        queue_enabled: false,
        ai_jobs_enabled: false,
        research_jobs_enabled: false,
        notifications_enabled: false,
        updated_by: actor.user_id,
      });

      const incidentInsert = await supabaseAdmin
        .from('incident_events')
        .insert({
          severity: 'critical',
          status: 'open',
          title,
          details: {
            reason,
            source: 'control_plane_emergency_stop',
          },
          owner_user_id: actor.user_id,
        })
        .select('id,severity,status,title,started_at')
        .single();

      if (incidentInsert.error && !isMissingSchema(incidentInsert.error)) {
        throw new Error(`incident_events insert failed: ${incidentInsert.error.message}`);
      }

      await writeAudit({
        actor,
        action: 'emergency_stop',
        targetType: 'system',
        targetId: result.after?.id || null,
        beforeState: result.before || {},
        afterState: {
          system_mode: 'emergency_stop',
          queue_enabled: false,
          ai_jobs_enabled: false,
          research_jobs_enabled: false,
          notifications_enabled: false,
        },
        reason,
        metadata: {
          tenant_id: asText(req.tenant?.id) || null,
          incident_id: incidentInsert.data?.id || null,
        },
      });

      return reply.send({
        ok: true,
        timestamp: new Date().toISOString(),
        state: {
          system_mode: 'emergency_stop',
          queue_enabled: false,
          ai_jobs_enabled: false,
          research_jobs_enabled: false,
          notifications_enabled: false,
        },
        incident: incidentInsert.data || null,
      });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: asText(error?.message || error) });
    }
  });
}
