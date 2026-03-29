import { supabaseAdmin } from '../supabase.js';
import { logSystemError } from '../system/logError.js';
import { nextRetryAt, shouldMoveToDeadLetter } from './retryPolicy.js';

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

async function patchJob(jobId, patch) {
  const { error } = await supabaseAdmin
    .from('job_queue')
    .update(patch)
    .eq('id', jobId);

  if (error) {
    if (isMissingSchema(error)) return { schemaMissing: true };
    throw new Error(`job_queue update failed: ${error.message}`);
  }

  return { schemaMissing: false };
}

async function markRunning(jobId, workerId) {
  const now = new Date().toISOString();
  return patchJob(jobId, {
    status: 'running',
    worker_id: workerId || null,
    updated_at: now,
  });
}

async function markCompleted(jobId) {
  const now = new Date().toISOString();
  return patchJob(jobId, {
    status: 'completed',
    completed_at: now,
    updated_at: now,
    last_error: null,
    worker_id: null,
    leased_at: null,
    lease_expires_at: null,
  });
}

async function markRetry(job, errorText, { logger = console, workerId = null } = {}) {
  const attempts = Number(job.attempt_count || 0) + 1;
  const deadLetter = shouldMoveToDeadLetter({ attemptCount: attempts, maxAttempts: job.max_attempts });
  const now = new Date().toISOString();

  const patch = deadLetter
    ? {
      status: 'dead_letter',
      attempt_count: attempts,
      updated_at: now,
      last_error: asText(errorText),
      worker_id: null,
      leased_at: null,
      lease_expires_at: null,
    }
    : {
      status: 'retry_wait',
      attempt_count: attempts,
      available_at: nextRetryAt({ attemptCount: attempts }),
      updated_at: now,
      last_error: asText(errorText),
      worker_id: null,
      leased_at: null,
      lease_expires_at: null,
    };

  const result = await patchJob(job.id, patch);

  if (deadLetter) {
    logger.error({
      event: 'job_dead_letter',
      job_id: job.id,
      job_type: job.job_type,
      attempt_count: attempts,
      max_attempts: Number(job.max_attempts || 0),
      error: asText(errorText),
    }, 'job_dead_letter');

    await logSystemError({
      service: 'nexus-gateway',
      component: 'queue.processJob',
      errorType: 'dead_letter_reached',
      errorMessage: asText(errorText),
      metadata: {
        job_id: job.id,
        job_type: job.job_type,
        attempt_count: attempts,
        max_attempts: Number(job.max_attempts || 0),
      },
      workerId,
      tenantId: job.tenant_id || null,
      logger,
    });
  } else {
    logger.warn({
      event: 'job_retry_scheduled',
      job_id: job.id,
      job_type: job.job_type,
      attempt_count: attempts,
      max_attempts: Number(job.max_attempts || 0),
      retry_at: patch.available_at,
      error: asText(errorText),
    }, 'job_retry_scheduled');

    await logSystemError({
      service: 'nexus-gateway',
      component: 'queue.processJob',
      errorType: 'retry_scheduled',
      errorMessage: asText(errorText),
      metadata: {
        job_id: job.id,
        job_type: job.job_type,
        attempt_count: attempts,
        max_attempts: Number(job.max_attempts || 0),
        retry_at: patch.available_at,
      },
      workerId,
      tenantId: job.tenant_id || null,
      logger,
    });
  }

  return {
    ...result,
    deadLetter,
    attempts,
    retryAt: patch.available_at || null,
  };
}

export async function processJob(job, handlers = {}, options = {}) {
  const logger = options.logger || console;
  const workerId = asText(options.workerId || job?.worker_id);
  const type = asText(job?.job_type);
  const handler = handlers[type];

  if (!handler) {
    await markRetry(job, `no_handler_registered:${type}`, { logger, workerId });
    await logSystemError({
      service: 'nexus-gateway',
      component: 'queue.processJob',
      errorType: 'missing_handler',
      errorMessage: `No handler registered for job type: ${type}`,
      metadata: {
        job_id: job.id,
        job_type: type,
      },
      workerId,
      tenantId: job.tenant_id || null,
      logger,
    });
    return { ok: false, action: 'retry_wait', reason: 'missing_handler' };
  }

  await markRunning(job.id, workerId);
  logger.info({ event: 'job_started', job_id: job.id, job_type: type, worker_id: workerId }, 'job_started');

  try {
    await handler(job, { workerId, logger });
    await markCompleted(job.id);
    logger.info({ event: 'job_finished', job_id: job.id, job_type: type, worker_id: workerId }, 'job_finished');
    return { ok: true, action: 'completed' };
  } catch (error) {
    const msg = String(error?.message || error || 'unknown_error');
    await markRetry(job, msg, { logger, workerId });
    logger.error({ event: 'job_failed', job_id: job.id, job_type: type, worker_id: workerId, error: msg }, 'job_failed');

    await logSystemError({
      service: 'nexus-gateway',
      component: 'queue.processJob',
      errorType: 'job_failed',
      errorMessage: msg,
      errorStack: asText(error?.stack),
      metadata: {
        job_id: job.id,
        job_type: type,
      },
      workerId,
      tenantId: job.tenant_id || null,
      logger,
    });

    return { ok: false, action: 'retry_wait', reason: 'handler_failed' };
  }
}
