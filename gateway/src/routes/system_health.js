import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { getAiCacheMetrics } from '../ai/cache.js';
import { requireTenantPermission } from '../lib/auth/requireTenantPermission.js';
import { logAudit } from '../lib/audit/auditLog.js';
import {
  VALID_SYSTEM_MODES,
  getSystemControlState,
  setSystemMode,
  updateSystemFlags,
  safePauseSystem,
  safeResumeSystem,
} from '../system/controlPlaneState.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, asInt(value, min)));
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function toLower(value) {
  return asText(value).toLowerCase();
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

async function safeCount(db, table, apply = null) {
  let query = db.from(table).select('*', { count: 'exact', head: true });
  if (typeof apply === 'function') query = apply(query);

  const { count, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { count: 0, missing: true, error: null };
    return { count: 0, missing: false, error };
  }
  return { count: Number(count || 0), missing: false, error: null };
}

async function safeRows(query) {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { rows: [], missing: true, error: null };
    return { rows: [], missing: false, error };
  }
  return { rows: Array.isArray(data) ? data : [], missing: false, error: null };
}

async function safeOldestPendingJob(db) {
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from('job_queue')
    .select('id,job_type,tenant_id,status,priority,available_at,created_at')
    .in('status', ['pending', 'retry_wait'])
    .lte('available_at', nowIso)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    if (isMissingSchema(error)) return { row: null, missing: true, error: null };
    return { row: null, missing: false, error };
  }

  return { row: data?.[0] || null, missing: false, error: null };
}

async function safeCacheHitRate24h(db, hours = 24, limit = 5000) {
  const boundedHours = clampInt(hours, 1, 720);
  const boundedLimit = clampInt(limit, 100, 10000);
  const sinceIso = new Date(Date.now() - (boundedHours * 60 * 60 * 1000)).toISOString();

  const { data, error } = await db
    .from('ai_cache')
    .select('hit_count,last_hit_at,created_at')
    .gte('created_at', sinceIso)
    .limit(boundedLimit);

  if (error) {
    if (isMissingSchema(error)) return { hit_rate: null, missing: true, error: null };
    return { hit_rate: null, missing: false, error };
  }

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return { hit_rate: 0, missing: false, error: null };

  let hits = 0;
  const total = rows.length;
  for (const row of rows) {
    const hitCount = Number(row?.hit_count || 0);
    if (Number.isFinite(hitCount)) hits += Math.max(0, hitCount);
  }

  const rate = total > 0 ? hits / total : 0;
  return { hit_rate: Number(rate.toFixed(4)), missing: false, error: null };
}

async function safeLatestTimestamp(db, table, column = 'created_at', apply = null) {
  let query = db
    .from(table)
    .select(column)
    .order(column, { ascending: false })
    .limit(1);

  if (typeof apply === 'function') query = apply(query);

  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { value: null, missing: true, error: null };
    return { value: null, missing: false, error };
  }

  const value = asText(data?.[0]?.[column]);
  if (!value) return { value: null, missing: false, error: null };

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { value: null, missing: false, error: null };

  return { value: parsed.toISOString(), missing: false, error: null };
}

function summarizeErrors(checks) {
  const out = [];
  for (const [key, value] of Object.entries(checks)) {
    if (value?.error) {
      out.push(`${key}: ${asText(value.error.message || 'query_error')}`);
    }
  }
  return out;
}

function normalizeErrorRow(row = {}) {
  const source = asText(row.source);
  const sourceParts = source.split(':').filter(Boolean);
  const details = (row.details && typeof row.details === 'object') ? row.details : {};
  const metadata = (row.metadata && typeof row.metadata === 'object') ? row.metadata : details;

  const service = asText(row.service) || asText(sourceParts[0]) || 'unknown_service';
  const component = asText(row.component) || asText(sourceParts[1]) || 'unknown_component';
  const errorType = asText(row.error_type) || asText(row.error_code) || asText(row.severity) || 'error';
  const errorMessage = asText(row.error_message) || asText(row.message) || 'unknown_error';
  const errorStack = asText(row.error_stack) || asText(details.error_stack) || null;

  return {
    id: row.id || null,
    service,
    component,
    error_type: errorType,
    error_message: errorMessage,
    error_stack: errorStack,
    metadata,
    created_at: row.created_at || null,
  };
}

function groupCounts(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = asText(keyFn(item)) || 'unknown';
    out[key] = Number(out[key] || 0) + 1;
  }
  return out;
}

function topEntries(countMap, max = 5) {
  return Object.entries(countMap)
    .map(([key, count]) => ({ key, count: Number(count || 0) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, Math.max(1, max));
}

function isAiError(row = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const details = row.details && typeof row.details === 'object' ? row.details : {};
  const haystack = [
    toLower(row.service),
    toLower(row.component),
    toLower(row.source),
    toLower(row.error_type || row.error_code || row.severity),
    toLower(metadata.job_type || metadata.jobType),
    toLower(metadata.provider),
    toLower(metadata.task_type || metadata.taskType),
    toLower(details.provider),
    toLower(details.task_type || details.taskType),
  ].join(' ');

  return haystack.includes('ai')
    || haystack.includes('gemini')
    || haystack.includes('openrouter')
    || haystack.includes('openai')
    || haystack.includes('nim')
    || haystack.includes('model_router')
    || haystack.includes('ai_gateway');
}

function isTranscriptIngestionFailure(row = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const details = row.details && typeof row.details === 'object' ? row.details : {};
  const haystack = [
    toLower(row.service),
    toLower(row.component),
    toLower(row.source),
    toLower(row.error_type || row.error_code || row.severity),
    toLower(row.error_message || row.message),
    toLower(metadata.job_type || metadata.jobType),
    toLower(metadata.error),
    toLower(details.error),
  ].join(' ');

  return haystack.includes('transcript')
    || haystack.includes('youtube')
    || haystack.includes('no_transcript')
    || haystack.includes('ingest');
}

function isResearchIngestionFailure(row = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const details = row.details && typeof row.details === 'object' ? row.details : {};
  const haystack = [
    toLower(row.service),
    toLower(row.component),
    toLower(row.source),
    toLower(row.error_type || row.error_code || row.severity),
    toLower(row.error_message || row.message),
    toLower(metadata.job_type || metadata.jobType),
    toLower(details.error),
  ].join(' ');

  return haystack.includes('research')
    || haystack.includes('claim')
    || haystack.includes('cluster')
    || haystack.includes('hypothes')
    || haystack.includes('coverage_gap')
    || haystack.includes('coverage gap')
    || haystack.includes('brief')
    || haystack.includes('ingest');
}

function parseTagList(value) {
  if (Array.isArray(value)) return value.map((item) => asText(item)).filter(Boolean);
  const text = asText(value);
  if (!text) return [];
  if (text.includes(',')) return text.split(',').map((item) => asText(item)).filter(Boolean);
  return [text];
}

function rowTenantId(row = {}) {
  const direct = asText(row.tenant_id);
  if (direct) return direct;

  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  const details = row.details && typeof row.details === 'object' ? row.details : {};

  const fromMeta = asText(metadata.tenant_id || metadata.tenantId || meta.tenant_id || meta.tenantId || details.tenant_id || details.tenantId);
  if (fromMeta) return fromMeta;

  const tags = parseTagList(row.tags);
  const taggedTenant = tags.find((tag) => toLower(tag).startsWith('tenant_id:'));
  if (taggedTenant) return asText(taggedTenant.split(':').slice(1).join(':'));

  return '';
}

function filterRowsByTenant(rows, tenantId) {
  if (!tenantId) return Array.isArray(rows) ? rows : [];
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((row) => rowTenantId(row) === tenantId);
}

function createdAtOrNull(row = {}) {
  const candidates = [row.created_at, row.updated_at, row.completed_at, row.last_hit_at, row.last_seen_at, row.last_heartbeat_at];
  for (const value of candidates) {
    const text = asText(value);
    if (!text) continue;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function latestTimestamp(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let latest = null;
  for (const row of list) {
    const ts = createdAtOrNull(row);
    if (!ts) continue;
    if (!latest || ts > latest) latest = ts;
  }
  return latest;
}

function rowLooksLikeOpportunity(row = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  const tags = parseTagList(row.tags);
  const haystack = [
    toLower(row.opportunity_type || row.type),
    toLower(row.title),
    toLower(row.niche),
    toLower(row.description),
    toLower(row.status),
    toLower(metadata.opportunity_type || metadata.type),
    toLower(meta.opportunity_type || meta.type),
    ...tags.map((tag) => toLower(tag)),
  ].join(' ');

  return haystack.includes('opportun')
    || haystack.includes('service_gap')
    || haystack.includes('service gap')
    || haystack.includes('automation_idea')
    || haystack.includes('automation idea')
    || haystack.includes('saas_idea')
    || haystack.includes('grant');
}

function rowLooksLikeVideoJob(row = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  const haystack = [
    toLower(row.job_type),
    toLower(row.worker_type),
    toLower(row.status),
    toLower(metadata.job_type || metadata.jobType),
    toLower(metadata.worker_type || metadata.workerType),
    toLower(meta.job_type || meta.jobType),
  ].join(' ');

  return haystack.includes('video')
    || haystack.includes('shorts')
    || haystack.includes('reel')
    || haystack.includes('tiktok')
    || haystack.includes('thumbnail')
    || haystack.includes('caption')
    || haystack.includes('script');
}

function rowLooksLikeVideoWorker(row = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  const haystack = [
    toLower(row.worker_type),
    toLower(row.worker_id),
    toLower(row.status),
    toLower(metadata.worker_type || metadata.workerType),
    toLower(meta.worker_type || meta.workerType),
  ].join(' ');

  return haystack.includes('video') || haystack.includes('content_worker');
}

function rowLooksLikeVideoArtifact(row = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  const tags = parseTagList(row.tags);

  const haystack = [
    toLower(row.title),
    toLower(row.status),
    toLower(row.artifact_type || row.type),
    toLower(metadata.artifact_type || metadata.type),
    toLower(meta.artifact_type || meta.type),
    ...tags.map((tag) => toLower(tag)),
  ].join(' ');

  return haystack.includes('video')
    || haystack.includes('shorts')
    || haystack.includes('reel')
    || haystack.includes('tiktok')
    || haystack.includes('thumbnail')
    || haystack.includes('caption')
    || haystack.includes('script');
}

function countBy(rows, keyFn) {
  const out = {};
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    const key = asText(keyFn(row)) || 'unknown';
    out[key] = Number(out[key] || 0) + 1;
  }
  return out;
}

function normalizeTokenUsage(row = {}) {
  const usage = row.token_usage && typeof row.token_usage === 'object' ? row.token_usage : {};

  const totalTokens = asNumber(
    usage.total_tokens,
    asNumber(usage.total, asNumber(usage.totalTokens, NaN)),
  );

  if (Number.isFinite(totalTokens)) return totalTokens;

  const inputTokens = asNumber(usage.input_tokens, asNumber(usage.inputTokens, 0));
  const outputTokens = asNumber(usage.output_tokens, asNumber(usage.outputTokens, 0));
  const promptTokens = asNumber(usage.prompt_tokens, 0);
  const completionTokens = asNumber(usage.completion_tokens, 0);

  return inputTokens + outputTokens + promptTokens + completionTokens;
}

export async function systemHealthRoutes(fastify, opts = {}) {
  const deps = opts?.deps || {};
  const db = opts?.supabaseAdmin || deps.supabaseAdmin || supabaseAdmin;
  const aiCacheMetricsFn = opts?.getAiCacheMetrics || deps.getAiCacheMetrics || getAiCacheMetrics;
  const monitoringManageGuard = requireTenantPermission({
    supabaseAdmin,
    permission: 'monitoring.manage',
    mfaMode: 'admin',
  });

  async function recordControlAudit({ req, tenantId, action, previous, current, changed, details = {} }) {
    const result = await logAudit({
      supabaseAdmin,
      tenant_id: tenantId,
      actor_user_id: req.user?.id || null,
      actor_type: 'user',
      action,
      entity_type: 'system_control',
      entity_id: 'global',
      metadata: {
        route: asText(req?.routeOptions?.url || req?.routerPath || req?.raw?.url),
        request_id: req.id,
        mode: current?.system_mode || null,
        changed,
        previous,
        current,
        details,
      },
    });

    if (!result?.ok) {
      const error = new Error('audit_unavailable');
      error.statusCode = 503;
      throw error;
    }
  }

  fastify.get('/api/system/health', {
    preHandler: [requireApiKey],
  }, async (_req, reply) => {
    const now = new Date();
    const nowIso = now.toISOString();
    const controlState = getSystemControlState();
    const staleCutoff = new Date(Date.now() - (Math.max(30, Number(ENV.WORKER_HEARTBEAT_SECONDS || 60)) * 1000)).toISOString();

    const checks = {
      queuePending: await safeCount(db, 'job_queue', (q) => q.in('status', ['pending', 'retry_wait'])),
      queueDeadLetter: await safeCount(db, 'job_queue', (q) => q.eq('status', 'dead_letter')),
      queueRunning: await safeCount(db, 'job_queue', (q) => q.in('status', ['leased', 'running'])),
      workersFresh: await safeCount(db, 'worker_heartbeats', (q) => q.gte('last_seen_at', staleCutoff)),
      workersStale: await safeCount(db, 'worker_heartbeats', (q) => q.lt('last_seen_at', staleCutoff)),
      errors24h: await safeCount(db, 'system_errors', (q) => q.gte('created_at', new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString())),
      oldestPending: await safeOldestPendingJob(db),
      cacheHitRate: await safeCacheHitRate24h(db),
    };

    const missing_tables = [];
    for (const [key, value] of Object.entries(checks)) {
      if (value?.missing) missing_tables.push(key);
    }

    return reply.send({
      ok: true,
      service: 'nexus-gateway',
      timestamp: nowIso,
      version: process.env.npm_package_version || null,
      uptime_seconds: Number(process.uptime().toFixed(3)),
      system_mode: controlState.system_mode,
      queue_enabled: controlState.queue_enabled,
      ai_jobs_enabled: controlState.ai_jobs_enabled,
      research_jobs_enabled: controlState.research_jobs_enabled,
      notifications_enabled: controlState.notifications_enabled,
      safety_flags: {
        queue_enabled: controlState.queue_enabled,
        ai_jobs_enabled: controlState.ai_jobs_enabled,
        research_jobs_enabled: controlState.research_jobs_enabled,
        notifications_enabled: controlState.notifications_enabled,
        job_max_runtime_seconds: controlState.job_max_runtime_seconds,
        worker_max_concurrency: controlState.worker_max_concurrency,
        tenant_job_limit_active: controlState.tenant_job_limit_active,
        safe_mode: ENV.SAFE_MODE,
      },
      queue: {
        depth_pending: checks.queuePending.count,
        depth_running: checks.queueRunning.count,
        dead_letter_count: checks.queueDeadLetter.count,
        oldest_pending_job: checks.oldestPending.row,
      },
      workers: {
        fresh_count: checks.workersFresh.count,
        stale_count: checks.workersStale.count,
        stale_cutoff: staleCutoff,
      },
      ai: {
        cache_hit_rate_24h: checks.cacheHitRate.hit_rate,
        provider: ENV.AI_PROVIDER,
        metrics: aiCacheMetricsFn(),
      },
      errors: {
        recent_24h: checks.errors24h.count,
      },
      missing_tables,
      warnings: summarizeErrors(checks),
    });
  });

  fastify.get('/api/system/workers', {
    preHandler: [requireApiKey],
  }, async (req, reply) => {
    const limit = clampInt(req?.query?.limit, 20, 100);
    const staleSeconds = clampInt(req?.query?.stale_seconds, Math.max(30, Number(ENV.WORKER_HEARTBEAT_SECONDS || 60)), 86400);
    const status = asText(req?.query?.status);
    const staleCutoff = new Date(Date.now() - (staleSeconds * 1000)).toISOString();

    let workersQuery = db
      .from('worker_heartbeats')
      .select('worker_id,worker_type,status,system_mode,current_job_id,last_heartbeat_at,last_seen_at,updated_at,in_flight_jobs,max_concurrency,metadata,meta')
      .order('last_seen_at', { ascending: false })
      .limit(limit);

    if (status) workersQuery = workersQuery.eq('status', status);

    const workers = await safeRows(workersQuery);
    const freshCount = await safeCount(db, 'worker_heartbeats', (q) => {
      let out = q.gte('last_seen_at', staleCutoff);
      if (status) out = out.eq('status', status);
      return out;
    });
    const staleCount = await safeCount(db, 'worker_heartbeats', (q) => {
      let out = q.lt('last_seen_at', staleCutoff);
      if (status) out = out.eq('status', status);
      return out;
    });

    const checks = { workers, freshCount, staleCount };
    const missing_tables = [];
    for (const [key, value] of Object.entries(checks)) {
      if (value?.missing) missing_tables.push(key);
    }

    const freshness = freshCount.count + staleCount.count;
    const freshnessRatio = freshness > 0 ? Number((freshCount.count / freshness).toFixed(4)) : 0;

    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
      filters: {
        status: status || null,
        limit,
        stale_seconds: staleSeconds,
      },
      summary: {
        fresh_count: freshCount.count,
        stale_count: staleCount.count,
        freshness_ratio: freshnessRatio,
        total_returned: workers.rows.length,
      },
      stale_cutoff: staleCutoff,
      workers: workers.rows,
      missing_tables,
      warnings: summarizeErrors(checks),
    });
  });

  fastify.get('/api/system/jobs', {
    preHandler: [requireApiKey],
  }, async (req, reply) => {
    const limit = clampInt(req?.query?.limit, 20, 100);
    const status = asText(req?.query?.status);
    const jobType = asText(req?.query?.job_type);
    const tenantId = asText(req?.query?.tenant_id);
    const statuses = ['pending', 'leased', 'running', 'retry_wait', 'completed', 'failed', 'dead_letter', 'cancelled'];

    const applyJobFilters = (query) => {
      let out = query;
      if (status) out = out.eq('status', status);
      if (jobType) out = out.eq('job_type', jobType);
      if (tenantId) out = out.eq('tenant_id', tenantId);
      return out;
    };

    const jobs = await safeRows(
      applyJobFilters(
        db
          .from('job_queue')
          .select('id,job_type,tenant_id,status,priority,available_at,leased_at,lease_expires_at,attempt_count,max_attempts,worker_id,last_error,created_at,updated_at')
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
    );

    const status_counts = {};
    const statusChecks = {};
    for (const value of statuses) {
      const key = `status_${value}`;
      statusChecks[key] = await safeCount(db, 'job_queue', (q) => {
        let out = q.eq('status', value);
        if (jobType) out = out.eq('job_type', jobType);
        if (tenantId) out = out.eq('tenant_id', tenantId);
        return out;
      });
      status_counts[value] = statusChecks[key].count;
    }

    const oldestPending = await safeOldestPendingJob(db);
    const checks = { jobs, oldestPending, ...statusChecks };
    const missing_tables = [];
    for (const [key, value] of Object.entries(checks)) {
      if (value?.missing) missing_tables.push(key);
    }

    const queueDepthTotal = statuses.reduce((acc, key) => acc + Number(status_counts[key] || 0), 0);

    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
      filters: {
        status: status || null,
        job_type: jobType || null,
        tenant_id: tenantId || null,
        limit,
      },
      summary: {
        total_returned: jobs.rows.length,
        queue_depth_total: queueDepthTotal,
        pending_count: Number(status_counts.pending || 0),
        running_count: Number(status_counts.running || 0) + Number(status_counts.leased || 0),
        dead_letter_count: Number(status_counts.dead_letter || 0),
        status_counts,
        oldest_pending_timestamp: oldestPending.row?.created_at || null,
        oldest_pending_job: oldestPending.row,
      },
      jobs: jobs.rows,
      missing_tables,
      warnings: summarizeErrors(checks),
    });
  });

  fastify.get('/api/system/usage', {
    preHandler: [requireApiKey],
  }, async (req, reply) => {
    const hours = clampInt(req?.query?.hours, 24, 720);
    const limit = clampInt(asInt(req?.query?.limit, 5000), 100, 10000);
    const sinceIso = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();

    const cacheRows = await safeRows(
      db
        .from('ai_cache')
        .select('provider,model,task_type,token_usage,cost_estimate,hit_count,created_at,last_hit_at')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(limit),
    );

    const errorRows = await safeRows(
      db
        .from('system_errors')
        .select('service,component,source,error_type,error_code,severity,metadata,details,created_at')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(limit),
    );

    const cacheHitRate = await safeCacheHitRate24h(db, hours, limit);

    const provider_counts = {};
    const task_type_counts = {};

    let aiRequests24h = 0;
    let tokenUsage24h = 0;
    let costEstimate24h = 0;
    let aiCacheHits24h = 0;

    let openrouterRequests24h = 0;
    let openrouterCacheHits24h = 0;

    for (const row of cacheRows.rows) {
      aiRequests24h += 1;
      const provider = toLower(row.provider) || 'unknown';
      const taskType = asText(row.task_type) || 'unknown';
      const hitCount = Math.max(0, asNumber(row.hit_count, 0));

      provider_counts[provider] = Number(provider_counts[provider] || 0) + 1;
      task_type_counts[taskType] = Number(task_type_counts[taskType] || 0) + 1;

      aiCacheHits24h += hitCount;
      tokenUsage24h += normalizeTokenUsage(row);
      costEstimate24h += asNumber(row.cost_estimate, 0);

      if (provider === 'openrouter') {
        openrouterRequests24h += 1;
        openrouterCacheHits24h += hitCount;
      }
    }

    const aiFailures24h = errorRows.rows.filter(isAiError).length;
    const openrouterCacheHitRate24h = openrouterRequests24h > 0
      ? Number((openrouterCacheHits24h / openrouterRequests24h).toFixed(4))
      : 0;

    const checks = { cacheRows, errorRows, cacheHitRate };
    const missing_tables = [];
    for (const [key, value] of Object.entries(checks)) {
      if (value?.missing) missing_tables.push(key);
    }

    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
      hours,
      ai_requests_24h: aiRequests24h,
      ai_failures_24h: aiFailures24h,
      ai_cache_hits_24h: aiCacheHits24h,
      ai_cache_hit_rate_24h: cacheHitRate.hit_rate ?? 0,
      token_usage_24h: Math.round(tokenUsage24h),
      cost_estimate_24h_usd: Number(costEstimate24h.toFixed(6)),
      summary: {
        provider_counts,
        task_type_counts,
        openrouter_requests_24h: openrouterRequests24h,
        openrouter_cache_hits_24h: openrouterCacheHits24h,
        openrouter_cache_hit_rate_24h: openrouterCacheHitRate24h,
        analyzed_cache_rows: cacheRows.rows.length,
        analyzed_error_rows: errorRows.rows.length,
      },
      runtime_cache_metrics: aiCacheMetricsFn(),
      missing_tables,
      warnings: summarizeErrors(checks),
    });
  });

  fastify.get('/api/system/ingestion', {
    preHandler: [requireApiKey],
  }, async (req, reply) => {
    const hours = clampInt(req?.query?.hours, 24, 720);
    const sinceIso = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();

    const checks = {
      transcripts24h: await safeCount(db, 'youtube_transcripts', (q) => q.gte('created_at', sinceIso)),
      knowledgeDocs24h: await safeCount(db, 'knowledge_docs', (q) => q.gte('created_at', sinceIso)),
      researchArtifacts24h: await safeCount(db, 'research_artifacts', (q) => q.gte('created_at', sinceIso)),
      researchClaims24h: await safeCount(db, 'research_claims', (q) => q.gte('created_at', sinceIso)),
      researchClusters24h: await safeCount(db, 'research_clusters', (q) => q.gte('created_at', sinceIso)),
      researchBriefs24h: await safeCount(db, 'research_briefs', (q) => q.gte('created_at', sinceIso)),
      researchHypotheses24h: await safeCount(db, 'research_hypotheses', (q) => q.gte('created_at', sinceIso)),
      coverageGaps24h: await safeCount(db, 'coverage_gaps', (q) => q.gte('created_at', sinceIso)),
      latestTranscriptAt: await safeLatestTimestamp(db, 'youtube_transcripts'),
      latestKnowledgeDocAt: await safeLatestTimestamp(db, 'knowledge_docs'),
      latestResearchArtifactAt: await safeLatestTimestamp(db, 'research_artifacts'),
      latestResearchClaimAt: await safeLatestTimestamp(db, 'research_claims'),
      latestResearchClusterAt: await safeLatestTimestamp(db, 'research_clusters'),
      latestResearchBriefAt: await safeLatestTimestamp(db, 'research_briefs'),
      latestResearchHypothesisAt: await safeLatestTimestamp(db, 'research_hypotheses'),
      latestCoverageGapAt: await safeLatestTimestamp(db, 'coverage_gaps'),
      recentErrors: await safeRows(
        db
          .from('system_errors')
          .select('service,component,source,error_type,error_code,severity,error_message,message,metadata,details,created_at')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(1000),
      ),
    };

    const errors = checks.recentErrors.rows || [];
    const transcriptFailures = errors.filter(isTranscriptIngestionFailure).length;
    const researchFailures = errors.filter(isResearchIngestionFailure).length;

    const missing_tables = [];
    for (const [key, value] of Object.entries(checks)) {
      if (value?.missing) missing_tables.push(key);
    }

    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
      hours,
      transcripts_ingested_24h: checks.transcripts24h.count,
      knowledge_docs_ingested_24h: checks.knowledgeDocs24h.count,
      research_artifacts_ingested_24h: checks.researchArtifacts24h.count,
      research_claims_ingested_24h: checks.researchClaims24h.count,
      research_clusters_ingested_24h: checks.researchClusters24h.count,
      research_briefs_ingested_24h: checks.researchBriefs24h.count,
      research_hypotheses_ingested_24h: checks.researchHypotheses24h.count,
      coverage_gaps_ingested_24h: checks.coverageGaps24h.count,
      transcript_ingest_failures_24h: transcriptFailures,
      research_ingest_failures_24h: researchFailures,
      latest_transcript_ingested_at: checks.latestTranscriptAt.value,
      latest_knowledge_doc_ingested_at: checks.latestKnowledgeDocAt.value,
      latest_research_artifact_at: checks.latestResearchArtifactAt.value,
      latest_research_claim_at: checks.latestResearchClaimAt.value,
      latest_research_cluster_at: checks.latestResearchClusterAt.value,
      latest_research_brief_at: checks.latestResearchBriefAt.value,
      latest_research_hypothesis_at: checks.latestResearchHypothesisAt.value,
      latest_coverage_gap_at: checks.latestCoverageGapAt.value,
      summary: {
        research_total_ingested_24h:
          checks.researchArtifacts24h.count
          + checks.researchClaims24h.count
          + checks.researchClusters24h.count
          + checks.researchBriefs24h.count
          + checks.researchHypotheses24h.count
          + checks.coverageGaps24h.count,
        total_ingest_failures_24h: transcriptFailures + researchFailures,
        analyzed_error_rows: errors.length,
      },
      missing_tables,
      warnings: summarizeErrors(checks),
    });
  });

  fastify.get('/api/system/opportunities', {
    preHandler: [requireApiKey],
  }, async (req, reply) => {
    const hours = clampInt(req?.query?.hours, 24, 720);
    const tenantId = asText(req?.query?.tenant_id);
    const limit = clampInt(asInt(req?.query?.limit, 2000), 100, 10000);
    const sinceIso = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();

    const checks = {
      businessRows: await safeRows(
        db
          .from('business_opportunities')
          .select('*')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
      grantRows: await safeRows(
        db
          .from('grant_opportunities')
          .select('*')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
      serviceGapRows: await safeRows(
        db
          .from('coverage_gaps')
          .select('*')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
      briefRows: await safeRows(
        db
          .from('research_briefs')
          .select('*')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
      artifactRows: await safeRows(
        db
          .from('research_artifacts')
          .select('*')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
    };

    const businessRows = filterRowsByTenant(checks.businessRows.rows, tenantId);
    const grantRows = filterRowsByTenant(checks.grantRows.rows, tenantId);
    const serviceGapRows = filterRowsByTenant(checks.serviceGapRows.rows, tenantId);
    const briefRows = filterRowsByTenant(checks.briefRows.rows, tenantId);
    const artifactRows = filterRowsByTenant(checks.artifactRows.rows, tenantId);

    const automationIdeas = businessRows.filter((row) => {
      const kind = toLower(row.opportunity_type || row.type || row.niche || row.title);
      return kind.includes('automation');
    }).length;

    const artifactOpportunities = artifactRows.filter(rowLooksLikeOpportunity);

    const typeCounts = countBy(
      [...businessRows, ...grantRows, ...serviceGapRows, ...artifactOpportunities],
      (row) => row.opportunity_type || row.gap_type || row.type || 'unknown',
    );

    const topOpportunities = [...businessRows, ...grantRows]
      .map((row) => ({
        id: row.id || null,
        source_table: grantRows.includes(row) ? 'grant_opportunities' : 'business_opportunities',
        tenant_id: rowTenantId(row) || null,
        title: asText(row.title || row.opportunity_title || row.name) || null,
        opportunity_type: asText(row.opportunity_type || row.type) || null,
        niche: asText(row.niche || row.category) || null,
        score: asNumber(row.score, null),
        confidence: asNumber(row.confidence, null),
        urgency: asNumber(row.urgency, null),
        recommended_owner: asText(row.recommended_owner || row.owner) || null,
        status: asText(row.status) || null,
        created_at: createdAtOrNull(row),
      }))
      .sort((a, b) => {
        const scoreA = Number.isFinite(a.score) ? a.score : -Infinity;
        const scoreB = Number.isFinite(b.score) ? b.score : -Infinity;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return asText(b.created_at).localeCompare(asText(a.created_at));
      })
      .slice(0, 10);

    const latestOpportunityAt = latestTimestamp([
      ...businessRows,
      ...grantRows,
      ...serviceGapRows,
      ...briefRows,
      ...artifactOpportunities,
    ]);

    const checksForWarnings = {
      businessRows: checks.businessRows,
      grantRows: checks.grantRows,
      serviceGapRows: checks.serviceGapRows,
      briefRows: checks.briefRows,
      artifactRows: checks.artifactRows,
    };

    const missing_tables = [];
    for (const [key, value] of Object.entries(checksForWarnings)) {
      if (value?.missing) missing_tables.push(key);
    }

    const totalOpportunities = businessRows.length + grantRows.length + serviceGapRows.length;

    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
      hours,
      tenant_id: tenantId || null,
      business_opportunities_24h: businessRows.length,
      grant_opportunities_24h: grantRows.length,
      service_gaps_24h: serviceGapRows.length,
      opportunity_briefs_24h: briefRows.length,
      automation_ideas_24h: automationIdeas,
      total_opportunities_24h: totalOpportunities,
      summary: {
        type_counts: typeCounts,
        top_opportunities: topOpportunities,
        latest_opportunity_at: latestOpportunityAt,
        analyzed_rows: {
          business_opportunities: checks.businessRows.rows.length,
          grant_opportunities: checks.grantRows.rows.length,
          coverage_gaps: checks.serviceGapRows.rows.length,
          research_briefs: checks.briefRows.rows.length,
          research_artifacts: checks.artifactRows.rows.length,
        },
      },
      missing_tables,
      warnings: summarizeErrors(checksForWarnings),
    });
  });

  fastify.get('/api/system/video-worker', {
    preHandler: [requireApiKey],
  }, async (req, reply) => {
    const hours = clampInt(req?.query?.hours, 24, 720);
    const tenantId = asText(req?.query?.tenant_id);
    const limit = clampInt(asInt(req?.query?.limit, 2000), 100, 10000);
    const sinceIso = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();
    const staleCutoff = new Date(Date.now() - (Math.max(30, Number(ENV.WORKER_HEARTBEAT_SECONDS || 60)) * 1000)).toISOString();

    const checks = {
      jobRows: await safeRows(
        db
          .from('job_queue')
          .select('id,tenant_id,job_type,status,attempt_count,max_attempts,worker_id,created_at,updated_at,completed_at,metadata,meta')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
      workerRows: await safeRows(
        db
          .from('worker_heartbeats')
          .select('worker_id,tenant_id,worker_type,status,last_seen_at,last_heartbeat_at,current_job_id,in_flight_jobs,max_concurrency,updated_at,metadata,meta')
          .order('last_seen_at', { ascending: false })
          .limit(limit),
      ),
      artifactRows: await safeRows(
        db
          .from('research_artifacts')
          .select('*')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
    };

    const scopedJobs = filterRowsByTenant(checks.jobRows.rows, tenantId).filter(rowLooksLikeVideoJob);
    const scopedWorkers = filterRowsByTenant(checks.workerRows.rows, tenantId).filter(rowLooksLikeVideoWorker);
    const scopedArtifacts = filterRowsByTenant(checks.artifactRows.rows, tenantId).filter(rowLooksLikeVideoArtifact);

    const jobStatusCounts = countBy(scopedJobs, (row) => row.status || 'unknown');
    const queueDepthPending = Number(jobStatusCounts.pending || 0) + Number(jobStatusCounts.retry_wait || 0);
    const currentlyRunning = Number(jobStatusCounts.running || 0) + Number(jobStatusCounts.leased || 0);
    const deadLetterCount = Number(jobStatusCounts.dead_letter || 0);
    const failedCount = Number(jobStatusCounts.failed || 0);
    const completedCount = Number(jobStatusCounts.completed || 0);

    let workersFresh = 0;
    let workersStale = 0;
    for (const row of scopedWorkers) {
      const seenAt = asText(row.last_seen_at || row.last_heartbeat_at || row.updated_at);
      if (seenAt && seenAt >= staleCutoff) workersFresh += 1;
      else workersStale += 1;
    }

    const draftsGenerated = scopedArtifacts.filter((row) => toLower(row.status) === 'draft').length;
    const reviewPending = scopedArtifacts.filter((row) => {
      const status = toLower(row.status);
      return status === 'review_pending' || status === 'pending_review';
    }).length;

    const checksForWarnings = {
      jobRows: checks.jobRows,
      workerRows: checks.workerRows,
      artifactRows: checks.artifactRows,
    };

    const missing_tables = [];
    for (const [key, value] of Object.entries(checksForWarnings)) {
      if (value?.missing) missing_tables.push(key);
    }

    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
      hours,
      tenant_id: tenantId || null,
      queue_depth_pending: queueDepthPending,
      currently_running: currentlyRunning,
      dead_letter_count: deadLetterCount,
      video_jobs_processed_24h: scopedJobs.length,
      video_jobs_completed_24h: completedCount,
      video_worker_failures_24h: failedCount + deadLetterCount,
      video_drafts_generated_24h: draftsGenerated,
      video_review_pending: reviewPending,
      workers_known: scopedWorkers.length,
      workers_fresh: workersFresh,
      workers_stale: workersStale,
      latest_video_artifact_at: latestTimestamp(scopedArtifacts),
      summary: {
        job_status_counts: jobStatusCounts,
        analyzed_rows: {
          job_queue: checks.jobRows.rows.length,
          worker_heartbeats: checks.workerRows.rows.length,
          research_artifacts: checks.artifactRows.rows.length,
        },
      },
      missing_tables,
      warnings: summarizeErrors(checksForWarnings),
    });
  });


  fastify.post('/api/system/mode/set', {
    preHandler: [requireApiKey, monitoringManageGuard],
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const mode = asText(req.body?.mode).toLowerCase();

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });
    if (!mode) return reply.code(400).send({ ok: false, error: 'missing_mode' });

    const result = setSystemMode(mode);
    if (!result.ok) {
      return reply.code(400).send({
        ok: false,
        error: result.error || 'invalid_system_mode',
        details: result.details || { valid_modes: Array.from(VALID_SYSTEM_MODES) },
      });
    }

    try {
      await recordControlAudit({
        req,
        tenantId,
        action: 'system_mode_set',
        previous: result.previous,
        current: result.current,
        changed: result.changed,
        details: {
          requested_mode: mode,
          valid_modes: Array.from(VALID_SYSTEM_MODES),
        },
      });
    } catch (error) {
      req.log.error({ err: error }, 'system mode audit failed');
      return reply.code(Number(error?.statusCode) || 500).send({ ok: false, error: String(error?.message || 'audit_failed') });
    }

    return reply.send({
      ok: true,
      action: 'system_mode_set',
      tenant_id: tenantId,
      previous: result.previous,
      current: result.current,
      changed: result.changed,
    });
  });

  fastify.post('/api/system/flags/update', {
    preHandler: [requireApiKey, monitoringManageGuard],
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    const patch = {
      queue_enabled: req.body?.queue_enabled,
      ai_jobs_enabled: req.body?.ai_jobs_enabled,
      research_jobs_enabled: req.body?.research_jobs_enabled,
      notifications_enabled: req.body?.notifications_enabled,
      job_max_runtime_seconds: req.body?.job_max_runtime_seconds,
      worker_max_concurrency: req.body?.worker_max_concurrency,
      tenant_job_limit_active: req.body?.tenant_job_limit_active,
    };

    const result = updateSystemFlags(patch);
    if (!result.ok) {
      return reply.code(400).send({
        ok: false,
        error: result.error || 'invalid_flags_update',
        details: result.details || null,
      });
    }

    try {
      await recordControlAudit({
        req,
        tenantId,
        action: 'system_flags_update',
        previous: result.previous,
        current: result.current,
        changed: result.changed,
        details: {
          requested_patch: patch,
        },
      });
    } catch (error) {
      req.log.error({ err: error }, 'system flags audit failed');
      return reply.code(Number(error?.statusCode) || 500).send({ ok: false, error: String(error?.message || 'audit_failed') });
    }

    return reply.send({
      ok: true,
      action: 'system_flags_update',
      tenant_id: tenantId,
      previous: result.previous,
      current: result.current,
      changed: result.changed,
    });
  });

  fastify.post('/api/system/safe-pause', {
    preHandler: [requireApiKey, monitoringManageGuard],
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const reason = asText(req.body?.reason);
    const disableNotifications = req.body?.disable_notifications;

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    const result = safePauseSystem({
      tenantId,
      disableNotifications,
    });

    try {
      await recordControlAudit({
        req,
        tenantId,
        action: 'system_safe_pause',
        previous: result.previous,
        current: result.current,
        changed: result.changed,
        details: {
          reason: reason || null,
          disable_notifications: disableNotifications === undefined ? null : Boolean(disableNotifications),
          snapshot_key: result.snapshot_key,
        },
      });
    } catch (error) {
      req.log.error({ err: error }, 'system safe pause audit failed');
      return reply.code(Number(error?.statusCode) || 500).send({ ok: false, error: String(error?.message || 'audit_failed') });
    }

    return reply.send({
      ok: true,
      action: 'system_safe_pause',
      tenant_id: tenantId,
      previous: result.previous,
      current: result.current,
      changed: result.changed,
    });
  });

  fastify.post('/api/system/safe-resume', {
    preHandler: [requireApiKey, monitoringManageGuard],
  }, async (req, reply) => {
    const tenantId = asText(req.body?.tenant_id || req.tenant?.id);
    const reason = asText(req.body?.reason);

    if (!tenantId) return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });

    const result = safeResumeSystem({ tenantId });
    if (!result.ok) {
      const statusCode = result.error === 'no_pause_snapshot' ? 409 : 400;
      return reply.code(statusCode).send({
        ok: false,
        error: result.error || 'resume_failed',
        details: result.details || null,
      });
    }

    try {
      await recordControlAudit({
        req,
        tenantId,
        action: 'system_safe_resume',
        previous: result.previous,
        current: result.current,
        changed: result.changed,
        details: {
          reason: reason || null,
          snapshot_key: result.snapshot_key,
        },
      });
    } catch (error) {
      req.log.error({ err: error }, 'system safe resume audit failed');
      return reply.code(Number(error?.statusCode) || 500).send({ ok: false, error: String(error?.message || 'audit_failed') });
    }

    return reply.send({
      ok: true,
      action: 'system_safe_resume',
      tenant_id: tenantId,
      previous: result.previous,
      current: result.current,
      changed: result.changed,
    });
  });


  fastify.get('/api/system/errors', {
    preHandler: [requireApiKey],
  }, async (req, reply) => {
    const limit = clampInt(req?.query?.limit, 50, 200);
    const analysisLimit = clampInt(req?.query?.analysis_limit, Math.max(limit, 100), 500);
    const hours = clampInt(req?.query?.hours, 24, 720);
    const serviceFilter = asText(req?.query?.service).toLowerCase();
    const componentFilter = asText(req?.query?.component).toLowerCase();
    const errorTypeFilter = asText(req?.query?.error_type).toLowerCase();
    const sinceIso = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();

    const rawRows = await safeRows(
      db
        .from('system_errors')
        .select('*')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(analysisLimit),
    );

    const normalized = rawRows.rows.map(normalizeErrorRow);
    const filtered = normalized.filter((row) => {
      if (serviceFilter && asText(row.service).toLowerCase() !== serviceFilter) return false;
      if (componentFilter && asText(row.component).toLowerCase() !== componentFilter) return false;
      if (errorTypeFilter && asText(row.error_type).toLowerCase() !== errorTypeFilter) return false;
      return true;
    });

    const errorTypeCounts = groupCounts(filtered, (row) => row.error_type);
    const jobTypeCounts = groupCounts(
      filtered.filter((row) => asText(row?.metadata?.job_type || row?.metadata?.jobType)),
      (row) => row?.metadata?.job_type || row?.metadata?.jobType,
    );

    const recentTimestamps = filtered
      .map((row) => row.created_at)
      .filter(Boolean)
      .slice(0, 10);

    const checks = { rawRows };
    const missing_tables = [];
    for (const [key, value] of Object.entries(checks)) {
      if (value?.missing) missing_tables.push(key);
    }

    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
      filters: {
        hours,
        service: serviceFilter || null,
        component: componentFilter || null,
        error_type: errorTypeFilter || null,
        limit,
      },
      summary: {
        total_errors: filtered.length,
        returned_errors: Math.min(filtered.length, limit),
        error_counts: errorTypeCounts,
        top_failing_job_types: topEntries(jobTypeCounts, 5).map((row) => ({ job_type: row.key, count: row.count })),
        recent_timestamps: recentTimestamps,
      },
      errors: filtered.slice(0, limit),
      missing_tables,
      warnings: summarizeErrors(checks),
    });
  });
}
