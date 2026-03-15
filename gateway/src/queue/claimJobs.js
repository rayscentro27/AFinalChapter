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

async function leaseSingleJob({ row, workerId, nowIso, leaseExpiresAt }) {
  const { data, error } = await supabaseAdmin
    .from('job_queue')
    .update({
      status: 'leased',
      leased_at: nowIso,
      lease_expires_at: leaseExpiresAt,
      worker_id: workerId,
      updated_at: nowIso,
    })
    .eq('id', row.id)
    .in('status', ['pending', 'retry_wait'])
    .select('id,job_type,tenant_id,payload,status,priority,available_at,attempt_count,max_attempts,dedupe_key,created_at,worker_id,leased_at,lease_expires_at')
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) return { row: null, schemaMissing: true };
    throw new Error(`job_queue lease update failed: ${error.message}`);
  }

  if (!data) return { row: null, schemaMissing: false };
  return { row: data, schemaMissing: false };
}

async function workerPauseState(workerId) {
  const { data, error } = await supabaseAdmin
    .from('worker_controls')
    .select('id,worker_id,worker_type,paused,quarantine_reason,updated_at')
    .eq('worker_id', workerId)
    .eq('paused', true)
    .limit(1);

  if (error) {
    if (isMissingSchema(error)) return { paused: false, schemaMissing: true, row: null };
    throw new Error(`worker_controls lookup failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : null;
  return {
    paused: Boolean(row?.paused),
    schemaMissing: false,
    row: row || null,
  };
}

export async function claimAvailableJobs({
  workerId,
  jobTypes = [],
  leaseSeconds = 90,
  maxJobs = 5,
  logger = console,
} = {}) {
  const wid = asText(workerId);
  if (!wid) throw new Error('missing_worker_id');

  const normalizedTypes = Array.isArray(jobTypes)
    ? jobTypes.map((v) => asText(v)).filter(Boolean)
    : [];

  if (!normalizedTypes.length) {
    return { jobs: [], schemaMissing: false };
  }

  const pauseState = await workerPauseState(wid);
  if (pauseState.paused) {
    logger.warn({
      event: 'worker_claim_blocked_quarantined',
      worker_id: wid,
      reason: pauseState.row?.quarantine_reason || 'paused_by_control_plane',
    }, 'worker_claim_blocked_quarantined');

    return {
      jobs: [],
      schemaMissing: false,
      blocked: true,
      reason: 'worker_paused',
    };
  }

  let query = supabaseAdmin
    .from('job_queue')
    .select('id,job_type,tenant_id,payload,status,priority,available_at,attempt_count,max_attempts,dedupe_key,created_at')
    .in('status', ['pending', 'retry_wait'])
    .lte('available_at', new Date().toISOString())
    .in('job_type', normalizedTypes)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(20, asInt(maxJobs, 5))));

  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { jobs: [], schemaMissing: true };
    throw new Error(`job_queue claim lookup failed: ${error.message}`);
  }

  const jobs = Array.isArray(data) ? data : [];
  if (!jobs.length) return { jobs: [], schemaMissing: false };

  const nowIso = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + (Math.max(15, asInt(leaseSeconds, 90)) * 1000)).toISOString();

  const claimed = [];
  for (const row of jobs) {
    const leased = await leaseSingleJob({
      row,
      workerId: wid,
      nowIso,
      leaseExpiresAt,
    });

    if (leased.schemaMissing) {
      return { jobs: [], schemaMissing: true };
    }

    if (leased.row) {
      claimed.push(leased.row);
      logger.info({
        event: 'job_claimed',
        job_id: leased.row.id,
        job_type: leased.row.job_type,
        worker_id: wid,
        lease_expires_at: leased.row.lease_expires_at,
      }, 'job_claimed');
    }
  }

  return {
    jobs: claimed,
    schemaMissing: false,
  };
}
