import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { enqueueJob } from '../db.js';
import { verifySupabaseJwt } from '../lib/auth/verifySupabaseJwt.js';
import { evaluatePolicy } from '../lib/policy/policyEngine.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';

const ADMIN_ROLES = new Set(['owner', 'admin', 'super_admin']);
const VALID_STATUS = new Set(['pending', 'requires_approval', 'approved', 'rejected', 'queued', 'executing', 'completed', 'failed', 'cancelled']);
const CREATE_ACTION = 'admin_commands.create';
const AUTO_QUEUE_ACTION = 'admin_commands.auto_queue';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback = 20) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function clampInt(value, min, max, fallback) {
  return Math.min(max, Math.max(min, asInt(value, fallback)));
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

async function safeRows(query) {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { rows: [], missing: true, error: null };
    return { rows: [], missing: false, error };
  }
  return { rows: Array.isArray(data) ? data : [], missing: false, error: null };
}

async function safeSingle(query) {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { row: null, missing: true, error: null };
    return { row: null, missing: false, error };
  }
  return { row: data || null, missing: false, error: null };
}

async function writeAudit({ actor, action, targetId, beforeState = {}, afterState = {}, reason = null, metadata = {} }) {
  const { error } = await supabaseAdmin.from('control_plane_audit_log').insert({
    actor_user_id: actor?.user_id || null,
    actor_role: actor?.role || 'admin',
    action,
    target_type: 'admin_command',
    target_id: targetId,
    before_state: beforeState,
    after_state: afterState,
    reason,
    metadata,
  });

  if (error && !isMissingSchema(error)) {
    throw new Error(`control_plane_audit_log insert failed: ${error.message}`);
  }
}

function actorFromRequest(req) {
  return {
    user_id: asText(req?.user?.id) || null,
    role: asText(req?.admin?.roles?.[0]) || 'admin',
  };
}

function inferCommandType(command) {
  const normalized = asText(command).toLowerCase();
  if (normalized.includes('source')) return 'source_registry';
  if (normalized.includes('approve') || normalized.includes('reject') || normalized.includes('cancel')) return 'approval';
  if (normalized.includes('brief') || normalized.includes('summary')) return 'briefing';
  if (normalized.includes('queue') || normalized.includes('run') || normalized.includes('execute')) return 'execution';
  if (normalized.includes('mode') || normalized.includes('flag') || normalized.includes('control')) return 'control_plane';
  return 'general';
}

function inferRiskLevel(command) {
  const normalized = asText(command).toLowerCase();
  if (/(delete|remove|purge|shutdown|disable|drop|reset|revoke|wipe|emergency stop)/.test(normalized)) return 'high';
  if (/(approve|reject|cancel|pause|resume|restart|rerun|reprocess|requeue|publish|change)/.test(normalized)) return 'medium';
  return 'low';
}

function inferParsedIntent(command, commandType, riskLevel) {
  const normalized = asText(command).toLowerCase();
  let targetLabel = 'General Operations';
  if (normalized.includes('source')) targetLabel = 'Source Registry';
  else if (normalized.includes('brief')) targetLabel = 'Executive Briefings';
  else if (normalized.includes('queue') || normalized.includes('worker')) targetLabel = 'Execution Queue';
  else if (normalized.includes('mode') || normalized.includes('flag') || normalized.includes('control')) targetLabel = 'Control Plane';

  return {
    command_type: commandType,
    target_label: targetLabel,
    confidence_label: 'heuristic',
    validation_status: 'valid',
    risk_level: riskLevel,
    notes: [
      'Command accepted into the Windows-owned control plane.',
      riskLevel === 'low' ? 'Low-risk command can enter the queue after capture.' : 'Command requires explicit human approval before queueing.',
    ],
  };
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeStatus(record) {
  const direct = asText(record.status).toLowerCase();
  if (VALID_STATUS.has(direct)) return direct;

  const queueState = asText(record.queue_handoff_state).toLowerCase();
  const approvalStatus = asText(record.approval_status).toLowerCase();
  const outcome = asText(record.execution_outcome).toLowerCase();

  if (outcome === 'failed' || queueState === 'failed') return 'failed';
  if (outcome === 'completed' || queueState === 'completed') return 'completed';
  if (queueState === 'running') return 'executing';
  if (queueState === 'queued') return 'queued';
  if (approvalStatus === 'approved') return 'approved';
  if (approvalStatus === 'rejected') return 'rejected';
  if (asText(record.requires_approval || record.approval_required).toLowerCase() === 'true') return 'requires_approval';
  return 'pending';
}

export function commandResponseRow(record) {
  const status = normalizeStatus(record);
  return {
    id: asText(record.id),
    tenant_id: asText(record.tenant_id) || null,
    raw_command: asText(record.command_text),
    command_type: asText(record.command_type || 'general'),
    parsed_intent: (record.parsed_intent && typeof record.parsed_intent === 'object') ? record.parsed_intent : {},
    risk_level: asText(record.risk_level || 'medium'),
    status,
    validation_status: asText(record.validation_status || 'valid'),
    approval_required: Boolean(record.requires_approval ?? record.approval_required ?? false),
    approval_status: asText(record.approval_status || (status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending')),
    queue_status: asText(record.queue_handoff_state || 'not_queued'),
    queue_handoff_state: asText(record.queue_handoff_state || 'not_queued'),
    execution_outcome: asText(record.execution_outcome || 'pending'),
    result_summary: asText(record.result_summary || record.execution_summary),
    execution_summary: asText(record.result_summary || record.execution_summary),
    error_message: asText(record.error_message) || null,
    approved_by: asText(record.approved_by) || null,
    approved_at: asText(record.approved_at) || null,
    executed_at: asText(record.executed_at) || null,
    completed_at: asText(record.completed_at) || null,
    created_at: asText(record.created_at) || null,
    updated_at: asText(record.updated_at) || null,
  };
}

async function fetchCommandOrThrow(commandId) {
  const result = await safeSingle(
    supabaseAdmin
      .from('admin_commands')
      .select('*')
      .eq('id', commandId)
      .maybeSingle()
  );
  if (result.error) throw new Error(result.error.message);
  if (!result.row) {
    const err = new Error('command_not_found');
    err.statusCode = 404;
    throw err;
  }
  return result.row;
}

function assertTransition(command, nextStatus) {
  const current = normalizeStatus(command);
  const riskLevel = asText(command.risk_level || 'medium').toLowerCase();
  const requiresApproval = Boolean(command.requires_approval ?? command.approval_required ?? (riskLevel !== 'low'));

  const allowed = (
    (current === 'pending' && nextStatus === 'requires_approval' && (requiresApproval || riskLevel !== 'low'))
    || (current === 'pending' && nextStatus === 'queued' && riskLevel === 'low' && !requiresApproval)
    || (current === 'requires_approval' && (nextStatus === 'approved' || nextStatus === 'rejected' || nextStatus === 'cancelled'))
    || (current === 'approved' && (nextStatus === 'queued' || nextStatus === 'cancelled'))
    || (current === 'queued' && (nextStatus === 'executing' || nextStatus === 'cancelled'))
    || (current === 'executing' && (nextStatus === 'completed' || nextStatus === 'failed'))
  );

  if (!allowed) {
    const err = new Error(`invalid_transition:${current}->${nextStatus}`);
    err.statusCode = 409;
    throw err;
  }
}

async function updateCommandStatus({ commandId, nextStatus, actor, reason = '', patch = {} }) {
  const current = await fetchCommandOrThrow(commandId);
  assertTransition(current, nextStatus);

  const updatePayload = {
    ...patch,
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('admin_commands')
    .update(updatePayload)
    .eq('id', commandId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  if (nextStatus === 'approved' || nextStatus === 'rejected') {
    const decision = nextStatus === 'approved' ? 'approved' : 'rejected';
    const { error: approvalError } = await supabaseAdmin.from('admin_command_approvals').insert({
      command_id: commandId,
      approver_user_id: actor.user_id,
      decision,
      reason: reason || null,
      metadata: { source: 'oracle_control_plane_api' },
    });
    if (approvalError && !isMissingSchema(approvalError)) throw new Error(approvalError.message);
  }

  await writeAudit({
    actor,
    action: `admin_command.${nextStatus}`,
    targetId: commandId,
    beforeState: current,
    afterState: data || {},
    reason,
    metadata: { next_status: nextStatus },
  });

  return data || {};
}

async function patchPendingCommand(commandId, patch = {}) {
  const { data, error } = await supabaseAdmin
    .from('admin_commands')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', commandId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data || {};
}

async function enqueueAdminCommandExecution(command, logger = console) {
  const commandId = asText(command?.id);
  const tenantId = asText(command?.tenant_id);
  if (!commandId || !tenantId) return null;

  return enqueueJob({
    tenant_id: tenantId,
    job_type: 'admin_command_execute',
    payload: {
      command_id: commandId,
      tenant_id: tenantId,
      command_text: asText(command.command_text),
      command_type: asText(command.command_type || 'general'),
      risk_level: asText(command.risk_level || 'medium'),
      parsed_intent: asObject(command.parsed_intent),
    },
    priority: asText(command.risk_level).toLowerCase() === 'high' ? 90 : 70,
    max_attempts: 1,
    dedupe_key: `admin_command:${commandId}`,
    logger,
  });
}

export async function createAdminCommand({
  actor,
  tenantId,
  commandText,
  requestIp = null,
  source = 'oracle_admin_api',
  metadata = {},
  logger = console,
  chatId = null,
}) {
  const commandType = inferCommandType(commandText);
  const riskLevel = inferRiskLevel(commandText);
  const parsedIntent = inferParsedIntent(commandText, commandType, riskLevel);
  const policyContext = {
    tenant_id: tenantId,
    user_id: actor?.user_id || null,
    ip: requestIp,
    source,
    channel: source,
    chat_id: chatId,
    command_type: commandType,
    risk_level: riskLevel,
    message_length: commandText.length,
  };

  const createPolicy = await evaluatePolicy({
    supabaseAdmin,
    action: CREATE_ACTION,
    context: policyContext,
  });

  if (!createPolicy.allowed) {
    const err = new Error(`policy_denied:${CREATE_ACTION}`);
    err.statusCode = 403;
    throw err;
  }

  const autoQueuePolicy = await evaluatePolicy({
    supabaseAdmin,
    action: AUTO_QUEUE_ACTION,
    context: policyContext,
  });

  const requiresApproval = riskLevel !== 'low' || !autoQueuePolicy.allowed;
  const insertMetadata = {
    ...asObject(metadata),
    source,
    chat_id: chatId || null,
    policy: {
      create: createPolicy.reason,
      auto_queue: autoQueuePolicy.reason,
    },
  };

  const { data, error } = await supabaseAdmin
    .from('admin_commands')
    .insert({
      tenant_id: tenantId,
      issuer_user_id: actor?.user_id || null,
      command_text: commandText,
      command_type: commandType,
      parsed_intent: parsedIntent,
      risk_level: riskLevel,
      status: 'pending',
      requires_approval: requiresApproval,
      approval_required: requiresApproval,
      result_summary: 'Command captured by the Windows control plane.',
      metadata: insertMetadata,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  const created = data || {};
  if (requiresApproval) {
    const transitioned = await updateCommandStatus({
      commandId: created.id,
      nextStatus: 'requires_approval',
      actor,
      reason: !autoQueuePolicy.allowed
        ? 'Auto-queue denied by tenant policy; command routed to approval queue.'
        : 'Command requires human approval before execution.',
      patch: {
        result_summary: !autoQueuePolicy.allowed
          ? 'Command captured and routed to approval because tenant policy denied auto-queue.'
          : 'Command stored and moved into approval queue.',
      },
    });

    return {
      submitted: transitioned,
      acknowledgment: !autoQueuePolicy.allowed
        ? 'Command stored and routed to approval queue because auto-queue is policy-restricted.'
        : 'Command stored and routed to approval queue.',
      queue_handoff_failed: false,
    };
  }

  const jobId = await enqueueAdminCommandExecution(created, logger);
  if (!jobId) {
    const pending = await patchPendingCommand(created.id, {
      error_message: 'Command queue handoff failed before execution.',
      result_summary: 'Command captured, but worker queue handoff failed.',
      metadata: {
        ...asObject(created.metadata),
        queue_handoff_failed: true,
      },
    });

    return {
      submitted: pending,
      acknowledgment: 'Command captured, but queue handoff failed.',
      queue_handoff_failed: true,
    };
  }

  const queued = await updateCommandStatus({
    commandId: created.id,
    nextStatus: 'queued',
    actor,
    reason: 'Low-risk command queued automatically after capture.',
    patch: {
      result_summary: 'Command stored and queued for worker pickup.',
      metadata: {
        ...asObject(created.metadata),
        queue_job_id: jobId,
      },
    },
  });

  return {
    submitted: queued,
    acknowledgment: 'Command stored and queued for execution.',
    queue_handoff_failed: false,
  };
}

function requireWriteEnabled(reply) {
  if (!ENV.CONTROL_PLANE_WRITE_ENABLED) {
    return reply.code(503).send({
      ok: false,
      error: 'control_plane_write_disabled',
      message: 'Set CONTROL_PLANE_WRITE_ENABLED=true to enable command lifecycle writes.',
    });
  }
  return null;
}

function assertCommandAccess(command, adminScope) {
  const tenantId = asText(command?.tenant_id);
  if (!tenantId) return;
  if (Array.isArray(adminScope?.roles) && adminScope.roles.includes('super_admin')) return;
  if (Array.isArray(adminScope?.tenant_ids) && adminScope.tenant_ids.includes(tenantId)) return;

  const err = new Error('forbidden_command_scope');
  err.statusCode = 403;
  throw err;
}

function applyTenantScope(query, tenantId, adminScope) {
  if (tenantId) return query.eq('tenant_id', tenantId);
  if (Array.isArray(adminScope?.roles) && adminScope.roles.includes('super_admin')) return query;
  if (Array.isArray(adminScope?.tenant_ids) && adminScope.tenant_ids.length > 0) return query.in('tenant_id', adminScope.tenant_ids);
  return query;
}

export async function adminCommandRoutes(fastify) {
  fastify.get('/api/admin/commands', {
    preHandler: [requireApiKey, requireAdminUser],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id) || null;
    const status = asText(req.query?.status).toLowerCase();
    const riskLevel = asText(req.query?.risk_level).toLowerCase();
    const limit = clampInt(req.query?.limit, 1, 100, 50);

    let query = applyTenantScope(
      supabaseAdmin
        .from('admin_commands')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId,
      req.admin,
    );

    if (status) query = query.eq('status', status);
    if (riskLevel) query = query.eq('risk_level', riskLevel);

    const commands = await safeRows(query);
    if (commands.error) throw new Error(commands.error.message);

    const items = commands.rows.map(commandResponseRow);
    return reply.send({ ok: true, count: items.length, items });
  });

  fastify.get('/api/admin/commands/:id', {
    preHandler: [requireApiKey, requireAdminUser],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const command = await fetchCommandOrThrow(asText(req.params?.id));
    assertCommandAccess(command, req.admin);

    const [eventsRes, approvalsRes, agentSummariesRes, relatedSourceRes] = await Promise.all([
      safeRows(
        supabaseAdmin
          .from('admin_command_events')
          .select('id,event_type,from_status,to_status,detail,metadata,created_at')
          .eq('command_id', command.id)
          .order('created_at', { ascending: true })
      ),
      safeRows(
        supabaseAdmin
          .from('admin_command_approvals')
          .select('id,decision,reason,approved_at,approver_user_id')
          .eq('command_id', command.id)
          .order('approved_at', { ascending: true })
      ),
      safeRows(
        supabaseAdmin
          .from('agent_run_summaries')
          .select('id,agent_name,headline,summary,run_status,created_at')
          .eq('command_id', command.id)
          .order('created_at', { ascending: false })
          .limit(10)
      ),
      command.related_source_id
        ? safeSingle(
            supabaseAdmin
              .from('research_sources')
              .select('id,label,canonical_url,status')
              .eq('id', command.related_source_id)
              .maybeSingle()
          )
        : Promise.resolve({ row: null, missing: false, error: null }),
    ]);

    const detail = {
      ...commandResponseRow(command),
      parsed_intent_label: asText(command.parsed_intent?.target_label || command.parsed_intent?.command_type || command.command_type),
      related_source: relatedSourceRes.row ? {
        id: asText(relatedSourceRes.row.id),
        label: asText(relatedSourceRes.row.label),
        url: asText(relatedSourceRes.row.canonical_url),
        status: asText(relatedSourceRes.row.status),
      } : null,
      related_agent_summaries: agentSummariesRes.rows.map((row) => ({
        id: asText(row.id),
        agent_name: asText(row.agent_name),
        headline: asText(row.headline || row.summary),
        status: asText(row.run_status),
        completed_at: asText(row.created_at),
      })),
      timeline: eventsRes.rows.map((row) => ({
        id: asText(row.id),
        label: asText(row.event_type || row.to_status || 'event'),
        status: asText(row.to_status || row.event_type || 'unknown'),
        created_at: asText(row.created_at),
        detail: asText(row.detail || row.metadata?.message || row.event_type || 'Command event recorded.'),
      })),
      approvals: approvalsRes.rows,
    };

    return reply.send({ ok: true, detail });
  });

  fastify.post('/api/admin/commands', {
    preHandler: [requireApiKey, requireAdminUser],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const disabled = requireWriteEnabled(reply);
    if (disabled) return disabled;

    const actor = actorFromRequest(req);
    const commandText = asText(req.body?.command_text || req.body?.command);
    const tenantId = asText(req.body?.tenant_id) || req.admin?.tenant_ids?.[0] || null;
    if (!commandText || commandText.length < 3) {
      return reply.code(400).send({ ok: false, error: 'command_text_required' });
    }
    if (tenantId && !((Array.isArray(req.admin?.roles) && req.admin.roles.includes('super_admin')) || (Array.isArray(req.admin?.tenant_ids) && req.admin.tenant_ids.includes(tenantId)))) {
      return reply.code(403).send({ ok: false, error: 'forbidden_command_scope' });
    }

    const created = await createAdminCommand({
      actor,
      tenantId,
      commandText,
      requestIp: req.ip,
      source: 'oracle_admin_api',
      metadata: { acknowledgment: 'stored' },
      logger: req.log,
    });

    if (created.queue_handoff_failed) {
      return reply.code(503).send({
        ok: false,
        error: 'queue_handoff_failed',
        acknowledgment: created.acknowledgment,
        submitted: commandResponseRow(created.submitted),
      });
    }

    return reply.send({
      ok: true,
      acknowledgment: created.acknowledgment,
      submitted: commandResponseRow(created.submitted),
    });
  });

  fastify.post('/api/admin/commands/:id/approve', {
    preHandler: [requireApiKey, requireAdminUser],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const disabled = requireWriteEnabled(reply);
    if (disabled) return disabled;
    const actor = actorFromRequest(req);
    const current = await fetchCommandOrThrow(asText(req.params?.id));
    assertCommandAccess(current, req.admin);
    const approved = await updateCommandStatus({
      commandId: asText(req.params?.id),
      nextStatus: 'approved',
      actor,
      reason: asText(req.body?.reason || 'Approved by admin control plane.'),
      patch: {
        approved_by: actor.user_id,
        approved_at: new Date().toISOString(),
        result_summary: 'Command approved and ready for queue handoff.',
      },
    });

    const jobId = await enqueueAdminCommandExecution(approved, req.log);
    if (!jobId) {
      const pendingApprovalState = await patchPendingCommand(asText(req.params?.id), {
        error_message: 'Approval succeeded, but queue handoff failed.',
        result_summary: 'Command approved, but queue handoff failed before execution.',
      });

      return reply.code(503).send({
        ok: false,
        error: 'queue_handoff_failed',
        command: commandResponseRow(pendingApprovalState),
      });
    }

    const queued = await updateCommandStatus({
      commandId: asText(req.params?.id),
      nextStatus: 'queued',
      actor,
      reason: 'Approved command moved into execution queue.',
      patch: {
        result_summary: 'Command approved and queued for execution.',
        metadata: {
          ...asObject(approved.metadata),
          queue_job_id: jobId,
        },
      },
    });

    return reply.send({ ok: true, approved: commandResponseRow(approved), queued: commandResponseRow(queued) });
  });

  fastify.post('/api/admin/commands/:id/reject', {
    preHandler: [requireApiKey, requireAdminUser],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const disabled = requireWriteEnabled(reply);
    if (disabled) return disabled;
    const actor = actorFromRequest(req);
    const current = await fetchCommandOrThrow(asText(req.params?.id));
    assertCommandAccess(current, req.admin);
    const rejected = await updateCommandStatus({
      commandId: asText(req.params?.id),
      nextStatus: 'rejected',
      actor,
      reason: asText(req.body?.reason || 'Rejected by admin control plane.'),
      patch: {
        approved_by: actor.user_id,
        approved_at: new Date().toISOString(),
        error_message: asText(req.body?.reason || 'Command rejected by approver.'),
        result_summary: 'Command rejected before execution.',
      },
    });

    return reply.send({ ok: true, command: commandResponseRow(rejected) });
  });

  fastify.post('/api/admin/commands/:id/cancel', {
    preHandler: [requireApiKey, requireAdminUser],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const disabled = requireWriteEnabled(reply);
    if (disabled) return disabled;
    const actor = actorFromRequest(req);
    const command = await fetchCommandOrThrow(asText(req.params?.id));
    assertCommandAccess(command, req.admin);
    const current = normalizeStatus(command);
    if (!['requires_approval', 'approved', 'queued'].includes(current)) {
      return reply.code(409).send({ ok: false, error: `cancel_not_allowed_from_${current}` });
    }

    const cancelled = await updateCommandStatus({
      commandId: asText(req.params?.id),
      nextStatus: 'cancelled',
      actor,
      reason: asText(req.body?.reason || 'Cancelled by admin control plane.'),
      patch: {
        error_message: asText(req.body?.reason || 'Command cancelled before execution.'),
        result_summary: 'Command cancelled before execution completed.',
      },
    });

    return reply.send({ ok: true, command: commandResponseRow(cancelled) });
  });

  fastify.get('/api/admin/briefings', {
    preHandler: [requireApiKey, requireAdminUser],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id) || null;
    const hours = clampInt(req.query?.hours, 1, 24 * 30, 72);
    const limit = clampInt(req.query?.limit, 1, 50, 8);
    const sinceIso = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();

    const briefingQuery = applyTenantScope(
      supabaseAdmin
        .from('executive_briefings')
        .select('id,tenant_id,title,summary,blockers,recommended_actions,recommendations,critical_alerts,urgency,created_at')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId,
      req.admin,
    );

    const highlightsQuery = applyTenantScope(
      supabaseAdmin
        .from('agent_run_summaries')
        .select('id,agent_name,headline,summary,run_status,risk_level,created_at')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId,
      req.admin,
    );

    const [briefingsRes, highlightsRes] = await Promise.all([safeRows(briefingQuery), safeRows(highlightsQuery)]);
    if (briefingsRes.error) throw new Error(briefingsRes.error.message);
    if (highlightsRes.error) throw new Error(highlightsRes.error.message);

    const briefings = briefingsRes.rows.map((row) => ({
      id: asText(row.id),
      title: asText(row.title || 'Executive briefing'),
      summary: asText(row.summary),
      blockers: Array.isArray(row.blockers) ? row.blockers : [],
      recommended_actions: Array.isArray(row.recommended_actions) ? row.recommended_actions : [],
      recommendations: Array.isArray(row.recommendations) ? row.recommendations : (Array.isArray(row.recommended_actions) ? row.recommended_actions : []),
      critical_alerts: Array.isArray(row.critical_alerts) ? row.critical_alerts : [],
      urgency: asText(row.urgency || 'normal'),
      created_at: asText(row.created_at),
    }));

    return reply.send({
      ok: true,
      generated_at: new Date().toISOString(),
      latest_briefing: briefings[0] || null,
      briefings,
      recent_agent_highlights: highlightsRes.rows.map((row) => ({
        id: asText(row.id),
        agent_name: asText(row.agent_name),
        headline: asText(row.headline || row.summary),
        summary: asText(row.summary),
        status: asText(row.run_status),
        risk_level: asText(row.risk_level || 'normal'),
        created_at: asText(row.created_at),
      })),
    });
  });
}