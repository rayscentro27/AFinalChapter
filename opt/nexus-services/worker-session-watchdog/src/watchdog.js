const { randomUUID } = require('crypto');
const {
  listCandidateWorkers,
  getWorkerSession,
  getWorkerPolicy,
  upsertWorkerSession,
  insertSessionEvent,
  countStaleLeasedJobsForWorker,
  upsertWorkerControlQuarantine,
} = require('./db');
const { buildProbeContext, asText } = require('./probes');
const { evaluateTransition } = require('./stateMachine');

function nowIso() {
  return new Date().toISOString();
}

function workerTypeFrom(row = {}) {
  return asText(row.worker_type || row.metadata?.worker_type || row.meta?.worker_type || 'unknown_worker');
}

function inferSessionTimes({ heartbeatRow, existingSession, probe }) {
  return {
    lastHeartbeatAt: probe.lastHeartbeatAt || asText(existingSession?.last_heartbeat_at) || nowIso(),
    lastSuccessAt: probe.lastSuccessAt || asText(existingSession?.last_success_at) || null,
    currentJobStartedAt: probe.currentJobStartedAt || asText(existingSession?.current_job_started_at) || null,
    currentJobId: asText(heartbeatRow.current_job_id || existingSession?.current_job_id || ''),
  };
}

function nextFailureCount(previous = 0, nextState = 'healthy') {
  if (nextState === 'healthy') return 0;
  return Math.max(0, Number(previous || 0)) + 1;
}

function nextRecoveryAttempts(previous = 0, nextState = 'healthy') {
  if (nextState === 'healthy') return Math.max(0, Number(previous || 0));
  return Math.max(0, Number(previous || 0));
}

function shouldEmitQueueRiskEvent({ staleLeaseCount, previousStaleLeaseCount }) {
  return Number(staleLeaseCount || 0) > 0 && Number(previousStaleLeaseCount || 0) === 0;
}

async function evaluateWorker({ supabase, heartbeatRow, config, traceId }) {
  const workerId = asText(heartbeatRow.worker_id);
  const workerType = workerTypeFrom(heartbeatRow);

  const [existingSessionRes, policyRes, staleLeaseRes] = await Promise.all([
    getWorkerSession(supabase, workerId),
    getWorkerPolicy(supabase, workerType),
    countStaleLeasedJobsForWorker(supabase, { workerId, maxAgeMinutes: config.maxJobMinutes }),
  ]);

  const existingSession = existingSessionRes.row || null;
  const policy = policyRes.row || null;
  const staleLeaseCount = staleLeaseRes.count || 0;

  const probe = buildProbeContext({
    heartbeatRow,
    existingSession,
    staleLeaseCount,
    config,
  });

  const transition = evaluateTransition({
    previousState: existingSession?.session_state || 'healthy',
    probe,
    quarantineEnabled: Boolean(policy?.quarantine_enabled ?? config.quarantineEnabled),
  });

  const inferred = inferSessionTimes({ heartbeatRow, existingSession, probe });
  const previousFailureCount = Number(existingSession?.consecutive_failures || 0);
  const nextSession = {
    worker_id: workerId,
    worker_type: workerType,
    host_name: config.hostName,
    session_state: transition.nextState,
    browser_state: probe.browserRunning ? 'running' : 'down',
    process_state: probe.processRunning ? 'running' : 'down',
    last_heartbeat_at: inferred.lastHeartbeatAt,
    last_success_at: inferred.lastSuccessAt,
    last_error_at: transition.nextState === 'healthy' ? null : nowIso(),
    current_job_id: inferred.currentJobId || null,
    current_job_started_at: inferred.currentJobStartedAt,
    consecutive_failures: nextFailureCount(previousFailureCount, transition.nextState),
    recovery_attempt_count: nextRecoveryAttempts(existingSession?.recovery_attempt_count, transition.nextState),
    last_page_signature: probe.lastPageSignature || null,
    metadata: {
      ...(existingSession?.metadata && typeof existingSession.metadata === 'object' ? existingSession.metadata : {}),
      probe: {
        session_state_probe: probe.sessionStateProbe,
        heartbeat_age_seconds: probe.heartbeatAgeSeconds,
        success_age_seconds: probe.successAgeSeconds,
        job_age_seconds: probe.jobAgeSeconds,
        fake_healthy: probe.fakeHealthy,
        lease_risk: probe.leaseRisk,
        stale_lease_count: probe.staleLeaseCount,
        page_signature_repeat_count: probe.pageSignatureRepeatCount,
        in_flight_jobs: probe.inFlightJobs,
      },
      watchdog: {
        last_trace_id: traceId,
        last_evaluated_at: nowIso(),
        previous_state: transition.previousState,
        reasons: transition.reasons,
      },
    },
  };

  const sessionWrite = await upsertWorkerSession(supabase, nextSession);

  const eventDetails = {
    previous_state: transition.previousState,
    next_state: transition.nextState,
    reasons: transition.reasons,
    probe: {
      session_state_probe: probe.sessionStateProbe,
      heartbeat_age_seconds: probe.heartbeatAgeSeconds,
      success_age_seconds: probe.successAgeSeconds,
      job_age_seconds: probe.jobAgeSeconds,
      stale_lease_count: probe.staleLeaseCount,
      page_signature_repeat_count: probe.pageSignatureRepeatCount,
    },
  };

  if (transition.changed || transition.severity !== 'info') {
    await insertSessionEvent(supabase, {
      worker_id: workerId,
      worker_type: workerType,
      event_type: transition.eventType,
      severity: transition.severity,
      details: eventDetails,
      trace_id: traceId,
    });
  }

  const previousStaleLeaseCount = Number(existingSession?.metadata?.probe?.stale_lease_count || 0);
  if (shouldEmitQueueRiskEvent({ staleLeaseCount, previousStaleLeaseCount })) {
    await insertSessionEvent(supabase, {
      worker_id: workerId,
      worker_type: workerType,
      event_type: 'queue_stale_lease_risk',
      severity: 'warning',
      details: {
        stale_lease_count: staleLeaseCount,
        max_job_minutes: config.maxJobMinutes,
      },
      trace_id: traceId,
    });
  }

  let quarantineApplied = false;
  if (transition.nextState === 'quarantined') {
    const quarantineReason = `watchdog_quarantine:${transition.reasons.join(',') || 'state_quarantined'}`;
    const quarantine = await upsertWorkerControlQuarantine(supabase, {
      workerId,
      workerType,
      reason: quarantineReason,
      actor: 'watchdog_v1',
      metadata: {
        trace_id: traceId,
      },
    });

    quarantineApplied = Boolean(quarantine.row);
  }

  return {
    ok: true,
    worker_id: workerId,
    worker_type: workerType,
    previous_state: transition.previousState,
    next_state: transition.nextState,
    changed: transition.changed,
    stale_lease_count: staleLeaseCount,
    quarantine_applied: quarantineApplied,
    missing_tables: {
      worker_sessions: sessionWrite.missing,
      worker_session_events: false,
      worker_recovery_policies: policyRes.missing,
      job_queue: staleLeaseRes.missing,
    },
  };
}

async function runWatchdogOnce({ supabase, config, logger = console }) {
  const traceId = `${config.tracePrefix}-${randomUUID()}`;
  const workers = await listCandidateWorkers(supabase, {
    workerTypes: config.workerTypes,
    limit: config.batchLimit,
  });

  if (workers.missing) {
    logger.warn('[watchdog] worker_heartbeats table missing; skipping cycle');
    return {
      ok: false,
      trace_id: traceId,
      skipped: true,
      reason: 'worker_heartbeats_missing',
    };
  }

  if (workers.error) {
    throw new Error(`worker_heartbeats query failed: ${workers.error.message}`);
  }

  const out = {
    ok: true,
    trace_id: traceId,
    watched: workers.rows.length,
    changed: 0,
    quarantined: 0,
    healthy: 0,
    degraded: 0,
    failed: 0,
    details: [],
  };

  for (const row of workers.rows) {
    try {
      const result = await evaluateWorker({
        supabase,
        heartbeatRow: row,
        config,
        traceId,
      });

      out.details.push(result);
      if (result.changed) out.changed += 1;
      if (result.next_state === 'quarantined') out.quarantined += 1;
      if (result.next_state === 'healthy') out.healthy += 1;
      if (result.next_state === 'degraded') out.degraded += 1;
    } catch (error) {
      out.failed += 1;
      out.details.push({
        ok: false,
        worker_id: asText(row.worker_id),
        error: String(error && (error.message || error)),
      });
    }
  }

  logger.info(
    `[watchdog] trace=${traceId} watched=${out.watched} changed=${out.changed} quarantined=${out.quarantined} healthy=${out.healthy} degraded=${out.degraded} failed=${out.failed}`
  );

  return out;
}

module.exports = {
  runWatchdogOnce,
};
