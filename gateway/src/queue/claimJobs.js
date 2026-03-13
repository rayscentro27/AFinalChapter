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

export async function claimAvailableJobs({
  workerId,
  jobTypes = [],
  leaseSeconds = 90,
  maxJobs = 5,
} = {}) {
  const wid = asText(workerId);
  if (!wid) throw new Error('missing_worker_id');

  let query = supabaseAdmin
    .from('job_queue')
    .select('id,job_type,tenant_id,payload,status,priority,available_at,attempt_count,max_attempts,dedupe_key,created_at')
    .in('status', ['pending', 'retry_wait'])
    .lte('available_at', new Date().toISOString())
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(20, Number(maxJobs || 5))));

  if (Array.isArray(jobTypes) && jobTypes.length > 0) {
    query = query.in('job_type', jobTypes.map((v) => asText(v)).filter(Boolean));
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { jobs: [], schemaMissing: true };
    throw new Error(`job_queue claim lookup failed: ${error.message}`);
  }

  const jobs = Array.isArray(data) ? data : [];
  if (!jobs.length) return { jobs: [], schemaMissing: false };

  const nowIso = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + (Math.max(15, Number(leaseSeconds || 90)) * 1000)).toISOString();

  const ids = jobs.map((row) => row.id);
  const { error: leaseError } = await supabaseAdmin
    .from('job_queue')
    .update({
      status: 'leased',
      leased_at: nowIso,
      lease_expires_at: leaseExpiresAt,
      worker_id: wid,
      updated_at: nowIso,
    })
    .in('id', ids)
    .in('status', ['pending', 'retry_wait']);

  if (leaseError && !isMissingSchema(leaseError)) {
    throw new Error(`job_queue lease update failed: ${leaseError.message}`);
  }

  return {
    jobs: jobs.map((row) => ({ ...row, status: 'leased', worker_id: wid, leased_at: nowIso, lease_expires_at: leaseExpiresAt })),
    schemaMissing: false,
  };
}
