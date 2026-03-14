const { createClient } = require('@supabase/supabase-js');
const { VIDEO_JOB_TYPES } = require('./config');

function createSupabase(config) {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist')) ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    (msg.includes('schema cache') && msg.includes('table'))
  );
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

async function readRows(query, warningKey) {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) {
      return { rows: [], warnings: [warningKey] };
    }
    throw new Error(`${warningKey}: ${error.message}`);
  }
  return { rows: safeArray(data), warnings: [] };
}

async function fetchContextInputs(supabase, { tenantId, limits }) {
  const warnings = [];

  const transcriptsRes = await readRows(
    supabase
      .from('youtube_transcripts')
      .select('video_id, transcript, created_at, meta')
      .order('created_at', { ascending: false })
      .limit(limits.maxTranscripts),
    'youtube_transcripts_unavailable'
  );
  warnings.push(...transcriptsRes.warnings);

  const claimsRes = await readRows(
    supabase
      .from('research_claims')
      .select('id, claim_text, claim_type, verifiability, risk_notes, created_at')
      .order('created_at', { ascending: false })
      .limit(limits.maxClaims),
    'research_claims_unavailable'
  );
  warnings.push(...claimsRes.warnings);

  const clustersRes = await readRows(
    supabase
      .from('research_clusters')
      .select('id, cluster_name, keywords, summary, score, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limits.maxClusters),
    'research_clusters_unavailable_or_unscoped'
  );
  warnings.push(...clustersRes.warnings);

  const opportunitiesRes = await readRows(
    supabase
      .from('business_opportunities')
      .select('id, title, niche, score, confidence, urgency, summary, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limits.maxOpportunities),
    'business_opportunities_unavailable_or_unscoped'
  );
  warnings.push(...opportunitiesRes.warnings);

  const gapsRes = await readRows(
    supabase
      .from('coverage_gaps')
      .select('id, topic, gap_summary, urgency, confidence_band, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limits.maxGaps),
    'coverage_gaps_unavailable_or_unscoped'
  );
  warnings.push(...gapsRes.warnings);

  return {
    transcripts: transcriptsRes.rows,
    claims: claimsRes.rows,
    clusters: clustersRes.rows,
    opportunities: opportunitiesRes.rows,
    gaps: gapsRes.rows,
    warnings,
  };
}

async function listPendingVideoJobs(supabase, { limit = 5 }) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('job_queue')
    .select('id, tenant_id, job_type, payload, status, available_at, attempt_count, max_attempts, worker_id')
    .in('job_type', VIDEO_JOB_TYPES)
    .in('status', ['pending', 'retry_wait'])
    .lte('available_at', nowIso)
    .order('priority', { ascending: false })
    .order('available_at', { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingSchema(error)) return { rows: [], warnings: ['job_queue_unavailable'] };
    throw new Error(`job_queue_list_failed: ${error.message}`);
  }

  return { rows: safeArray(data), warnings: [] };
}

async function leaseJob(supabase, { jobId, workerId, leaseSeconds }) {
  const nowIso = new Date().toISOString();
  const leaseExpires = new Date(Date.now() + (leaseSeconds * 1000)).toISOString();

  const { data, error } = await supabase
    .from('job_queue')
    .update({
      status: 'leased',
      worker_id: workerId,
      leased_at: nowIso,
      lease_expires_at: leaseExpires,
      updated_at: nowIso,
    })
    .eq('id', jobId)
    .in('status', ['pending', 'retry_wait'])
    .select('id, tenant_id, job_type, payload, status, attempt_count, max_attempts')
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) return { row: null, missing: true };
    throw new Error(`job_queue_lease_failed: ${error.message}`);
  }

  return { row: data || null, missing: false };
}

async function updateJobState(supabase, { jobId, status, fields = {} }) {
  const payload = {
    status,
    updated_at: new Date().toISOString(),
    ...fields,
  };

  const { error } = await supabase
    .from('job_queue')
    .update(payload)
    .eq('id', jobId);

  if (error) {
    if (isMissingSchema(error)) return { ok: false, missing: true };
    throw new Error(`job_queue_update_failed: ${error.message}`);
  }

  return { ok: true, missing: false };
}

async function writeDraftArtifact(supabase, { output, traceId }) {
  const record = {
    source_url: String(output.source_url || `nexus://video-content/${traceId}`),
    title: String(output.title || 'Untitled Content Draft'),
    channel_name: String(output.platform || 'multi-platform'),
    published_at: null,
    summary: String(output.summary || 'Draft content artifact'),
    key_points: safeArray(output.key_points),
    tags: safeArray(output.tags),
    confidence: Number.isFinite(Number(output.confidence)) ? Number(output.confidence) : null,
    trace_id: String(traceId),
  };

  const { data, error } = await supabase
    .from('research_artifacts')
    .insert(record)
    .select('id, trace_id, created_at')
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) return { stored: false, missing: true, id: null };
    throw new Error(`research_artifacts_insert_failed: ${error.message}`);
  }

  return { stored: true, missing: false, id: data?.id || null };
}

module.exports = {
  createSupabase,
  fetchContextInputs,
  listPendingVideoJobs,
  leaseJob,
  updateJobState,
  writeDraftArtifact,
};
