import { supabaseAdmin } from '../supabase.js';
import { nextRetryAt, shouldMoveToDeadLetter } from './retryPolicy.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

async function markCompleted(jobId) {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from('job_queue')
    .update({ status: 'completed', completed_at: now, updated_at: now, last_error: null })
    .eq('id', jobId);
}

async function markRetry(job, errorText) {
  const attempts = Number(job.attempt_count || 0) + 1;
  const deadLetter = shouldMoveToDeadLetter({ attemptCount: attempts, maxAttempts: job.max_attempts });
  const now = new Date().toISOString();

  const patch = deadLetter
    ? {
      status: 'dead_letter',
      attempt_count: attempts,
      updated_at: now,
      last_error: asText(errorText),
    }
    : {
      status: 'retry_wait',
      attempt_count: attempts,
      available_at: nextRetryAt({ attemptCount: attempts }),
      updated_at: now,
      last_error: asText(errorText),
    };

  await supabaseAdmin.from('job_queue').update(patch).eq('id', job.id);
}

export async function processJob(job, handlers = {}) {
  const type = asText(job?.job_type);
  const handler = handlers[type];

  if (!handler) {
    await markRetry(job, `no_handler_registered:${type}`);
    return { ok: false, action: 'retry_wait', reason: 'missing_handler' };
  }

  try {
    await handler(job);
    await markCompleted(job.id);
    return { ok: true, action: 'completed' };
  } catch (error) {
    await markRetry(job, String(error?.message || error));
    return { ok: false, action: 'retry_wait', reason: 'handler_failed' };
  }
}
