import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { getAiCacheMetrics } from '../ai/cache.js';

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

async function safeCount(table, apply = null) {
  let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
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

async function safeOldestPendingJob() {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
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

async function safeCacheHitRate24h() {
  const sinceIso = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();

  const { data, error } = await supabaseAdmin
    .from('ai_cache')
    .select('hit_count,last_hit_at,created_at')
    .gte('created_at', sinceIso)
    .limit(5000);

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

export async function systemHealthRoutes(fastify) {
  fastify.get('/api/system/health', {
    preHandler: [requireApiKey],
  }, async (_req, reply) => {
    const now = new Date();
    const nowIso = now.toISOString();
    const staleCutoff = new Date(Date.now() - (Math.max(30, Number(ENV.WORKER_HEARTBEAT_SECONDS || 60)) * 1000)).toISOString();

    const checks = {
      queuePending: await safeCount('job_queue', (q) => q.in('status', ['pending', 'retry_wait'])),
      queueDeadLetter: await safeCount('job_queue', (q) => q.eq('status', 'dead_letter')),
      queueRunning: await safeCount('job_queue', (q) => q.in('status', ['leased', 'running'])),
      workersFresh: await safeCount('worker_heartbeats', (q) => q.gte('last_seen_at', staleCutoff)),
      workersStale: await safeCount('worker_heartbeats', (q) => q.lt('last_seen_at', staleCutoff)),
      errors24h: await safeCount('system_errors', (q) => q.gte('created_at', new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString())),
      oldestPending: await safeOldestPendingJob(),
      cacheHitRate: await safeCacheHitRate24h(),
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
      system_mode: ENV.SYSTEM_MODE,
      queue_enabled: ENV.QUEUE_ENABLED,
      ai_jobs_enabled: ENV.AI_JOBS_ENABLED,
      research_jobs_enabled: ENV.RESEARCH_JOBS_ENABLED,
      notifications_enabled: ENV.NOTIFICATIONS_ENABLED,
      safety_flags: {
        queue_enabled: ENV.QUEUE_ENABLED,
        ai_jobs_enabled: ENV.AI_JOBS_ENABLED,
        research_jobs_enabled: ENV.RESEARCH_JOBS_ENABLED,
        notifications_enabled: ENV.NOTIFICATIONS_ENABLED,
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
        metrics: getAiCacheMetrics(),
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

    let workersQuery = supabaseAdmin
      .from('worker_heartbeats')
      .select('worker_id,worker_type,status,system_mode,current_job_id,last_heartbeat_at,last_seen_at,updated_at,in_flight_jobs,max_concurrency,metadata,meta')
      .order('last_seen_at', { ascending: false })
      .limit(limit);

    if (status) workersQuery = workersQuery.eq('status', status);

    const workers = await safeRows(workersQuery);
    const freshCount = await safeCount('worker_heartbeats', (q) => {
      let out = q.gte('last_seen_at', staleCutoff);
      if (status) out = out.eq('status', status);
      return out;
    });
    const staleCount = await safeCount('worker_heartbeats', (q) => {
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
        supabaseAdmin
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
      statusChecks[key] = await safeCount('job_queue', (q) => {
        let out = q.eq('status', value);
        if (jobType) out = out.eq('job_type', jobType);
        if (tenantId) out = out.eq('tenant_id', tenantId);
        return out;
      });
      status_counts[value] = statusChecks[key].count;
    }

    const oldestPending = await safeOldestPendingJob();
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
      supabaseAdmin
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
