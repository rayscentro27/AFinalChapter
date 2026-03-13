import { ENV } from '../env.js';
import { logSystemError } from '../system/logError.js';
import { startQueueWorker } from '../queue/index.js';

const workerId = `gateway-worker-${process.pid}`;
const logger = console;

const handlers = {
  noop: async (_job, { logger: jobLogger }) => {
    jobLogger.info({ event: 'job_noop_processed' }, 'job_noop_processed');
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
