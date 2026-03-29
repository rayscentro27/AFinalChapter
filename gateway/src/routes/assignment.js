import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { requireTenantRole } from '../lib/auth/requireTenantRole.js';
import { logAudit } from '../lib/audit/auditLog.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';
import {
  hasValidCronToken,
  isLocalRequest,
  parseAllowedTenantIds,
} from '../util/cron-auth.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const DEFAULT_SLA_MINUTES = 60;
const MIN_SLA_MINUTES = 5;
const MAX_SLA_MINUTES = 24 * 60;
const ASSIGNABLE_ROLES = new Set(['owner', 'admin', 'agent']);
const OPEN_STATUSES = new Set(['open', 'pending']);

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function lower(value) {
  return asText(value).toLowerCase();
}

function getTenantIdFromRequest(req) {
  return (
    asText(req?.body?.tenant_id)
    || asText(req?.query?.tenant_id)
    || asText(req?.params?.tenant_id)
    || asText(req?.tenant?.id)
    || null
  );
}

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toJson(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function clampLimit(value) {
  return Math.min(MAX_LIMIT, Math.max(1, asInt(value, DEFAULT_LIMIT) || DEFAULT_LIMIT));
}

function clampSlaMinutes(value, fallback = DEFAULT_SLA_MINUTES) {
  const raw = asInt(value, fallback);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(MAX_SLA_MINUTES, Math.max(MIN_SLA_MINUTES, raw));
}

function parseIso(value) {
  const ts = new Date(value || '').getTime();
  return Number.isFinite(ts) ? ts : null;
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
    || (msg.includes('could not find the') && msg.includes('column') && msg.includes('schema cache'))
  );
}

function missingColumnsFromError(error, keys) {
  const msg = String(error?.message || '').toLowerCase();
  const missing = [];

  const regexes = [
    /column\s+"?([a-z0-9_]+)"?\s+does not exist/g,
    /could not find the '([a-z0-9_]+)' column/g,
  ];

  for (const re of regexes) {
    let hit;
    while ((hit = re.exec(msg)) !== null) {
      if (hit[1]) missing.push(String(hit[1]).toLowerCase());
    }
  }

  for (const key of keys) {
    const k = String(key || '').toLowerCase();
    if (k && msg.includes(k)) missing.push(k);
  }

  return Array.from(new Set(missing));
}

function normalizePriority(row) {
  if (typeof row?.priority === 'string') {
    const label = lower(row.priority);
    if (['low', 'normal', 'high', 'urgent'].includes(label)) return label;
  }

  if (typeof row?.priority_label === 'string') {
    const label = lower(row.priority_label);
    if (['low', 'normal', 'high', 'urgent'].includes(label)) return label;
  }

  if (typeof row?.priority === 'number') {
    const value = Number(row.priority);
    if (value <= 1) return 'urgent';
    if (value <= 2) return 'high';
    if (value <= 4) return 'normal';
    return 'low';
  }

  return 'normal';
}

function normalizeProvider(value) {
  const normalized = lower(value);

  return normalized;
}

function normalizeTags(tags) {
  return asArray(tags).map((tag) => lower(tag)).filter(Boolean);
}

function hasAnyTag(conversationTags, expectedTags) {
  if (!conversationTags.length || !expectedTags.length) return false;
  const set = new Set(conversationTags);
  return expectedTags.some((tag) => set.has(tag));
}

function isConversationOpen(row) {
  const status = lower(row?.status || 'open');
  return OPEN_STATUSES.has(status);
}

function isConversationUnassigned(row) {
  return !asText(row?.assigned_to) && !asText(row?.assignee_user_id) && !asText(row?.assignee_ai_key);
}

function isEscalationCandidate(row, nowMs) {
  if (!isConversationOpen(row)) return false;
  if (asText(row?.sla_breached_at)) return false;
  const dueMs = parseIso(row?.sla_due_at);
  return dueMs !== null && dueMs <= nowMs;
}

function assignmentRuleMatches({ rule, row, provider }) {
  const match = toJson(rule?.match);

  const providerMatch = match.provider;
  if (providerMatch !== undefined) {
    const providers = Array.isArray(providerMatch) ? providerMatch.map(normalizeProvider) : [normalizeProvider(providerMatch)];
    if (!providers.filter(Boolean).includes(normalizeProvider(provider))) return false;
  }

  const statusMatch = match.status;
  if (statusMatch !== undefined) {
    const statuses = Array.isArray(statusMatch) ? statusMatch.map(lower) : [lower(statusMatch)];
    if (!statuses.filter(Boolean).includes(lower(row?.status || ''))) return false;
  }

  const inboxMatch = match.inbox || match.channel_account_id;
  if (inboxMatch !== undefined) {
    const inboxes = Array.isArray(inboxMatch) ? inboxMatch.map(asText) : [asText(inboxMatch)];
    if (!inboxes.filter(Boolean).includes(asText(row?.channel_account_id))) return false;
  }

  const tagsMatch = match.tags;
  if (tagsMatch !== undefined) {
    const expectedTags = normalizeTags(tagsMatch);
    if (expectedTags.length > 0 && !hasAnyTag(normalizeTags(row?.tags), expectedTags)) return false;
  }

  const priorityMatch = match.priority;
  if (priorityMatch !== undefined) {
    const current = normalizePriority(row);
    const expected = Array.isArray(priorityMatch)
      ? priorityMatch.map((value) => lower(value)).filter(Boolean)
      : [lower(priorityMatch)].filter(Boolean);

    if (expected.length > 0 && !expected.includes(current)) return false;
  }

  return true;
}

async function requireApiKey(req, reply) {
  const key = asText(req.headers['x-api-key']);
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    reply.code(401).send({ ok: false, error: 'unauthorized' });
    return;
  }
  return undefined;
}

async function loadTenantAgents(tenantId) {
  const primary = await supabaseAdmin
    .from('tenant_memberships')
    .select('user_id,role')
    .eq('tenant_id', tenantId);

  let rows = [];
  if (primary.error) {
    if (!isMissingSchema(primary.error)) {
      throw new Error(`tenant_memberships lookup failed: ${primary.error.message}`);
    }

    const fallback = await supabaseAdmin
      .from('tenant_members')
      .select('user_id,role')
      .eq('tenant_id', tenantId);

    if (fallback.error) throw new Error(`tenant_members lookup failed: ${fallback.error.message}`);
    rows = fallback.data || [];
  } else {
    rows = primary.data || [];
  }

  return Array.from(new Set(
    rows
      .filter((row) => ASSIGNABLE_ROLES.has(lower(row.role)))
      .map((row) => asText(row.user_id))
      .filter(Boolean)
  ));
}

async function loadActiveAssignmentRules(tenantId) {
  const { data, error } = await supabaseAdmin
    .from('assignment_rules')
    .select('id,tenant_id,name,is_active,match,action,created_at')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingSchema(error)) {
      throw new Error('assignment_rules schema missing; run supabase_assignment.sql first');
    }
    throw new Error(`assignment rules query failed: ${error.message}`);
  }

  return data || [];
}

async function loadChannelProviderMap(tenantId, channelAccountIds) {
  const ids = Array.from(new Set((channelAccountIds || []).map((id) => asText(id)).filter(Boolean)));
  if (!ids.length) return new Map();

  const { data, error } = await supabaseAdmin
    .from('channel_accounts')
    .select('id,provider')
    .eq('tenant_id', tenantId)
    .in('id', ids);

  if (error) throw new Error(`channel account provider lookup failed: ${error.message}`);

  const map = new Map();
  for (const row of data || []) {
    map.set(asText(row.id), normalizeProvider(row.provider));
  }
  return map;
}

async function selectConversationCandidates({ tenantId, limit, mode }) {
  const variants = [
    'id,tenant_id,status,priority,priority_label,tags,channel_account_id,assigned_to,assigned_at,sla_minutes,sla_due_at,sla_breached_at,assignee_type,assignee_user_id,assignee_ai_key,last_message_at,created_at,updated_at',
    'id,tenant_id,status,priority,tags,channel_account_id,assigned_to,assigned_at,sla_minutes,sla_due_at,sla_breached_at,assignee_type,assignee_user_id,assignee_ai_key,last_message_at,created_at,updated_at',
    'id,tenant_id,status,priority,tags,channel_account_id,sla_minutes,sla_due_at,sla_breached_at,assignee_type,assignee_user_id,assignee_ai_key,last_message_at,created_at,updated_at',
    'id,tenant_id,status,priority,tags,channel_account_id,assignee_type,assignee_user_id,assignee_ai_key,last_message_at,created_at,updated_at',
  ];

  const nowIso = new Date().toISOString();
  const queryLimit = Math.min(MAX_LIMIT, Math.max(limit * 5, limit));
  let lastError = null;

  for (const select of variants) {
    let query = supabaseAdmin
      .from('conversations')
      .select(select)
      .eq('tenant_id', tenantId)
      .order('last_message_at', { ascending: true, nullsFirst: true })
      .limit(queryLimit);

    if (mode === 'assignment') {
      query = query.eq('status', 'open');
    } else {
      query = query.in('status', ['open', 'pending']);
      if (select.includes('sla_due_at')) {
        query = query.not('sla_due_at', 'is', null).lte('sla_due_at', nowIso);
      }
    }

    const { data, error } = await query;
    if (!error) return data || [];

    lastError = error;
    if (!isMissingSchema(error)) {
      throw new Error(`conversation candidate query failed: ${error.message}`);
    }
  }

  if (mode === 'escalation') {
    throw new Error('conversations schema missing SLA columns; run supabase_assignment.sql first');
  }

  if (lastError) throw new Error(`conversation candidate query failed: ${lastError.message}`);
  return [];
}

async function loadOpenLoadMap(tenantId, agentIds) {
  const map = new Map(agentIds.map((id) => [id, 0]));
  if (!agentIds.length) return map;

  const variants = [
    'status,assigned_to,assignee_user_id',
    'status,assignee_user_id',
  ];

  for (const select of variants) {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select(select)
      .eq('tenant_id', tenantId)
      .in('status', ['open', 'pending']);

    if (error) {
      if (isMissingSchema(error)) continue;
      throw new Error(`agent workload query failed: ${error.message}`);
    }

    for (const row of data || []) {
      const assignee = asText(row.assigned_to) || asText(row.assignee_user_id);
      if (!assignee || !map.has(assignee)) continue;
      map.set(assignee, Number(map.get(assignee) || 0) + 1);
    }

    return map;
  }

  return map;
}

function pickLeastLoaded(loadMap, candidateIds) {
  let best = null;
  let bestLoad = Number.POSITIVE_INFINITY;

  const sorted = [...candidateIds].sort((a, b) => a.localeCompare(b));
  for (const userId of sorted) {
    const load = Number(loadMap.get(userId) || 0);
    if (load < bestLoad) {
      best = userId;
      bestLoad = load;
    }
  }

  if (!best) return null;
  loadMap.set(best, Number(loadMap.get(best) || 0) + 1);
  return best;
}

function actionForMode(actionRaw, mode) {
  const action = toJson(actionRaw);
  if (mode === 'escalation' && action.escalate && typeof action.escalate === 'object') {
    return asObject(action.escalate);
  }
  return action;
}

function resolveTargetUser({ action, agentIds, loadMap }) {
  const assignMode = lower(action.assign || 'least_loaded');

  if (assignMode === 'user') {
    const userId = asText(action.user_id || action.assigned_to);
    return userId && agentIds.includes(userId) ? userId : null;
  }

  const scoped = asArray(action.user_ids).map((id) => asText(id)).filter((id) => id && agentIds.includes(id));
  const candidates = scoped.length ? scoped : agentIds;
  if (!candidates.length) return null;

  return pickLeastLoaded(loadMap, candidates);
}

async function updateConversationResilient({ tenantId, conversationId, patch }) {
  let keys = Object.keys(patch).filter((key) => patch[key] !== undefined);
  if (!keys.length) return { data: null, appliedKeys: [] };

  let attempt = 0;
  while (keys.length && attempt < 12) {
    attempt += 1;
    const payload = Object.fromEntries(keys.map((key) => [key, patch[key]]));

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .update(payload)
      .eq('tenant_id', tenantId)
      .eq('id', conversationId)
      .select('*')
      .maybeSingle();

    if (!error) {
      return {
        data: data || null,
        appliedKeys: keys,
      };
    }

    if (!isMissingSchema(error)) {
      throw new Error(`conversation update failed: ${error.message}`);
    }

    const missing = missingColumnsFromError(error, keys);
    if (!missing.length) throw new Error(`conversation update failed: ${error.message}`);
    keys = keys.filter((key) => !missing.includes(key.toLowerCase()));
  }

  return { data: null, appliedKeys: [] };
}

function buildAssignmentPatch({ assignedTo, slaMinutes, nowIso, markBreach }) {
  const dueAtIso = new Date(Date.now() + slaMinutes * 60000).toISOString();
  return {
    assigned_to: assignedTo,
    assigned_at: nowIso,
    sla_minutes: slaMinutes,
    sla_due_at: dueAtIso,
    ...(markBreach ? { sla_breached_at: nowIso } : {}),
    assignee_type: assignedTo ? 'agent' : 'agent',
    assignee_user_id: assignedTo,
    assignee_ai_key: null,
  };
}

async function runAssignmentBatch({ tenantId, limit }) {
  const [rules, candidates, agentIds] = await Promise.all([
    loadActiveAssignmentRules(tenantId),
    selectConversationCandidates({ tenantId, limit, mode: 'assignment' }),
    loadTenantAgents(tenantId),
  ]);

  if (!agentIds.length) {
    return { processed: 0, assigned: 0, skipped: 0, reason: 'no_assignable_agents', items: [] };
  }

  const channelMap = await loadChannelProviderMap(tenantId, candidates.map((row) => row.channel_account_id));
  const loadMap = await loadOpenLoadMap(tenantId, agentIds);

  let processed = 0;
  let assigned = 0;
  let skipped = 0;
  const items = [];

  for (const row of candidates) {
    if (processed >= limit) break;
    if (!isConversationUnassigned(row)) continue;

    processed += 1;
    const provider = channelMap.get(asText(row.channel_account_id)) || null;
    const matched = rules.find((rule) => assignmentRuleMatches({ rule, row, provider })) || null;

    if (!matched) {
      skipped += 1;
      items.push({
        conversation_id: row.id,
        status: 'skipped',
        reason: 'no_matching_rule',
      });
      continue;
    }

    const action = actionForMode(matched.action, 'assignment');
    const assignedTo = resolveTargetUser({ action, agentIds, loadMap });

    if (!assignedTo) {
      skipped += 1;
      items.push({
        conversation_id: row.id,
        rule_id: matched.id,
        rule_name: matched.name,
        status: 'skipped',
        reason: 'no_assignment_target',
      });
      continue;
    }

    const nowIso = new Date().toISOString();
    const slaMinutes = clampSlaMinutes(action.sla_minutes ?? row.sla_minutes ?? DEFAULT_SLA_MINUTES);
    const patch = buildAssignmentPatch({ assignedTo, slaMinutes, nowIso, markBreach: false });

    const updated = await updateConversationResilient({
      tenantId,
      conversationId: row.id,
      patch,
    });

    if (!updated.appliedKeys.length) {
      skipped += 1;
      items.push({
        conversation_id: row.id,
        rule_id: matched.id,
        rule_name: matched.name,
        status: 'skipped',
        reason: 'no_supported_assignment_columns',
      });
      continue;
    }

    assigned += 1;
    items.push({
      conversation_id: row.id,
      rule_id: matched.id,
      rule_name: matched.name,
      status: 'assigned',
      assigned_to: assignedTo,
      sla_minutes: slaMinutes,
      sla_due_at: updated.data?.sla_due_at || patch.sla_due_at,
    });
  }

  return { processed, assigned, skipped, items };
}

async function runEscalationBatch({ tenantId, limit }) {
  const [rules, candidates, agentIds] = await Promise.all([
    loadActiveAssignmentRules(tenantId),
    selectConversationCandidates({ tenantId, limit, mode: 'escalation' }),
    loadTenantAgents(tenantId),
  ]);

  const nowMs = Date.now();
  const dueRows = candidates.filter((row) => isEscalationCandidate(row, nowMs));

  if (!dueRows.length) {
    return { processed: 0, breached: 0, reassigned: 0, skipped: 0, items: [] };
  }

  const channelMap = await loadChannelProviderMap(tenantId, dueRows.map((row) => row.channel_account_id));
  const loadMap = await loadOpenLoadMap(tenantId, agentIds);

  let processed = 0;
  let breached = 0;
  let reassigned = 0;
  let skipped = 0;
  const items = [];

  for (const row of dueRows) {
    if (processed >= limit) break;
    processed += 1;

    const provider = channelMap.get(asText(row.channel_account_id)) || null;
    const matched = rules.find((rule) => assignmentRuleMatches({ rule, row, provider })) || null;
    const action = matched ? actionForMode(matched.action, 'escalation') : {};

    const assignedTo = agentIds.length
      ? (resolveTargetUser({ action, agentIds, loadMap }) || null)
      : null;

    const nowIso = new Date().toISOString();
    const slaMinutes = clampSlaMinutes(action.sla_minutes ?? row.sla_minutes ?? DEFAULT_SLA_MINUTES);

    const patch = assignedTo
      ? buildAssignmentPatch({ assignedTo, slaMinutes, nowIso, markBreach: true })
      : { sla_breached_at: nowIso };

    const updated = await updateConversationResilient({
      tenantId,
      conversationId: row.id,
      patch,
    });

    if (!updated.appliedKeys.length) {
      skipped += 1;
      items.push({
        conversation_id: row.id,
        status: 'skipped',
        reason: 'no_supported_escalation_columns',
      });
      continue;
    }

    breached += 1;
    if (assignedTo) reassigned += 1;

    items.push({
      conversation_id: row.id,
      rule_id: matched?.id || null,
      rule_name: matched?.name || null,
      status: assignedTo ? 'breached_reassigned' : 'breached_marked',
      assigned_to: assignedTo,
      sla_breached_at: updated.data?.sla_breached_at || nowIso,
      sla_due_at: updated.data?.sla_due_at || (assignedTo ? patch.sla_due_at : row.sla_due_at),
    });
  }

  return { processed, breached, reassigned, skipped, items };
}

function validateRulePayload(payload, mode = 'create') {
  const tenantId = asText(payload?.tenant_id);
  if (!tenantId) throw new Error('missing_tenant_id');

  if (mode === 'update' && !asText(payload?.id)) throw new Error('missing_rule_id');

  const out = {
    tenant_id: tenantId,
  };

  if (mode === 'create') {
    const name = asText(payload?.name);
    if (!name) throw new Error('missing_name');
    out.name = name.slice(0, 120);
    out.is_active = payload?.is_active === undefined ? true : Boolean(payload.is_active);
    out.match = toJson(payload?.match);
    out.action = toJson(payload?.action);
  } else {
    out.id = asText(payload?.id);

    if (payload?.name !== undefined) {
      const name = asText(payload.name);
      if (!name) throw new Error('invalid_name');
      out.name = name.slice(0, 120);
    }

    if (payload?.is_active !== undefined) out.is_active = Boolean(payload.is_active);
    if (payload?.match !== undefined) out.match = toJson(payload.match);
    if (payload?.action !== undefined) out.action = toJson(payload.action);
  }

  return out;
}

export async function assignmentRoutes(fastify) {
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

    req.runnerTenantId = tenantId;

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

    await agentRoleGuard(req, reply);
    if (reply.sent) return undefined;

    const scopedTenantId = asText(req.tenant?.id);
    if (scopedTenantId && scopedTenantId !== tenantId) {
      return reply.code(403).send({ ok: false, error: 'tenant_scope_mismatch' });
    }

    req.auth_mode = 'user';
    return undefined;
  }

  fastify.post('/admin/assignment/run', {
    preHandler: [requireApiKey, requireRunnerAuth],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.runnerTenantId || req.tenant?.id);
    const limit = clampLimit(req.body?.limit);

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const result = await runAssignmentBatch({ tenantId, limit });

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: asText(req.user?.id) || null,
        actor_type: req.auth_mode === 'cron' ? 'system' : 'user',
        action: 'assignment_run',
        entity_type: 'conversation_assignment',
        entity_id: tenantId,
        metadata: {
          limit,
          processed: Number(result?.processed || 0),
          assigned: Number(result?.assigned || 0),
          skipped: Number(result?.skipped || 0),
          auth_mode: req.auth_mode || 'unknown',
        },
      }).catch(() => {});
      return reply.send({
        ok: true,
        tenant_id: tenantId,
        auth_mode: req.auth_mode || 'unknown',
        ...result,
      });
    } catch (error) {
      req.log.error({ err: error }, 'assignment run failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/escalation/run', {
    preHandler: [requireApiKey, requireRunnerAuth],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.runnerTenantId || req.tenant?.id);
    const limit = clampLimit(req.body?.limit);

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const result = await runEscalationBatch({ tenantId, limit });

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: asText(req.user?.id) || null,
        actor_type: req.auth_mode === 'cron' ? 'system' : 'user',
        action: 'escalation_run',
        entity_type: 'conversation_assignment',
        entity_id: tenantId,
        metadata: {
          limit,
          processed: Number(result?.processed || 0),
          breached: Number(result?.breached || 0),
          reassigned: Number(result?.reassigned || 0),
          skipped: Number(result?.skipped || 0),
          auth_mode: req.auth_mode || 'unknown',
        },
      }).catch(() => {});
      return reply.send({
        ok: true,
        tenant_id: tenantId,
        auth_mode: req.auth_mode || 'unknown',
        ...result,
      });
    } catch (error) {
      req.log.error({ err: error }, 'escalation run failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.get('/admin/assignment-rules', {
    preHandler: [requireApiKey, ownerAdminRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = asText(req.query?.tenant_id || req.tenant?.id);
    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    try {
      const { data, error } = await supabaseAdmin
        .from('assignment_rules')
        .select('id,tenant_id,name,is_active,match,action,created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) {
        if (isMissingSchema(error)) {
          return reply.code(500).send({ ok: false, error: 'assignment_rules schema missing; run supabase_assignment.sql first' });
        }
        throw new Error(`assignment rules query failed: ${error.message}`);
      }

      return reply.send({ ok: true, items: data || [] });
    } catch (error) {
      req.log.error({ err: error }, 'assignment rules list failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/assignment-rules', {
    preHandler: [requireApiKey, ownerAdminRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    try {
      const payload = validateRulePayload(req.body || {}, 'create');

      const { data, error } = await supabaseAdmin
        .from('assignment_rules')
        .insert({
          tenant_id: payload.tenant_id,
          name: payload.name,
          is_active: payload.is_active,
          match: payload.match,
          action: payload.action,
        })
        .select('id,tenant_id,name,is_active,match,action,created_at')
        .single();

      if (error) {
        if (isMissingSchema(error)) {
          return reply.code(500).send({ ok: false, error: 'assignment_rules schema missing; run supabase_assignment.sql first' });
        }
        throw new Error(`assignment rule insert failed: ${error.message}`);
      }

      return reply.send({ ok: true, item: data });
    } catch (error) {
      const message = String(error?.message || error);
      const statusCode = message.startsWith('missing_') || message.startsWith('invalid_') ? 400 : 500;
      if (statusCode >= 500) req.log.error({ err: error }, 'assignment rule create failed');
      return reply.code(statusCode).send({ ok: false, error: message });
    }
  });

  fastify.put('/admin/assignment-rules', {
    preHandler: [requireApiKey, ownerAdminRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    try {
      const payload = validateRulePayload(req.body || {}, 'update');
      const patch = {};

      if (payload.name !== undefined) patch.name = payload.name;
      if (payload.is_active !== undefined) patch.is_active = payload.is_active;
      if (payload.match !== undefined) patch.match = payload.match;
      if (payload.action !== undefined) patch.action = payload.action;

      if (!Object.keys(patch).length) {
        return reply.code(400).send({ ok: false, error: 'no_mutable_fields_provided' });
      }

      const { data, error } = await supabaseAdmin
        .from('assignment_rules')
        .update(patch)
        .eq('tenant_id', payload.tenant_id)
        .eq('id', payload.id)
        .select('id,tenant_id,name,is_active,match,action,created_at')
        .maybeSingle();

      if (error) {
        if (isMissingSchema(error)) {
          return reply.code(500).send({ ok: false, error: 'assignment_rules schema missing; run supabase_assignment.sql first' });
        }
        throw new Error(`assignment rule update failed: ${error.message}`);
      }

      if (!data) return reply.code(404).send({ ok: false, error: 'assignment_rule_not_found' });
      return reply.send({ ok: true, item: data });
    } catch (error) {
      const message = String(error?.message || error);
      const statusCode = message.startsWith('missing_') || message.startsWith('invalid_') ? 400 : 500;
      if (statusCode >= 500) req.log.error({ err: error }, 'assignment rule update failed');
      return reply.code(statusCode).send({ ok: false, error: message });
    }
  });
}
