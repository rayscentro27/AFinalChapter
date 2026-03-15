const { createClient } = require('@supabase/supabase-js');

function asText(value) {
  return String(value || '').trim();
}

function isMissingSchema(error) {
  const msg = asText(error && error.message).toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function createSupabase(config) {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function listCandidateWorkers(supabase, { workerTypes = [], limit = 100 } = {}) {
  let query = supabase
    .from('worker_heartbeats')
    .select('worker_id,worker_type,status,last_heartbeat_at,last_seen_at,current_job_id,metadata,meta,updated_at')
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  if (Array.isArray(workerTypes) && workerTypes.length > 0) {
    query = query.in('worker_type', workerTypes);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { rows: [], missing: true, error: null };
    return { rows: [], missing: false, error };
  }

  return { rows: Array.isArray(data) ? data : [], missing: false, error: null };
}

async function getWorkerSession(supabase, workerId) {
  const { data, error } = await supabase
    .from('worker_sessions')
    .select('*')
    .eq('worker_id', workerId)
    .limit(1);

  if (error) {
    if (isMissingSchema(error)) return { row: null, missing: true, error: null };
    return { row: null, missing: false, error };
  }

  return {
    row: Array.isArray(data) && data[0] ? data[0] : null,
    missing: false,
    error: null,
  };
}

async function getWorkerPolicy(supabase, workerType) {
  const { data, error } = await supabase
    .from('worker_recovery_policies')
    .select('*')
    .eq('worker_type', workerType)
    .limit(1);

  if (error) {
    if (isMissingSchema(error)) return { row: null, missing: true, error: null };
    return { row: null, missing: false, error };
  }

  return {
    row: Array.isArray(data) && data[0] ? data[0] : null,
    missing: false,
    error: null,
  };
}

async function upsertWorkerSession(supabase, session) {
  const payload = {
    worker_id: session.worker_id,
    worker_type: session.worker_type,
    host_name: session.host_name || null,
    session_state: session.session_state,
    browser_state: session.browser_state,
    process_state: session.process_state,
    last_heartbeat_at: session.last_heartbeat_at || null,
    last_success_at: session.last_success_at || null,
    last_error_at: session.last_error_at || null,
    current_job_id: session.current_job_id || null,
    current_job_started_at: session.current_job_started_at || null,
    consecutive_failures: Number(session.consecutive_failures || 0),
    recovery_attempt_count: Number(session.recovery_attempt_count || 0),
    last_page_signature: session.last_page_signature || null,
    metadata: session.metadata && typeof session.metadata === 'object' ? session.metadata : {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('worker_sessions')
    .upsert(payload, { onConflict: 'worker_id' })
    .select('*')
    .single();

  if (error) {
    if (isMissingSchema(error)) return { row: null, missing: true, error: null };
    return { row: null, missing: false, error };
  }

  return { row: data || null, missing: false, error: null };
}

async function insertSessionEvent(supabase, event) {
  const payload = {
    worker_id: event.worker_id,
    worker_type: event.worker_type || null,
    event_type: event.event_type,
    severity: event.severity || 'info',
    details: event.details && typeof event.details === 'object' ? event.details : {},
    trace_id: event.trace_id || null,
  };

  const { error } = await supabase
    .from('worker_session_events')
    .insert(payload);

  if (error) {
    if (isMissingSchema(error)) return { ok: false, missing: true, error: null };
    return { ok: false, missing: false, error };
  }

  return { ok: true, missing: false, error: null };
}

async function countStaleLeasedJobsForWorker(supabase, { workerId, maxAgeMinutes = 20 }) {
  const cutoffIso = new Date(Date.now() - (Math.max(1, Number(maxAgeMinutes || 20)) * 60 * 1000)).toISOString();
  const { count, error } = await supabase
    .from('job_queue')
    .select('*', { count: 'exact', head: true })
    .eq('worker_id', workerId)
    .in('status', ['leased', 'running'])
    .lt('leased_at', cutoffIso);

  if (error) {
    if (isMissingSchema(error)) return { count: 0, missing: true, error: null };
    return { count: 0, missing: false, error };
  }

  return { count: Number(count || 0), missing: false, error: null };
}

async function upsertWorkerControlQuarantine(supabase, {
  workerId,
  workerType,
  reason,
  actor = 'watchdog_v1',
  metadata = {},
}) {
  const { data: existingRows, error: readError } = await supabase
    .from('worker_controls')
    .select('*')
    .eq('worker_type', workerType)
    .eq('worker_id', workerId)
    .limit(1);

  if (readError) {
    if (isMissingSchema(readError)) return { row: null, missing: true, error: null };
    return { row: null, missing: false, error: readError };
  }

  const nowIso = new Date().toISOString();
  const existing = Array.isArray(existingRows) && existingRows[0] ? existingRows[0] : null;

  if (existing) {
    const nextMeta = {
      ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
      watchdog_quarantine: {
        reason,
        actor,
        at: nowIso,
        ...metadata,
      },
    };

    const { data, error } = await supabase
      .from('worker_controls')
      .update({
        paused: true,
        quarantine_reason: reason,
        updated_by: actor,
        metadata: nextMeta,
        updated_at: nowIso,
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) return { row: null, missing: false, error };
    return { row: data || null, missing: false, error: null };
  }

  const { data, error } = await supabase
    .from('worker_controls')
    .insert({
      worker_type: workerType,
      worker_id: workerId,
      paused: true,
      max_concurrency: 1,
      quarantine_reason: reason,
      updated_by: actor,
      metadata: {
        watchdog_quarantine: {
          reason,
          actor,
          at: nowIso,
          ...metadata,
        },
      },
    })
    .select('*')
    .single();

  if (error) return { row: null, missing: false, error };
  return { row: data || null, missing: false, error: null };
}

module.exports = {
  createSupabase,
  isMissingSchema,
  listCandidateWorkers,
  getWorkerSession,
  getWorkerPolicy,
  upsertWorkerSession,
  insertSessionEvent,
  countStaleLeasedJobsForWorker,
  upsertWorkerControlQuarantine,
};
