import { supabaseAdmin } from './supabase.js';
import { createLogger } from './logger.js';

const logger = createLogger('JobQueueClient');

export class JobQueueClient {
  constructor(workerId, maxConcurrentJobs = 2) {
    this.workerId = workerId;
    this.maxConcurrentJobs = maxConcurrentJobs;
    this.currentJobs = new Map(); // job_id -> { job, startTime }
  }

  get concurrentCount() {
    return this.currentJobs.size;
  }

  /**
   * Claim the next available job from the queue
   * Uses a lease-based system to prevent duplicate processing
   */
  async claimNextJob(jobTypes = null) {
    const leaseExpiresAt = new Date(Date.now() + 60000).toISOString(); // 1 minute lease
    // Add 5 second buffer to account for clock skew between client and server
    const nowIso = new Date(Date.now() +  5000).toISOString();

    logger.debug({ now: nowIso }, 'claiming_with_time_and_buffer');

    // Build query - match production gateway's approach
    let query = supabaseAdmin
      .from('job_queue')
      .select('*')
      .in('status', ['pending', 'retry_wait'])
      .lte('available_at', nowIso)
      .order('created_at', { ascending: true })
      .limit(1);

    if (jobTypes && Array.isArray(jobTypes) && jobTypes.length > 0) {
      query = query.in('job_type', jobTypes);
    }

    const { data, error } = await query;

    logger.debug({ error, data_count: data?.length || 0, data }, 'claim_query_result');

    if (error) {
      logger.error({ err: error }, 'claim_job_query_failed');
      return null;
    }

    if (!data || data.length === 0) {
      logger.warn({}, 'no_jobs_available_to_claim');
      return null; // No jobs available
    }

    const job = data[0];

    // Try to lease this job by updating it atomically
    const { error: updateErr } = await supabaseAdmin
      .from('job_queue')
      .update({
        status: 'leased',
        leased_at: nowIso,
        lease_expires_at: leaseExpiresAt,
        worker_id: this.workerId,
        updated_at: nowIso
      })
      .eq('id', job.id)
      .in('status', ['pending', 'retry_wait']); // Double-check it's still in claimable state

    if (updateErr) {
      logger.debug({ err: updateErr, job_id: job.id }, 'claim_failed_another_worker_got_it');
      return null; // Another worker claimed it first
    }

    logger.info({
      event: 'job_leased',
      job_id: job.id,
      job_type: job.job_type,
      worker_id: this.workerId,
      lease_expires_at: leaseExpiresAt
    }, 'job_leased');

    return job;
  }

  /**
   * Mark a job as processing
   */
  async markProcessing(job) {
    this.currentJobs.set(job.id, {
      job_id: job.id,
      tenant_id: job.tenant_id || null,
      job_type: job.job_type,
      startTime: Date.now()
    });

    try {
      await supabaseAdmin
        .from('job_queue')
        .update({ status: 'running', updated_at: new Date().toISOString() })
        .eq('id', job.id);
    } catch (err) {
      logger.warn({ err, job_id: job.id }, 'failed_to_mark_job_processing');
    }

    logger.info({
      event: 'job_started',
      job_id: job.id,
      job_type: job.job_type,
      worker_id: this.workerId
    }, 'job_started');
  }

  /**
   * Mark a job as successfully completed
   */
  async markComplete(jobId, result = {}) {
    const jobData = this.currentJobs.get(jobId);
    const executionTimeMs = jobData ? Date.now() - jobData.startTime : 0;

    try {
      // Update job_queue to mark as complete
      await supabaseAdmin
        .from('job_queue')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          worker_id: null,
          leased_at: null,
          lease_expires_at: null,
          last_error: null,
        })
        .eq('id', jobId);
    } catch (err) {
      logger.warn({ err, job_id: jobId }, 'failed_to_mark_job_complete');
    }

    try {
      // Insert result record
      await supabaseAdmin
        .from('job_results')
        .insert({
          job_id: jobId,
          tenant_id: jobData?.tenant_id || null,
          job_type: jobData?.job_type || 'unknown',
          status: 'completed',
          result,
          worker_id: this.workerId,
          execution_time_ms: executionTimeMs
        });
    } catch (err) {
      logger.warn({ err, job_id: jobId }, 'failed_to_insert_job_result');
    }

    this.currentJobs.delete(jobId);

    logger.info({
      event: 'job_finished',
      job_id: jobId,
      job_type: jobData?.job_type || 'unknown',
      worker_id: this.workerId,
      execution_time_ms: executionTimeMs
    }, 'job_finished');
  }

  /**
   * Mark a job as failed and schedule retry
   */
  async markFailed(jobId, error, maxAttempts = 5) {
    const jobData = this.currentJobs.get(jobId);
    let attemptCount = 0;

    try {
      const { data: jobRecord } = await supabaseAdmin
        .from('job_queue')
        .select('attempt_count')
        .eq('id', jobId)
        .single();

      attemptCount = jobRecord?.attempt_count || 0;
    } catch (err) {
      logger.warn({ err, job_id: jobId }, 'failed_to_fetch_job_record');
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (attemptCount >= maxAttempts) {
      // Permanently fail
      try {
        await supabaseAdmin
          .from('job_queue')
          .update({
            status: 'failed',
            last_error: errorMessage,
            updated_at: new Date().toISOString(),
            worker_id: null,
            leased_at: null,
            lease_expires_at: null,
            completed_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      } catch (err) {
        logger.warn({ err, job_id: jobId }, 'failed_to_mark_job_failed');
      }

      try {
        await supabaseAdmin
          .from('job_results')
          .insert({
            job_id: jobId,
            tenant_id: jobData?.tenant_id || null,
            job_type: jobData?.job_type || 'unknown',
            status: 'failed',
            error: errorMessage,
            worker_id: this.workerId,
            execution_time_ms: Date.now() - (jobData?.startTime || Date.now())
          });
      } catch (err) {
        logger.warn({ err, job_id: jobId }, 'failed_to_insert_failed_result');
      }

      logger.error({
        event: 'job_failed',
        job_id: jobId,
        job_type: jobData?.job_type || 'unknown',
        worker_id: this.workerId,
        error: errorMessage
      }, 'job_failed_max_attempts');
    } else {
      // Retry with exponential backoff
      const delayMs = Math.pow(2, attemptCount - 1) * 5000; // 5s, 10s, 20s, ...
      const retryAt = new Date(Date.now() + delayMs).toISOString();

      try {
        await supabaseAdmin
          .from('job_queue')
          .update({
            status: 'retry_wait',
            available_at: retryAt,
            last_error: errorMessage,
            updated_at: new Date().toISOString(),
            worker_id: null,
            leased_at: null,
            lease_expires_at: null,
            attempt_count: attemptCount + 1,
          })
          .eq('id', jobId);
      } catch (err) {
        logger.warn({ err, job_id: jobId }, 'failed_to_schedule_retry');
      }

      logger.info({
        event: 'job_retry_scheduled',
        job_id: jobId,
        job_type: jobData?.job_type || 'unknown',
        attempt_count: attemptCount,
        max_attempts: maxAttempts,
        retry_at: retryAt,
        error: errorMessage
      }, 'job_retry_scheduled');
    }

    this.currentJobs.delete(jobId);
  }

  /**
   * Emit heartbeat indicating worker is alive
   */
  async emitHeartbeat(status = 'idle', currentJobId = null, currentJobType = null) {
    const heartbeat = {
      worker_id: this.workerId,
      status,
      current_job_id: currentJobId || null,
      current_job_type: currentJobType || null,
      concurrent_jobs: this.concurrentCount,
      memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      emitted_at: new Date().toISOString()
    };

    try {
      await supabaseAdmin
        .from('worker_heartbeats')
        .insert(heartbeat);
    } catch (err) {
      // Suppress table not exist errors during early development
      if (!String(err?.message || '').includes('relation') && !String(err?.message || '').includes('does not exist')) {
        logger.warn({ err }, 'failed_to_emit_heartbeat');
      }
    }
  }
}

export default JobQueueClient;
