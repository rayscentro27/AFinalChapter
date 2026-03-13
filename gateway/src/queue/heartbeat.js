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

export async function sendWorkerHeartbeat({ workerId, workerType = 'gateway-worker', status = 'running', meta = {} } = {}) {
  const id = asText(workerId);
  if (!id) throw new Error('missing_worker_id');

  const now = new Date().toISOString();
  const payload = {
    worker_id: id,
    worker_type: asText(workerType) || 'gateway-worker',
    status: asText(status) || 'running',
    last_seen_at: now,
    updated_at: now,
    meta,
  };

  const { error } = await supabaseAdmin
    .from('worker_heartbeats')
    .upsert(payload, { onConflict: 'worker_id' });

  if (error) {
    if (isMissingSchema(error)) return { ok: false, schemaMissing: true };
    throw new Error(`worker_heartbeats upsert failed: ${error.message}`);
  }

  return { ok: true, schemaMissing: false, worker_id: id, last_seen_at: now };
}
