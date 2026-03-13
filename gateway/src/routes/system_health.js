import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
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
  let total = rows.length;
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

    const errors = summarizeErrors(checks);

    return reply.send({
      ok: true,
      service: 'nexus-gateway',
      timestamp: nowIso,
      system_mode: ENV.SYSTEM_MODE,
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
      },
      errors: {
        recent_24h: checks.errors24h.count,
      },
      missing_tables,
      warnings: errors,
    });
  });
}
