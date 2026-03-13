import { ENV } from '../env.js';
import { logSystemError } from '../system/logError.js';
import { claimAvailableJobs } from './claimJobs.js';
import { processJob } from './processJob.js';
import { sendWorkerHeartbeat } from './heartbeat.js';

function asInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, asInt(value, min)));
}

function queueAllowed() {
  return ENV.QUEUE_ENABLED && ENV.SYSTEM_MODE !== 'maintenance';
}

async function heartbeat({ workerId, workerType, status, inFlightJobs, maxConcurrency, logger, metadata = {}, currentJobId = null }) {
  try {
    const res = await sendWorkerHeartbeat({
      workerId,
      workerType,
      status,
      systemMode: ENV.SYSTEM_MODE,
      currentJobId,
      inFlightJobs,
      maxConcurrency,
      metadata,
    });

    if (res.schemaMissing) {
      logger.warn({ event: 'worker_heartbeat_schema_missing', worker_id: workerId }, 'worker_heartbeat_schema_missing');
    }
  } catch (error) {
    const msg = String(error?.message || error);
    logger.error({ event: 'worker_heartbeat_failed', worker_id: workerId, error: msg }, 'worker_heartbeat_failed');
    await logSystemError({
      service: 'nexus-gateway',
      component: 'queue.workerLoop',
      errorType: 'worker_heartbeat_failed',
      errorMessage: msg,
      errorStack: String(error?.stack || ''),
      metadata: { worker_id: workerId },
      workerId,
      logger,
    });
  }
}

export async function runQueueWorkerOnce({
  workerId = `gateway-worker-${process.pid}`,
  workerType = 'gateway-worker',
  handlers = {},
  logger = console,
  leaseSeconds = 90,
  maxConcurrency = ENV.WORKER_MAX_CONCURRENCY,
} = {}) {
  const allowed = queueAllowed();
  const concurrency = clampInt(maxConcurrency, 1, Math.max(1, ENV.WORKER_MAX_CONCURRENCY));
  const jobTypes = Object.keys(handlers || {}).filter(Boolean);

  if (!allowed) {
    await heartbeat({
      workerId,
      workerType,
      status: 'paused',
      inFlightJobs: 0,
      maxConcurrency: concurrency,
      logger,
      metadata: { reason: !ENV.QUEUE_ENABLED ? 'queue_disabled' : 'maintenance_mode' },
    });
    return { ok: true, skipped: true, reason: !ENV.QUEUE_ENABLED ? 'queue_disabled' : 'maintenance_mode' };
  }

  if (!jobTypes.length) {
    await heartbeat({
      workerId,
      workerType,
      status: 'running',
      inFlightJobs: 0,
      maxConcurrency: concurrency,
      logger,
      metadata: { reason: 'no_handlers_registered' },
    });
    return { ok: true, skipped: true, reason: 'no_handlers_registered' };
  }

  const claim = await claimAvailableJobs({
    workerId,
    jobTypes,
    leaseSeconds,
    maxJobs: concurrency,
    logger,
  });

  if (claim.schemaMissing) {
    logger.warn({ event: 'job_queue_schema_missing', worker_id: workerId }, 'job_queue_schema_missing');
    return { ok: true, skipped: true, reason: 'schema_missing' };
  }

  const jobs = claim.jobs || [];
  if (!jobs.length) {
    await heartbeat({
      workerId,
      workerType,
      status: 'running',
      inFlightJobs: 0,
      maxConcurrency: concurrency,
      logger,
      metadata: { reason: 'no_jobs_available' },
    });
    return { ok: true, processed: 0 };
  }

  const results = [];
  for (const job of jobs.slice(0, concurrency)) {
    await heartbeat({
      workerId,
      workerType,
      status: 'running',
      inFlightJobs: 1,
      maxConcurrency: concurrency,
      logger,
      currentJobId: job.id,
      metadata: { current_job_type: job.job_type },
    });

    const result = await processJob(job, handlers, { workerId, logger });
    results.push({ job_id: job.id, job_type: job.job_type, ...result });
  }

  await heartbeat({
    workerId,
    workerType,
    status: 'running',
    inFlightJobs: 0,
    maxConcurrency: concurrency,
    logger,
    metadata: { processed_jobs: results.length },
  });

  return {
    ok: true,
    processed: results.length,
    results,
  };
}

export function startQueueWorker({
  workerId = `gateway-worker-${process.pid}`,
  workerType = 'gateway-worker',
  handlers = {},
  logger = console,
  pollSeconds = 5,
  leaseSeconds = 90,
} = {}) {
  const heartbeatSeconds = clampInt(ENV.WORKER_HEARTBEAT_SECONDS, 10, 15);
  const tickSeconds = clampInt(pollSeconds, 2, 30);
  let stopped = false;
  let running = false;

  logger.info({
    event: 'queue_worker_started',
    worker_id: workerId,
    system_mode: ENV.SYSTEM_MODE,
    queue_enabled: ENV.QUEUE_ENABLED,
    heartbeat_seconds: heartbeatSeconds,
    poll_seconds: tickSeconds,
    max_concurrency: ENV.WORKER_MAX_CONCURRENCY,
  }, 'queue_worker_started');

  const runTick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await runQueueWorkerOnce({
        workerId,
        workerType,
        handlers,
        logger,
        leaseSeconds,
        maxConcurrency: ENV.WORKER_MAX_CONCURRENCY,
      });
    } catch (error) {
      const msg = String(error?.message || error);
      logger.error({ event: 'queue_worker_tick_failed', worker_id: workerId, error: msg }, 'queue_worker_tick_failed');
      await logSystemError({
        service: 'nexus-gateway',
        component: 'queue.workerLoop',
        errorType: 'worker_tick_failed',
        errorMessage: msg,
        errorStack: String(error?.stack || ''),
        metadata: { worker_id: workerId },
        workerId,
        logger,
      });
    } finally {
      running = false;
    }
  };

  const runHeartbeat = async () => {
    if (stopped) return;
    const status = queueAllowed() ? 'running' : 'paused';
    await heartbeat({
      workerId,
      workerType,
      status,
      inFlightJobs: 0,
      maxConcurrency: ENV.WORKER_MAX_CONCURRENCY,
      logger,
      metadata: { source: 'heartbeat_timer' },
    });
  };

  runTick();
  runHeartbeat();

  const tickTimer = setInterval(runTick, tickSeconds * 1000);
  const heartbeatTimer = setInterval(runHeartbeat, heartbeatSeconds * 1000);

  return {
    workerId,
    stop() {
      stopped = true;
      clearInterval(tickTimer);
      clearInterval(heartbeatTimer);
      logger.info({ event: 'queue_worker_stopped', worker_id: workerId }, 'queue_worker_stopped');
    },
  };
}
