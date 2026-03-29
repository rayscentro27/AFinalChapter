import { supabaseAdmin } from '../supabase.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

export async function sendWorkerHeartbeat({
  workerId,
  workerType = 'gateway-worker',
  status = 'running',
  systemMode = 'development',
  currentJobId = null,
  inFlightJobs = 0,
  maxConcurrency = 1,
  metadata = {},
} = {}) {
  const id = asText(workerId);
  if (!id) throw new Error('missing_worker_id');

  const now = new Date().toISOString();
  const cleanMeta = (metadata && typeof metadata === 'object') ? metadata : {};

  const payload = {
    worker_id: id,
    worker_type: asText(workerType) || 'gateway-worker',
    status: asText(status) || 'running',
    system_mode: asText(systemMode) || 'development',
    current_job_id: currentJobId || null,
    last_heartbeat_at: now,
    metadata: cleanMeta,

    // Compatibility with existing health endpoint and draft schema variants.
    in_flight_jobs: Math.max(0, asInt(inFlightJobs, 0)),
    max_concurrency: Math.max(1, asInt(maxConcurrency, 1)),
    last_seen_at: now,
    updated_at: now,
    meta: cleanMeta,
  };

  const { error } = await supabaseAdmin
    .from('worker_heartbeats')
    .upsert(payload, { onConflict: 'worker_id' });

  if (error) {
    if (isMissingSchema(error)) return { ok: false, schemaMissing: true };
    throw new Error(`worker_heartbeats upsert failed: ${error.message}`);
  }

  return {
    ok: true,
    schemaMissing: false,
    worker_id: id,
    status: payload.status,
    last_heartbeat_at: now,
  };
}
