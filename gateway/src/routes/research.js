import { supabaseAdmin } from '../supabase.js';
import { ENV } from '../env.js';
import { requireTenantRole } from '../lib/auth/requireTenantRole.js';
import { logAudit } from '../lib/audit/auditLog.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback = 20) {
  const out = Number(value);
  if (!Number.isFinite(out)) return fallback;
  return Math.trunc(out);
}

function asNumber(value, fallback = 0) {
  const out = Number(value);
  if (!Number.isFinite(out)) return fallback;
  return out;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeLimit(value, fallback = 20, max = 200) {
  return clamp(asInt(value, fallback), 1, max);
}

function normalizeApprovalDecision(value) {
  const text = asText(value).toLowerCase();
  if (text === 'approve' || text === 'approved') return 'approved';
  if (text === 'reject' || text === 'rejected') return 'rejected';
  return null;
}

const STRATEGY_REVIEW_SELECT = 'id,tenant_id,strategy_id,asset_type,symbol,timeframe,trades_total,win_rate,profit_factor,net_pnl,max_drawdown,sharpe,confidence_band,status,decision,approval_status,is_published,published_at,expires_at,expired_at,created_at,updated_at,rank';
const OPTIONS_REVIEW_SELECT = 'id,tenant_id,strategy_id,asset_type,symbol,underlying_symbol,structure_type,trades_total,win_rate,profit_factor,net_pnl,max_drawdown,sharpe,confidence_band,status,decision,approval_status,is_published,published_at,expires_at,expired_at,created_at,updated_at,rank';
const SIGNAL_REVIEW_SELECT = 'id,tenant_id,proposal_key,strategy_id,asset_type,symbol,timeframe,side,confidence,confidence_band,status,decision,approval_status,summary,rationale,source_trace_id,meta,is_published,published_at,expires_at,expired_at,created_at,updated_at';
const STRATEGY_MUTATION_SELECT = 'id,tenant_id,strategy_id,asset_type,symbol,timeframe,approval_status,status,is_published,published_at,expires_at,expired_at,created_at,updated_at,meta';
const OPTIONS_MUTATION_SELECT = 'id,tenant_id,strategy_id,asset_type,symbol,underlying_symbol,structure_type,approval_status,status,is_published,published_at,expires_at,expired_at,created_at,updated_at,meta';
const SIGNAL_MUTATION_SELECT = 'id,tenant_id,proposal_key,strategy_id,asset_type,symbol,timeframe,side,approval_status,status,summary,rationale,is_published,published_at,expires_at,expired_at,created_at,updated_at,meta';

function normalizeNotes(value) {
  return asText(value).slice(0, 500);
}

function isApproved(row) {
  return asText(row?.approval_status).toLowerCase() === 'approved';
}

function isPublished(row) {
  return row?.is_published === true;
}

function isExpired(row) {
  if (toIsoStringOrNull(row?.expired_at)) return true;
  const expiresAt = toIsoStringOrNull(row?.expires_at);
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

function applyPortalLifecycleFilter(query) {
  const now = new Date().toISOString();
  return query
    .eq('approval_status', 'approved')
    .eq('is_published', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`);
}

function summarizeLifecycleRow(recordRef, row) {
  return {
    id: asText(row?.id),
    tenant_id: asText(row?.tenant_id),
    target_type: recordRef.targetType,
    source_table: recordRef.table,
    strategy_id: asText(row?.strategy_id) || null,
    asset_type: asText(row?.asset_type) || null,
    symbol: asText(row?.symbol || row?.underlying_symbol) || null,
    approval_status: asText(row?.approval_status) || null,
    status: asText(row?.status) || null,
    is_published: Boolean(row?.is_published),
    published: Boolean(row?.is_published),
    published_at: toIsoStringOrNull(row?.published_at),
    expires_at: toIsoStringOrNull(row?.expires_at),
    expired_at: toIsoStringOrNull(row?.expired_at),
    expired: isExpired(row),
    updated_at: toIsoStringOrNull(row?.updated_at || row?.created_at),
    created_at: toIsoStringOrNull(row?.created_at),
  };
}

function lifecycleError(statusCode, error, reason, details = {}) {
  return {
    statusCode,
    payload: {
      ok: false,
      error,
      reason,
      details,
    },
  };
}

function getMissingPublishFields(recordRef, row) {
  const missing = [];

  if (!asText(row?.strategy_id)) missing.push('strategy_id');

  if (recordRef.targetType === 'signal') {
    if (!asText(row?.symbol)) missing.push('symbol');
    if (!asText(row?.timeframe)) missing.push('timeframe');
    if (!asText(row?.side)) missing.push('side');
    if (!asText(row?.summary)) missing.push('summary');
    if (!asText(row?.rationale)) missing.push('rationale');
    return missing;
  }

  if (recordRef.table === 'options_strategy_performance') {
    if (!asText(row?.underlying_symbol || row?.symbol)) missing.push('underlying_symbol');
    if (!asText(row?.structure_type)) missing.push('structure_type');
    return missing;
  }

  if (!asText(row?.symbol)) missing.push('symbol');
  if (!asText(row?.timeframe)) missing.push('timeframe');
  return missing;
}

function validateLifecycleAction(recordRef, row, action) {
  if (!isApproved(row)) {
    return lifecycleError(409, 'review_item_not_eligible', 'review_not_approved', {
      target_type: recordRef.targetType,
      approval_status: asText(row?.approval_status) || null,
    });
  }

  if (action === 'publish') {
    if (isExpired(row)) {
      return lifecycleError(409, 'review_item_not_eligible', 'item_expired', {
        target_type: recordRef.targetType,
        expires_at: toIsoStringOrNull(row?.expires_at),
        expired_at: toIsoStringOrNull(row?.expired_at),
      });
    }

    if (isPublished(row)) {
      return lifecycleError(409, 'review_item_not_eligible', 'already_published', {
        target_type: recordRef.targetType,
        published_at: toIsoStringOrNull(row?.published_at),
      });
    }

    const missingFields = getMissingPublishFields(recordRef, row);
    if (missingFields.length > 0) {
      return lifecycleError(422, 'review_item_not_eligible', 'missing_required_fields', {
        target_type: recordRef.targetType,
        missing_fields: missingFields,
      });
    }

    return null;
  }

  if (action === 'unpublish') {
    if (!isPublished(row)) {
      return lifecycleError(409, 'review_item_not_eligible', 'already_unpublished', {
        target_type: recordRef.targetType,
      });
    }

    return null;
  }

  if (action === 'expire') {
    if (isExpired(row)) {
      return lifecycleError(409, 'review_item_not_eligible', 'already_expired', {
        target_type: recordRef.targetType,
        expires_at: toIsoStringOrNull(row?.expires_at),
        expired_at: toIsoStringOrNull(row?.expired_at),
      });
    }

    return null;
  }

  return lifecycleError(400, 'invalid_lifecycle_action', 'unsupported_action', { action });
}

function buildLifecycleUpdate(row, action, notes, actor, now) {
  const meta = row?.meta && typeof row.meta === 'object' ? row.meta : {};
  const next = {
    meta: {
      ...meta,
      last_lifecycle_action: action,
      last_lifecycle_actor: actor || null,
      last_lifecycle_at: now,
      last_lifecycle_note: notes || null,
    },
  };

  if (Object.prototype.hasOwnProperty.call(row || {}, 'updated_at')) {
    next.updated_at = now;
  }

  if (action === 'publish') {
    next.is_published = true;
    next.published_at = toIsoStringOrNull(row?.published_at) || now;
    next.expired_at = null;
    return next;
  }

  if (action === 'unpublish') {
    next.is_published = false;
    return next;
  }

  next.is_published = false;
  next.expires_at = now;
  next.expired_at = now;
  return next;
}

async function maybeLoadRecord(table, select, tenantId, id) {
  const result = await supabaseAdmin
    .from(table)
    .select(select)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();

  if (result.error && !isMissingSchema(result.error)) {
    throw new Error(`${table} lookup failed: ${result.error.message}`);
  }

  return result.data || null;
}

async function loadStrategyLifecycleRecord(tenantId, id) {
  const strategyRow = await maybeLoadRecord('strategy_performance', STRATEGY_MUTATION_SELECT, tenantId, id);
  if (strategyRow) {
    return {
      table: 'strategy_performance',
      select: STRATEGY_MUTATION_SELECT,
      targetType: 'strategy',
      entityType: 'research_strategy',
      row: strategyRow,
    };
  }

  const optionsRow = await maybeLoadRecord('options_strategy_performance', OPTIONS_MUTATION_SELECT, tenantId, id);
  if (optionsRow) {
    return {
      table: 'options_strategy_performance',
      select: OPTIONS_MUTATION_SELECT,
      targetType: 'strategy',
      entityType: 'research_strategy',
      row: optionsRow,
    };
  }

  return null;
}

async function loadSignalLifecycleRecord(tenantId, id) {
  const signalRow = await maybeLoadRecord('reviewed_signal_proposals', SIGNAL_MUTATION_SELECT, tenantId, id);
  if (!signalRow) return null;

  return {
    table: 'reviewed_signal_proposals',
    select: SIGNAL_MUTATION_SELECT,
    targetType: 'signal',
    entityType: 'research_signal',
    row: signalRow,
  };
}

function normalizeTenantId(req) {
  return asText(req.query?.tenant_id || req.params?.tenant_id || '');
}

function getTenantIdFromRequest(req) {
  return asText(req?.body?.tenant_id || req?.query?.tenant_id || req?.params?.tenant_id || req?.tenant?.id || '');
}

async function requireApiKey(req, reply) {
  const internalApiKey = asText(req.headers?.['x-api-key']);
  if (!internalApiKey || internalApiKey !== ENV.INTERNAL_API_KEY) {
    return reply.code(401).send({ ok: false, error: 'unauthorized' });
  }
  return undefined;
}

async function requireTenantScopeForInternalKey(req, reply) {
  const tenantId = normalizeTenantId(req);
  if (!tenantId) {
    return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });
  }

  return undefined;
}

function applyTenantFilter(query, tenantId) {
  if (!tenantId) return query;
  return query.eq('tenant_id', tenantId);
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function isRoleMatch(row, aliases) {
  const role = asText(row?.agent_role).toLowerCase();
  const name = asText(row?.agent_name).toLowerCase();
  return aliases.some((alias) => role === alias || name.includes(alias));
}

function summarizeQueryError(error, fallback) {
  if (!error) return fallback;
  const message = asText(error.message || fallback);
  if (isMissingSchema(error)) return `${fallback}: missing research schema migration`;
  return message;
}

function normalizeRate(value) {
  const raw = asNumber(value, 0);
  if (raw <= 0) return 0;
  if (raw > 1) return raw / 100;
  return raw;
}

function toIsoStringOrNull(value) {
  const text = asText(value);
  if (!text) return null;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function safeCount(table, buildQuery) {
  let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
  if (typeof buildQuery === 'function') query = buildQuery(query);

  const { count, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { count: 0, missing: true, error: null };
    return { count: 0, missing: false, error };
  }

  return { count: Number(count || 0), missing: false, error: null };
}

async function safeLatestTimestamp(table, column = 'created_at', buildQuery) {
  let query = supabaseAdmin
    .from(table)
    .select(column)
    .order(column, { ascending: false })
    .limit(1);

  if (typeof buildQuery === 'function') query = buildQuery(query);

  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { value: null, missing: true, error: null };
    return { value: null, missing: false, error };
  }

  return { value: toIsoStringOrNull(data?.[0]?.[column]), missing: false, error: null };
}

function buildReplayPerformance(rows) {
  const list = Array.isArray(rows) ? rows : [];

  let tradesSimulated = 0;
  let wins = 0;
  let losses = 0;

  let pnlRSum = 0;
  let pnlRSamples = 0;

  let pnlPctSum = 0;
  let pnlPctSamples = 0;

  for (const row of list) {
    const tradesTotal = asInt(row?.trades_total, 0);
    const rowWinRate = normalizeRate(row?.win_rate);

    if (tradesTotal > 0) {
      const rowWins = clamp(Math.round(tradesTotal * rowWinRate), 0, tradesTotal);
      const rowLosses = Math.max(tradesTotal - rowWins, 0);

      tradesSimulated += tradesTotal;
      wins += rowWins;
      losses += rowLosses;
    }

    const pnlR = Number(row?.net_pnl);
    if (Number.isFinite(pnlR)) {
      pnlRSum += pnlR;
      pnlRSamples += 1;
    }

    const pctCandidates = [
      row?.meta?.pnl_pct,
      row?.meta?.avg_pnl_pct,
      row?.meta?.pnlPercent,
    ];

    for (const candidate of pctCandidates) {
      const pct = Number(candidate);
      if (Number.isFinite(pct)) {
        pnlPctSum += pct;
        pnlPctSamples += 1;
        break;
      }
    }
  }

  if (tradesSimulated === 0 && list.length > 0) {
    // Fallback when per-row trade counts were never recorded.
    tradesSimulated = list.length;
    losses = Math.max(tradesSimulated - wins, 0);
  }

  const winRate = tradesSimulated > 0 ? wins / tradesSimulated : 0;
  const avgPnlR = pnlRSamples > 0 ? pnlRSum / pnlRSamples : 0;
  const avgPnlPct = pnlPctSamples > 0 ? pnlPctSum / pnlPctSamples : 0;

  return {
    trades_simulated: tradesSimulated,
    wins,
    losses,
    win_rate: Number(winRate.toFixed(4)),
    avg_pnl_r: Number(avgPnlR.toFixed(4)),
    avg_pnl_pct: Number(avgPnlPct.toFixed(4)),
  };
}

export async function researchRoutes(fastify) {
  fastify.addHook('onRequest', requireApiKey);
  const agentRoleGuard = requireTenantRole({ supabaseAdmin, allowedRoles: ['owner', 'admin', 'agent'] });
  const lifecycleMutationGuard = requireTenantRole({ supabaseAdmin, allowedRoles: ['owner', 'admin'] });

  fastify.get('/api/research/strategy-rankings', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 20);
    const status = asText(req.query?.status);
    const symbol = asText(req.query?.symbol);

    let query = applyPortalLifecycleFilter(applyTenantFilter(
      supabaseAdmin
        .from('v_research_strategy_rankings')
        .select(STRATEGY_REVIEW_SELECT)
        .order('rank', { ascending: true })
        .limit(limit),
      tenantId
    ));

    if (status) query = query.eq('status', status);
    if (symbol) query = query.eq('symbol', symbol);

    const { data, error } = await query;
    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'strategy rankings query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/research/options-rankings', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 20);
    const status = asText(req.query?.status);
    const symbol = asText(req.query?.symbol);

    let query = applyPortalLifecycleFilter(applyTenantFilter(
      supabaseAdmin
        .from('v_research_options_rankings')
        .select(OPTIONS_REVIEW_SELECT)
        .order('rank', { ascending: true })
        .limit(limit),
      tenantId
    ));

    if (status) query = query.eq('status', status);
    if (symbol) query = query.eq('symbol', symbol);

    const { data, error } = await query;
    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'options rankings query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/research/approved-signals', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 20, 100);
    const assetType = asText(req.query?.asset_type);
    const symbol = asText(req.query?.symbol);
    const strategyId = asText(req.query?.strategy_id);

    let query = applyPortalLifecycleFilter(applyTenantFilter(
      supabaseAdmin
        .from('reviewed_signal_proposals')
        .select(SIGNAL_REVIEW_SELECT)
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId
    ));

    if (assetType) query = query.eq('asset_type', assetType);
    if (symbol) query = query.eq('symbol', symbol);
    if (strategyId) query = query.eq('strategy_id', strategyId);

    const { data, error } = await query;
    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'approved signals query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/internal/review/strategies', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 50, 200);
    const approvalStatus = asText(req.query?.approval_status || 'approved');
    const publishState = asText(req.query?.publish_state).toLowerCase();
    const expirationState = asText(req.query?.expiration_state).toLowerCase();

    let query = applyTenantFilter(
      supabaseAdmin
        .from('v_research_strategy_rankings')
        .select(STRATEGY_REVIEW_SELECT)
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId
    );

    if (approvalStatus) query = query.eq('approval_status', approvalStatus);
    if (publishState === 'published') query = query.eq('is_published', true);
    if (publishState === 'unpublished') query = query.eq('is_published', false);
    if (expirationState === 'active') query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
    if (expirationState === 'expired') query = query.not('expires_at', 'is', null).lte('expires_at', new Date().toISOString());

    const { data, error } = await query;
    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'internal strategy review query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/internal/review/options', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 50, 200);
    const approvalStatus = asText(req.query?.approval_status || 'approved');
    const publishState = asText(req.query?.publish_state).toLowerCase();
    const expirationState = asText(req.query?.expiration_state).toLowerCase();

    let query = applyTenantFilter(
      supabaseAdmin
        .from('v_research_options_rankings')
        .select(OPTIONS_REVIEW_SELECT)
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId
    );

    if (approvalStatus) query = query.eq('approval_status', approvalStatus);
    if (publishState === 'published') query = query.eq('is_published', true);
    if (publishState === 'unpublished') query = query.eq('is_published', false);
    if (expirationState === 'active') query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
    if (expirationState === 'expired') query = query.not('expires_at', 'is', null).lte('expires_at', new Date().toISOString());

    const { data, error } = await query;
    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'internal options review query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/internal/review/signals', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 50, 200);
    const approvalStatus = asText(req.query?.approval_status || 'approved');
    const publishState = asText(req.query?.publish_state).toLowerCase();
    const expirationState = asText(req.query?.expiration_state).toLowerCase();

    let query = applyTenantFilter(
      supabaseAdmin
        .from('reviewed_signal_proposals')
        .select(SIGNAL_REVIEW_SELECT)
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId
    );

    if (approvalStatus) query = query.eq('approval_status', approvalStatus);
    if (publishState === 'published') query = query.eq('is_published', true);
    if (publishState === 'unpublished') query = query.eq('is_published', false);
    if (expirationState === 'active') query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
    if (expirationState === 'expired') query = query.not('expires_at', 'is', null).lte('expires_at', new Date().toISOString());

    const { data, error } = await query;
    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'internal signal review query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/research/approval-queue', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 25, 100);
    const status = asText(req.query?.status);

    let query = applyTenantFilter(
      supabaseAdmin
        .from('approval_queue')
        .select('id,tenant_id,proposal_id,strategy_id,symbol,status,decision,approval_status,priority,requested_by,resolved_by,resolved_at,notes,meta,created_at')
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId
    );

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'approval queue query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/research/risk-decisions', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 25, 100);
    const approvalStatus = asText(req.query?.approval_status);

    let query = applyTenantFilter(
      supabaseAdmin
        .from('risk_decisions')
        .select('id,tenant_id,proposal_id,strategy_id,symbol,decision,approval_status,confidence_band,risk_score,risk_notes,reviewer,meta,created_at')
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId
    );

    if (approvalStatus) query = query.eq('approval_status', approvalStatus);

    const { data, error } = await query;
    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'risk decisions query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.post('/admin/research/queue/decide', {
    preHandler: [agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const tenantId = getTenantIdFromRequest(req);
    const queueId = asText(req.body?.queue_id);
    const decision = normalizeApprovalDecision(req.body?.decision);
    const notes = asText(req.body?.notes);

    if (!tenantId || !queueId || !decision) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields' });
    }

    try {
      const queueRes = await supabaseAdmin
        .from('approval_queue')
        .select('id,tenant_id,proposal_id,strategy_id,symbol,status,decision,approval_status,notes')
        .eq('tenant_id', tenantId)
        .eq('id', queueId)
        .maybeSingle();

      if (queueRes.error) throw new Error(`approval queue lookup failed: ${queueRes.error.message}`);
      if (!queueRes.data) return reply.code(404).send({ ok: false, error: 'queue_item_not_found' });

      const queueItem = queueRes.data;
      const currentApproval = asText(queueItem.approval_status).toLowerCase();
      const currentStatus = asText(queueItem.status).toLowerCase();
      if (currentApproval === 'approved' || currentApproval === 'rejected' || currentStatus === 'approved' || currentStatus === 'rejected' || currentStatus === 'resolved') {
        return reply.code(409).send({ ok: false, error: 'queue_item_already_resolved' });
      }

      const actor = asText(req.user?.id) || null;
      const now = new Date().toISOString();

      const queueUpdate = await supabaseAdmin
        .from('approval_queue')
        .update({
          status: decision,
          decision,
          approval_status: decision,
          resolved_by: actor,
          resolved_at: now,
          notes: notes || queueItem.notes || null,
        })
        .eq('tenant_id', tenantId)
        .eq('id', queueId)
        .select('id,tenant_id,proposal_id,strategy_id,symbol,status,decision,approval_status,priority,requested_by,resolved_by,resolved_at,notes,created_at')
        .single();

      if (queueUpdate.error) throw new Error(`approval queue update failed: ${queueUpdate.error.message}`);

      const related = {
        reviewed_signal_proposals: 0,
        options_trade_proposals: 0,
        risk_decisions: 0,
        strategy_performance: 0,
        options_strategy_performance: 0,
        proposal_outcomes: 0,
      };

      if (queueItem.proposal_id) {
        const reviewedRes = await supabaseAdmin
          .from('reviewed_signal_proposals')
          .update({
            decision,
            approval_status: decision,
            status: decision,
            updated_at: now,
          })
          .eq('tenant_id', tenantId)
          .eq('id', queueItem.proposal_id)
          .select('id', { count: 'exact' });
        if (reviewedRes.error && !isMissingSchema(reviewedRes.error)) throw new Error(`reviewed signal proposal update failed: ${reviewedRes.error.message}`);
        related.reviewed_signal_proposals = Number(reviewedRes.count || 0);

        const optionsProposalRes = await supabaseAdmin
          .from('options_trade_proposals')
          .update({
            decision,
            approval_status: decision,
            status: decision,
            updated_at: now,
          })
          .eq('tenant_id', tenantId)
          .eq('id', queueItem.proposal_id)
          .select('id', { count: 'exact' });
        if (optionsProposalRes.error && !isMissingSchema(optionsProposalRes.error)) throw new Error(`options trade proposal update failed: ${optionsProposalRes.error.message}`);
        related.options_trade_proposals = Number(optionsProposalRes.count || 0);

        const outcomesRes = await supabaseAdmin
          .from('proposal_outcomes')
          .update({
            decision,
            approval_status: decision,
            status: decision,
            notes: notes || null,
          })
          .eq('tenant_id', tenantId)
          .eq('proposal_id', queueItem.proposal_id)
          .select('id', { count: 'exact' });
        if (outcomesRes.error && !isMissingSchema(outcomesRes.error)) throw new Error(`proposal outcomes update failed: ${outcomesRes.error.message}`);
        related.proposal_outcomes = Number(outcomesRes.count || 0);

        const riskByProposalRes = await supabaseAdmin
          .from('risk_decisions')
          .update({
            decision,
            approval_status: decision,
            reviewer: actor,
          })
          .eq('tenant_id', tenantId)
          .eq('proposal_id', queueItem.proposal_id)
          .select('id', { count: 'exact' });
        if (riskByProposalRes.error && !isMissingSchema(riskByProposalRes.error)) throw new Error(`risk decisions update failed: ${riskByProposalRes.error.message}`);
        related.risk_decisions += Number(riskByProposalRes.count || 0);
      }

      if (queueItem.strategy_id) {
        const strategyRes = await supabaseAdmin
          .from('strategy_performance')
          .update({
            decision,
            approval_status: decision,
          })
          .eq('tenant_id', tenantId)
          .eq('strategy_id', queueItem.strategy_id)
          .select('id', { count: 'exact' });
        if (strategyRes.error && !isMissingSchema(strategyRes.error)) throw new Error(`strategy performance update failed: ${strategyRes.error.message}`);
        related.strategy_performance = Number(strategyRes.count || 0);

        const optionsStrategyRes = await supabaseAdmin
          .from('options_strategy_performance')
          .update({
            decision,
            approval_status: decision,
          })
          .eq('tenant_id', tenantId)
          .eq('strategy_id', queueItem.strategy_id)
          .select('id', { count: 'exact' });
        if (optionsStrategyRes.error && !isMissingSchema(optionsStrategyRes.error)) throw new Error(`options strategy performance update failed: ${optionsStrategyRes.error.message}`);
        related.options_strategy_performance = Number(optionsStrategyRes.count || 0);

        const riskByStrategyRes = await supabaseAdmin
          .from('risk_decisions')
          .update({
            decision,
            approval_status: decision,
            reviewer: actor,
          })
          .eq('tenant_id', tenantId)
          .eq('strategy_id', queueItem.strategy_id)
          .select('id', { count: 'exact' });
        if (riskByStrategyRes.error && !isMissingSchema(riskByStrategyRes.error)) throw new Error(`risk decisions strategy update failed: ${riskByStrategyRes.error.message}`);
        related.risk_decisions += Number(riskByStrategyRes.count || 0);
      }

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: actor,
        actor_type: 'user',
        action: decision === 'approved' ? 'research_queue_approved' : 'research_queue_rejected',
        entity_type: 'research_approval_queue',
        entity_id: queueId,
        metadata: {
          decision,
          strategy_id: queueItem.strategy_id || null,
          proposal_id: queueItem.proposal_id || null,
          symbol: queueItem.symbol || null,
          notes: notes || null,
          related,
        },
      }).catch(() => {});

      return reply.send({ ok: true, queue: queueUpdate.data, related });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, queue_id: queueId }, 'research queue decision failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });

  async function handleLifecycleMutation(req, reply, targetType, action) {
    const tenantId = getTenantIdFromRequest(req);
    const itemId = asText(req.params?.id);
    const notes = normalizeNotes(req.body?.notes);

    if (!tenantId || !itemId) {
      return reply.code(400).send({ ok: false, error: 'missing_required_fields', reason: 'tenant_id_and_id_required' });
    }

    try {
      const recordRef = targetType === 'signal'
        ? await loadSignalLifecycleRecord(tenantId, itemId)
        : await loadStrategyLifecycleRecord(tenantId, itemId);

      if (!recordRef) {
        return reply.code(404).send({ ok: false, error: 'review_item_not_found', reason: 'id_not_found', details: { id: itemId, target_type: targetType } });
      }

      const validationError = validateLifecycleAction(recordRef, recordRef.row, action);
      if (validationError) {
        return reply.code(validationError.statusCode).send(validationError.payload);
      }

      const actor = asText(req.user?.id) || null;
      const now = new Date().toISOString();
      const before = summarizeLifecycleRow(recordRef, recordRef.row);
      const updates = buildLifecycleUpdate(recordRef.row, action, notes, actor, now);

      const updateRes = await supabaseAdmin
        .from(recordRef.table)
        .update(updates)
        .eq('tenant_id', tenantId)
        .eq('id', itemId)
        .select(recordRef.select)
        .single();

      if (updateRes.error) throw new Error(`${recordRef.table} lifecycle update failed: ${updateRes.error.message}`);

      const after = summarizeLifecycleRow(recordRef, updateRes.data);

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: actor,
        actor_type: 'user',
        action: `research_review_${action}`,
        entity_type: recordRef.entityType,
        entity_id: itemId,
        metadata: {
          target_type: recordRef.targetType,
          source_table: recordRef.table,
          notes: notes || null,
          before,
          after,
        },
      }).catch(() => {});

      return reply.send({ ok: true, action, item: after });
    } catch (error) {
      req.log.error({ err: error, tenant_id: tenantId, item_id: itemId, action, target_type: targetType }, 'research lifecycle mutation failed');
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  }

  fastify.post('/api/internal/review/strategies/:id/publish', {
    preHandler: [lifecycleMutationGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => handleLifecycleMutation(req, reply, 'strategy', 'publish'));

  fastify.post('/api/internal/review/strategies/:id/unpublish', {
    preHandler: [lifecycleMutationGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => handleLifecycleMutation(req, reply, 'strategy', 'unpublish'));

  fastify.post('/api/internal/review/strategies/:id/expire', {
    preHandler: [lifecycleMutationGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => handleLifecycleMutation(req, reply, 'strategy', 'expire'));

  fastify.post('/api/internal/review/signals/:id/publish', {
    preHandler: [lifecycleMutationGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => handleLifecycleMutation(req, reply, 'signal', 'publish'));

  fastify.post('/api/internal/review/signals/:id/unpublish', {
    preHandler: [lifecycleMutationGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => handleLifecycleMutation(req, reply, 'signal', 'unpublish'));

  fastify.post('/api/internal/review/signals/:id/expire', {
    preHandler: [lifecycleMutationGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => handleLifecycleMutation(req, reply, 'signal', 'expire'));

  fastify.get('/api/research/agent-scorecards', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 50);
    const role = asText(req.query?.agent_role);

    let query = applyTenantFilter(
      supabaseAdmin
        .from('agent_scorecards')
        .select('id,tenant_id,agent_name,agent_role,score,decision_accuracy,confidence_calibration_score,throughput,status,decision,confidence_band,snapshot_window,notes,created_at')
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId
    );

    if (role) query = query.eq('agent_role', role);

    const { data, error } = await query;
    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'agent scorecards query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/research/recent-hypotheses', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 25);

    const { data, error } = await applyTenantFilter(
      supabaseAdmin
        .from('research_hypotheses')
        .select('id,tenant_id,hypothesis_key,cluster_id,strategy_id,asset_type,symbol,hypothesis,status,decision,approval_status,confidence_band,notes,created_at')
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId
    );

    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'recent hypotheses query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/research/coverage-gaps', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 25);
    const status = asText(req.query?.status);

    let query = applyTenantFilter(
      supabaseAdmin
        .from('coverage_gaps')
        .select('id,tenant_id,gap_key,strategy_id,asset_type,symbol,status,decision,approval_status,confidence_band,gap_type,priority,notes,created_at')
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId
    );

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'coverage gaps query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/research/recent-replay-results', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 25);

    const { data, error } = await applyTenantFilter(
      supabaseAdmin
        .from('replay_results')
        .select('id,tenant_id,paper_trade_run_id,strategy_id,asset_type,symbol,status,decision,approval_status,confidence_band,trades_total,win_rate,net_pnl,max_drawdown,notes,created_at')
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId
    );

    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'recent replay results query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/research/system-health', async (_req, reply) => {
    const since24h = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();

    const [
      signalsLast24h,
      signalsEnriched,
      aiProposals,
      riskDecisions,
      approvalPending,
      paperTrades,
      researchArtifacts,
      researchClaims,
      strategiesTracked,
      latestNormalizedSignal,
      latestRawSignal,
      latestResearch,
    ] = await Promise.all([
      safeCount('tv_raw_alerts', (q) => q.gte('created_at', since24h)),
      safeCount('tv_normalized_signals'),
      safeCount('reviewed_signal_proposals'),
      safeCount('risk_decisions'),
      safeCount('approval_queue', (q) => q.or('status.eq.queued,approval_status.eq.pending')),
      safeCount('paper_trade_runs'),
      safeCount('research_artifacts'),
      safeCount('research_claims'),
      safeCount('strategy_library'),
      safeLatestTimestamp('tv_normalized_signals'),
      safeLatestTimestamp('tv_raw_alerts'),
      safeLatestTimestamp('research_artifacts'),
    ]);

    const latestSignalAt = latestNormalizedSignal.value || latestRawSignal.value || null;

    return reply.send({
      signals_last_24h: signalsLast24h.count,
      signals_enriched: signalsEnriched.count,
      ai_proposals: aiProposals.count,
      risk_decisions: riskDecisions.count,
      approval_queue_pending: approvalPending.count,
      paper_trades: paperTrades.count,
      research_artifacts: researchArtifacts.count,
      research_claims: researchClaims.count,
      strategies_tracked: strategiesTracked.count,
      latest_signal_at: latestSignalAt,
      latest_research_at: latestResearch.value || null,
    });
  });

  fastify.get('/api/research/replay-performance', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const symbol = asText(req.query?.symbol);
    const strategyId = asText(req.query?.strategy_id);
    const limit = normalizeLimit(req.query?.limit, 200, 500);

    let query = supabaseAdmin
      .from('replay_results')
      .select('id,strategy_id,symbol,trades_total,win_rate,net_pnl,status,decision,meta,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (symbol) query = query.eq('symbol', symbol);
    if (strategyId) query = query.eq('strategy_id', strategyId);

    const { data, error } = await query;
    if (error) {
      if (!isMissingSchema(error)) {
        return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'replay performance query failed') });
      }

      return reply.send({
        trades_simulated: 0,
        wins: 0,
        losses: 0,
        win_rate: 0,
        avg_pnl_r: 0,
        avg_pnl_pct: 0,
        latest_run_at: null,
      });
    }

    const latestRunFallback = await safeLatestTimestamp('paper_trade_runs');
    const latestRunAt = toIsoStringOrNull(data?.[0]?.created_at) || latestRunFallback.value || null;

    return reply.send({
      ...buildReplayPerformance(data || []),
      latest_run_at: latestRunAt,
    });
  });

  fastify.get('/api/research/agent-leaderboard', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const limit = normalizeLimit(req.query?.limit, 20, 100);

    let { data, error } = await supabaseAdmin
      .from('v_research_agent_scorecards_latest')
      .select('agent_name,agent_role,score,decision_accuracy,confidence_calibration_score,throughput,status,decision,confidence_band,created_at')
      .order('score', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error && isMissingSchema(error)) {
      ({ data, error } = await supabaseAdmin
        .from('agent_scorecards')
        .select('agent_name,agent_role,score,decision_accuracy,confidence_calibration_score,throughput,status,decision,confidence_band,created_at')
        .order('score', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(limit));
    }

    if (error) {
      if (isMissingSchema(error)) return reply.send({ ok: true, count: 0, items: [] });
      return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'agent leaderboard query failed') });
    }

    const rows = (data || []).map((row, idx) => ({
      rank: idx + 1,
      agent_name: row.agent_name || null,
      agent_role: row.agent_role || null,
      score: row.score ?? null,
      decision_accuracy: row.decision_accuracy ?? null,
      confidence_calibration_score: row.confidence_calibration_score ?? null,
      throughput: row.throughput ?? null,
      status: row.status || null,
      decision: row.decision || null,
      confidence_band: row.confidence_band || null,
      created_at: row.created_at || null,
    }));

    return reply.send({ ok: true, count: rows.length, items: rows });
  });

  fastify.get('/api/research/debug', async (_req, reply) => {
    const tables = [
      'tv_raw_alerts',
      'tv_normalized_signals',
      'reviewed_signal_proposals',
      'risk_decisions',
      'approval_queue',
      'proposal_outcomes',
      'paper_trade_runs',
      'replay_results',
      'research_artifacts',
      'research_claims',
      'strategy_library',
      'agent_scorecards',
      'research_hypotheses',
      'coverage_gaps',
    ];

    const checks = await Promise.all(
      tables.map(async (table) => {
        const [countRes, latestRes] = await Promise.all([
          safeCount(table),
          safeLatestTimestamp(table),
        ]);

        return {
          table,
          row_count: countRes.count,
          latest_created_at: latestRes.value,
          missing: Boolean(countRes.missing || latestRes.missing),
          error: countRes.error || latestRes.error,
        };
      })
    );

    const counts = {};
    const latest = {};
    const missing_tables = [];
    const warnings = [];

    for (const row of checks) {
      counts[row.table] = row.row_count;
      latest[row.table] = row.latest_created_at;
      if (row.missing) missing_tables.push(row.table);
      if (row.error) warnings.push(`${row.table}: ${asText(row.error.message || 'query_error')}`);
    }

    return reply.send({
      ok: true,
      generated_at: new Date().toISOString(),
      counts,
      latest,
      missing_tables,
      warnings,
    });
  });

  fastify.get('/api/research/summary', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);

    const strategyQ = applyTenantFilter(
      supabaseAdmin
        .from('v_research_strategy_rankings')
        .select('strategy_id,asset_type,symbol,timeframe,trades_total,win_rate,profit_factor,net_pnl,confidence_band,status,rank,created_at')
        .eq('asset_type', 'forex')
        .order('rank', { ascending: true })
        .limit(5),
      tenantId
    );

    const optionsQ = applyTenantFilter(
      supabaseAdmin
        .from('v_research_options_rankings')
        .select('strategy_id,symbol,underlying_symbol,structure_type,trades_total,win_rate,profit_factor,net_pnl,confidence_band,status,rank,created_at')
        .order('rank', { ascending: true })
        .limit(5),
      tenantId
    );

    const scoreQ = applyTenantFilter(
      supabaseAdmin
        .from('v_research_agent_scorecards_latest')
        .select('agent_name,agent_role,score,decision_accuracy,confidence_calibration_score,throughput,status,decision,confidence_band,created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      tenantId
    );

    const hypothesesQ = applyTenantFilter(
      supabaseAdmin
        .from('research_hypotheses')
        .select('id,hypothesis_key,strategy_id,asset_type,symbol,hypothesis,status,decision,confidence_band,created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      tenantId
    );

    const gapsQ = applyTenantFilter(
      supabaseAdmin
        .from('coverage_gaps')
        .select('id,gap_key,strategy_id,asset_type,symbol,status,decision,confidence_band,gap_type,priority,created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      tenantId
    );

    const [strategyRes, optionsRes, scoreRes, hypothesisRes, gapRes] = await Promise.all([
      strategyQ,
      optionsQ,
      scoreQ,
      hypothesesQ,
      gapsQ,
    ]);

    const firstError = strategyRes.error || optionsRes.error || scoreRes.error || hypothesisRes.error || gapRes.error;
    if (firstError) {
      return reply.code(500).send({ ok: false, error: summarizeQueryError(firstError, 'research summary query failed') });
    }

    const scoreRows = scoreRes.data || [];
    const analystAliases = ['analyst', 'research_analyst'];
    const riskAliases = ['risk_office', 'risk_governor', 'risk'];

    const analystRow = scoreRows.find((row) => isRoleMatch(row, analystAliases)) || null;
    const riskRow = scoreRows.find((row) => isRoleMatch(row, riskAliases)) || null;

    return reply.send({
      ok: true,
      top_forex_strategies: strategyRes.data || [],
      top_options_structures: optionsRes.data || [],
      analyst_score: analystRow?.score ?? null,
      risk_office_score: riskRow?.score ?? null,
      latest_hypotheses: hypothesisRes.data || [],
      latest_gaps: gapRes.data || [],
    });
  });
}
