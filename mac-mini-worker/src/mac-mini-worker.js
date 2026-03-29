import { getEnv, supabaseAdmin } from './lib/supabase.js';
import { createLogger } from './lib/logger.js';
import JobQueueClient from './lib/job-queue-client.js';
import { getHandler, getSupportedJobTypes } from './workers/index.js';

const logger = createLogger('MacMiniWorker');

/**
 * Mac Mini Worker Pool
 * Polls Supabase job queue and executes jobs with configurable concurrency
 */
class MacMiniWorkerPool {
  constructor() {
    const workerId = getEnv('WORKER_ID', `mac-mini-worker-${process.pid}`);
    const poolSize = parseInt(getEnv('WORKER_POOL_SIZE', '2'), 10);

    this.poolSize = Math.max(1, Math.min(poolSize, 8)); // 1-8 concurrent jobs
    this.workerId = workerId;
    this.queueClient = new JobQueueClient(workerId, this.poolSize);

    this.isRunning = false;
    this.pollIntervalMs = parseInt(getEnv('JOB_POLL_INTERVAL_MS', '5000'), 10);
    this.heartbeatIntervalMs = parseInt(getEnv('HEARTBEAT_INTERVAL_MS', '30000'), 10);

    this.jobPollTimer = null;
    this.heartbeatTimer = null;
  }

  /**
   * Start the worker pool
   */
  async start() {
    if (this.isRunning) {
      logger.warn({}, 'Worker already running');
      return;
    }

    this.isRunning = true;

    logger.info({
      worker_id: this.workerId,
      pool_size: this.poolSize,
      supported_job_types: getSupportedJobTypes()
    }, 'Worker starting');

    // Start polling for jobs
    this.startPolling();

    // Start heartbeat
    this.startHeartbeat();

    // Handle graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  /**
   * Stop the worker pool gracefully
   */
  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    clearInterval(this.jobPollTimer);
    clearInterval(this.heartbeatTimer);

    logger.info({ worker_id: this.workerId }, 'Worker stopping');

    // Wait for current jobs to complete (max 30 seconds)
    const maxWaitMs = 30000;
    const startTime = Date.now();

    while (this.queueClient.concurrentCount > 0 && Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (this.queueClient.concurrentCount > 0) {
      logger.warn({
        worker_id: this.workerId,
        pending_jobs: this.queueClient.concurrentCount
      }, 'Shutdown timeout, terminating with pending jobs');
    }

    logger.info({ worker_id: this.workerId }, 'Worker stopped');
    process.exit(0);
  }

  /**
   * Start polling loop
   */
  startPolling() {
    const poll = async () => {
      try {
        // Only claim a job if we have capacity
        if (this.queueClient.concurrentCount < this.poolSize) {
          const job = await this.queueClient.claimNextJob();

          if (job) {
            this.executeJob(job);
          }
        }
      } catch (err) {
        logger.error({ err: err?.message || String(err) }, 'Polling error');
      }
    };

    // Poll immediately, then at intervals
    poll();
    this.jobPollTimer = setInterval(poll, this.pollIntervalMs);
  }

  /**
   * Execute a claimed job
   */
  async executeJob(job) {
    const handler = getHandler(job.job_type);

    if (!handler) {
      logger.warn({
        job_id: job.id,
        job_type: job.job_type
      }, 'No handler for job type');

      await this.queueClient.markFailed(job.id, new Error(`unsupported_job_type: ${job.job_type}`));
      return;
    }

    try {
      // Mark as processing
      await this.queueClient.markProcessing(job);

      // Execute handler
      const result = await handler(job, {
        logger,
        worker_id: this.workerId,
        supabaseAdmin
      });

      // Mark as complete
      await this.queueClient.markComplete(job.id, result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({
        job_id: job.id,
        job_type: job.job_type,
        error: errorMsg
      }, 'Job execution failed');

      await this.queueClient.markFailed(job.id, err, Number(job.max_attempts || 1));
    }
  }

  /**
   * Start heartbeat emission
   */
  startHeartbeat() {
    const emit = async () => {
      const jobIds = Array.from(this.queueClient.currentJobs.keys());
      const currentJobId = jobIds[0] || null;

      await this.queueClient.emitHeartbeat(
        this.queueClient.concurrentCount > 0 ? 'processing' : 'idle',
        currentJobId,
        currentJobId ? this.queueClient.currentJobs.get(currentJobId).job_type : null
      );
    };

    // Emit immediately, then at intervals
    emit();
    this.heartbeatTimer = setInterval(emit, this.heartbeatIntervalMs);
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    const worker = new MacMiniWorkerPool();
    await worker.start();

    logger.info({
      timestamp: new Date().toISOString()
    }, '✅ Worker pool started successfully');
  } catch (err) {
    logger.error({ err: err?.message || String(err) }, '❌ Fatal error starting worker pool');
    process.exit(1);
  }
}

main();
