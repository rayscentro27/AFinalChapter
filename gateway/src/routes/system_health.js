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

  fastify.get('/api/system/health', {
    preHandler: [requireApiKey],
  }, async (_req, reply) => {
    const now = new Date();
    const nowIso = now.toISOString();
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

    for (const row of cacheRows.rows) {
      aiRequests24h += 1;
      const provider = asText(row.provider) || 'unknown';
      const taskType = asText(row.task_type) || 'unknown';
      provider_counts[provider] = Number(provider_counts[provider] || 0) + 1;
      task_type_counts[taskType] = Number(task_type_counts[taskType] || 0) + 1;
      tokenUsage24h += normalizeTokenUsage(row);
      costEstimate24h += asNumber(row.cost_estimate, 0);
    }

    const aiFailures24h = errorRows.rows.filter(isAiError).length;

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
      ai_cache_hit_rate_24h: cacheHitRate.hit_rate ?? 0,
      token_usage_24h: Math.round(tokenUsage24h),
      cost_estimate_24h_usd: Number(costEstimate24h.toFixed(6)),
      summary: {
        provider_counts,
        task_type_counts,
        analyzed_cache_rows: cacheRows.rows.length,
        analyzed_error_rows: errorRows.rows.length,
      },
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
