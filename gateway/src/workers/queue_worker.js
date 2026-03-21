import { ENV } from '../env.js';
import { logSystemError } from '../system/logError.js';
import { startQueueWorker } from '../queue/index.js';

const workerId = `gateway-worker-${process.pid}`;
const logger = console;

const handlers = {
  noop: async (_job, { logger: jobLogger }) => {
    jobLogger.info({ event: 'job_noop_processed' }, 'job_noop_processed');
  },

  sentiment_triage: async (job, { logger: jobLogger }) => {
    const { supabaseAdmin } = await import('../supabase.js');
    const { enrichMessage } = await import('../lib/ai/enrichMessage.js');
    
    const tenantId = String(job.tenant_id || '');
    const messageId = String(job.payload?.message_id || '');
    
    if (!tenantId || !messageId) {
      throw new Error('missing_tenant_id_or_message_id');
    }

    jobLogger.info({ job_id: job.id, message_id: messageId, tenant_id: tenantId }, 'sentiment_triage_started');

    try {
      // Enrich message with AI sentiment analysis
      const enrichment = await enrichMessage({
        supabaseAdmin,
        tenant_id: tenantId,
        message_id: messageId,
        includeSuggestedReply: true,
      });

      // Update message with enrichment results
      const { error: updateErr } = await supabaseAdmin
        .from('messages')
        .update({
          ai_sentiment: enrichment.sentiment,
          ai_intent: enrichment.intent,
          ai_enrich_status: 'complete',
          ai_enriched_at: new Date().toISOString(),
        })
        .eq('id', messageId)
        .eq('tenant_id', tenantId);

      if (updateErr) {
        jobLogger.error({ err: updateErr, message_id: messageId }, 'Failed to update message enrichment');
        throw updateErr;
      }

      // If critical sentiment, create alert
      if (enrichment.sentiment === 'Agitated' || enrichment.sentiment === 'Critical') {
        const alertSeverity = enrichment.sentiment === 'Critical' ? 'critical' : 'warn';
        const { error: alertErr } = await supabaseAdmin
          .from('alert_events')
          .insert({
            tenant_id: tenantId,
            alert_key: `sentiment_${messageId}`,
            severity: alertSeverity,
            message: `High friction sentiment detected: ${enrichment.summary || enrichment.sentiment}`,
            details: { message_id: messageId, sentiment: enrichment.sentiment, intent: enrichment.intent },
            status: 'open',
          });

        if (alertErr) {
          jobLogger.warn({ err: alertErr }, 'Failed to create sentiment alert (non-fatal)');
        } else {
          jobLogger.info({ severity: alertSeverity, message_id: messageId }, 'Alert created for critical sentiment');
        }
      }

      jobLogger.info({ job_id: job.id, message_id: messageId, sentiment: enrichment.sentiment }, 'sentiment_triage_completed');

      return { ok: true, sentiment: enrichment.sentiment, intent: enrichment.intent };
    } catch (error) {
      jobLogger.error({ job_id: job.id, message_id: messageId, err: error.message || error }, 'sentiment_triage_failed');
      throw error;
    }
  },
};

let runtime = null;

async function reportCrash(type, error) {
  const message = String(error?.message || error || type);
  await logSystemError({
    service: 'nexus-gateway',
    component: 'queue.worker',
    errorType: type,
    errorMessage: message,
    errorStack: String(error?.stack || ''),
    metadata: { worker_id: workerId },
    workerId,
    logger,
  });
}

async function shutdown(signal, exitCode = 0) {
  logger.info({ event: 'queue_worker_shutdown', signal, worker_id: workerId }, 'queue_worker_shutdown');
  if (runtime) runtime.stop();
  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown('SIGINT', 0));
process.on('SIGTERM', () => shutdown('SIGTERM', 0));

process.on('uncaughtException', async (error) => {
  logger.error({ event: 'queue_worker_uncaught_exception', error: String(error?.message || error), worker_id: workerId }, 'queue_worker_uncaught_exception');
  await reportCrash('worker_crash_uncaught_exception', error);
  await shutdown('uncaughtException', 1);
});

process.on('unhandledRejection', async (reason) => {
  logger.error({ event: 'queue_worker_unhandled_rejection', error: String(reason?.message || reason), worker_id: workerId }, 'queue_worker_unhandled_rejection');
  await reportCrash('worker_crash_unhandled_rejection', reason);
  await shutdown('unhandledRejection', 1);
});

if (!ENV.QUEUE_ENABLED) {
  logger.info({ event: 'queue_worker_not_started', reason: 'QUEUE_ENABLED=false', worker_id: workerId }, 'queue_worker_not_started');
  process.exit(0);
}

runtime = startQueueWorker({
  workerId,
  workerType: 'gateway-worker',
  handlers,
  logger,
  pollSeconds: 5,
  leaseSeconds: 90,
});
