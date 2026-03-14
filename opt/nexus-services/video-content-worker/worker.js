#!/usr/bin/env node

const { randomUUID } = require('crypto');
const { config } = require('./config');
const {
  createSupabase,
  fetchContextInputs,
  listPendingVideoJobs,
  leaseJob,
  updateJobState,
  writeDraftArtifact,
} = require('./db');
const { detectTopics } = require('./detector');
const { generateContentPack } = require('./generator');
const { normalizePayload, toArtifactInput } = require('./formatter');
const { buildDraftReviewState } = require('./reviewer');
const { buildWeeklyCalendar } = require('./calendar');
const { sendTelegramMessage } = require('./notifier');
const {
  asText,
  isUuid,
  countEvidenceItems,
  hasTenantScopedSignal,
  ensureDirectTenant,
} = require('./validation');
const { nextRetryAt, shouldMoveToDeadLetter } = require('./retryPolicy');

function asInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  const tenantArg = argv.find((part) => part.startsWith('--tenant='));
  const tenantFlagIndex = argv.findIndex((part) => part === '--tenant');
  const tenantFromFlag = tenantFlagIndex >= 0 ? argv[tenantFlagIndex + 1] : '';

  let dryRun = config.dryRun;
  if (args.has('--dry-run')) dryRun = true;
  if (args.has('--no-dry-run')) dryRun = false;

  return {
    once: args.has('--once'),
    queue: args.has('--queue'),
    dryRun,
    tenantId: asText((tenantArg || '').split('=').slice(1).join('=') || tenantFromFlag),
  };
}

function parseJobPayload(job) {
  const raw = job?.payload;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function preferredFormatsForPlatform(platform) {
  if (platform === 'youtube') return ['long_form'];
  return ['faceless_short'];
}

function appendTenantDraftMarkers(artifactInput, tenantId) {
  const keyPoints = Array.isArray(artifactInput.key_points) ? artifactInput.key_points.slice() : [];
  const tags = Array.isArray(artifactInput.tags) ? artifactInput.tags.slice() : [];

  if (!keyPoints.includes(`tenant_id:${tenantId}`)) keyPoints.push(`tenant_id:${tenantId}`);
  if (!keyPoints.includes('status:draft')) keyPoints.push('status:draft');
  if (!tags.includes('tenant_scoped')) tags.push('tenant_scoped');

  return {
    ...artifactInput,
    key_points: keyPoints,
    tags,
  }; 
}

function isNonRetryableQueueError(error) {
  const msg = asText(error?.message || error).toLowerCase();
  return (
    msg.includes('missing_tenant_id_for_queue_job')
    || msg.includes('invalid_tenant_id_for_queue_job')
    || msg.includes('invalid_tenant_id_for_direct_mode')
    || msg.includes('missing_tenant_id_for_direct_mode')
  );
}

function getJobAttemptInfo(job) {
  const priorAttempts = Math.max(0, asInt(job?.attempt_count, 0));
  const maxAttempts = Math.max(1, asInt(job?.max_attempts, config.queueMaxAttemptsDefault));
  return { priorAttempts, maxAttempts };
}

async function applyQueueFailurePolicy({ supabase, job, error, traceId }) {
  const nowIso = new Date().toISOString();
  const message = asText(error?.message || error) || 'unknown_queue_error';
  const { priorAttempts, maxAttempts } = getJobAttemptInfo(job);
  const nextAttempt = priorAttempts + 1;
  const nonRetryable = isNonRetryableQueueError(error);
  const deadLetter = nonRetryable || shouldMoveToDeadLetter({ attemptCount: nextAttempt, maxAttempts });

  if (deadLetter) {
    await updateJobState(supabase, {
      jobId: job.id,
      status: 'dead_letter',
      fields: {
        attempt_count: nextAttempt,
        max_attempts: maxAttempts,
        lease_expires_at: null,
        available_at: null,
        last_error: message,
        dead_lettered_at: nowIso,
        result: {
          trace_id: traceId,
          action: 'dead_letter',
          non_retryable: nonRetryable,
          error: message,
        },
      },
    });

    return {
      action: 'dead_letter',
      nextAttempt,
      maxAttempts,
      retryAt: null,
      nonRetryable,
      message,
    };
  }

  const retryAt = nextRetryAt({
    attemptCount: nextAttempt,
    baseDelaySeconds: config.queueRetryBaseDelaySeconds,
    maxDelaySeconds: config.queueRetryMaxDelaySeconds,
  });

  await updateJobState(supabase, {
    jobId: job.id,
    status: 'retry_wait',
    fields: {
      attempt_count: nextAttempt,
      max_attempts: maxAttempts,
      lease_expires_at: null,
      available_at: retryAt,
      last_error: message,
      result: {
        trace_id: traceId,
        action: 'retry_wait',
        retry_at: retryAt,
        error: message,
      },
    },
  });

  return {
    action: 'retry_wait',
    nextAttempt,
    maxAttempts,
    retryAt,
    nonRetryable: false,
    message,
  };
}

async function processPayload({ supabase, tenantId, payload, traceId, dryRun }) {
  const normalized = normalizePayload(payload, {
    tenant_id: tenantId,
    trace_id: traceId,
    tone: config.defaultTone,
    audience: config.defaultAudience,
  });

  const context = await fetchContextInputs(supabase, {
    tenantId: normalized.tenant_id,
    limits: {
      maxTranscripts: config.maxTranscripts,
      maxClaims: config.maxClaims,
      maxClusters: config.maxClusters,
      maxOpportunities: config.maxOpportunities,
      maxGaps: config.maxGaps,
    },
  });

  const warnings = new Set(context.warnings || []);
  const evidenceItems = countEvidenceItems(context);
  const tenantSignal = hasTenantScopedSignal(context);

  if (!dryRun && config.requireEvidenceForWrite && evidenceItems < config.minEvidenceItems) {
    warnings.add('write_skipped_insufficient_evidence');
    return {
      outputs: [],
      calendar: [],
      contextWarnings: Array.from(warnings),
      stats: {
        evidence_items: evidenceItems,
        tenant_scoped_signal: tenantSignal,
        writes_skipped: true,
      },
    };
  }

  if (!dryRun && config.strictTenantScope && !tenantSignal) {
    warnings.add('write_skipped_tenant_scope_data_missing');
    return {
      outputs: [],
      calendar: [],
      contextWarnings: Array.from(warnings),
      stats: {
        evidence_items: evidenceItems,
        tenant_scoped_signal: tenantSignal,
        writes_skipped: true,
      },
    };
  }

  const topics = normalized.topic
    ? [{ topic: normalized.topic, title: normalized.title, evidence: ['topic_forced_by_payload'] }]
    : detectTopics(context, { maxTopics: config.maxTopics });

  const outputs = [];
  let stored = 0;
  let skipped = 0;

  for (const topic of topics.slice(0, config.outputLimit)) {
    const formats = preferredFormatsForPlatform(normalized.platform);
    for (const format of formats) {
      const output = generateContentPack({
        topic: topic.topic,
        title: topic.title || normalized.title,
        platform: normalized.platform,
        format,
        tone: normalized.tone,
        audience: normalized.audience,
        evidence: topic.evidence || [],
        traceId,
      });

      const reviewed = buildDraftReviewState(output);
      outputs.push(reviewed);

      if (dryRun) {
        console.log(`[video-content-worker] dry_run topic=${reviewed.topic} platform=${reviewed.platform} format=${reviewed.format}`);
        continue;
      }

      const artifactInput = appendTenantDraftMarkers(toArtifactInput(reviewed), normalized.tenant_id);
      const writeRes = await writeDraftArtifact(supabase, {
        output: artifactInput,
        traceId,
      });

      if (writeRes.stored) stored += 1;
      else skipped += 1;
    }
  }

  const calendar = buildWeeklyCalendar(outputs, { days: 7, slotsPerDay: 2 });

  return {
    outputs,
    calendar,
    contextWarnings: Array.from(warnings),
    stats: {
      evidence_items: evidenceItems,
      tenant_scoped_signal: tenantSignal,
      writes_skipped: false,
      stored,
      skipped,
    },
  };
}

async function runDirectOnce({ supabase, tenantId, dryRun }) {
  const traceId = randomUUID();
  const platformList = config.platforms.length ? config.platforms : ['youtube'];
  const allOutputs = [];
  const allCalendars = [];
  const warnings = new Set();
  let stored = 0;
  let skipped = 0;

  for (const platform of platformList) {
    const result = await processPayload({
      supabase,
      tenantId,
      payload: {
        tenant_id: tenantId,
        platform,
        tone: config.defaultTone,
        audience: config.defaultAudience,
      },
      traceId,
      dryRun,
    });

    allOutputs.push(...result.outputs);
    allCalendars.push(...result.calendar);
    for (const warning of result.contextWarnings) warnings.add(warning);
    stored += Number(result.stats?.stored || 0);
    skipped += Number(result.stats?.skipped || 0);
  }

  console.log(`[video-content-worker] mode=direct trace=${traceId} outputs=${allOutputs.length} calendar_slots=${allCalendars.length} dry_run=${String(dryRun)} stored=${stored} skipped=${skipped}`);
  if (warnings.size > 0) {
    console.log(`[video-content-worker] warnings=${Array.from(warnings).join(',')}`);
  }

  await sendTelegramMessage(
    config.telegramBotToken,
    config.telegramChatId,
    `VideoContentWorker run complete\ntrace=${traceId}\noutputs=${allOutputs.length}\ndry_run=${String(dryRun)}\nstored=${stored}\nskipped=${skipped}`
  ).catch((error) => {
    console.warn(`[video-content-worker] telegram_error=${error.message}`);
  });
}

async function runQueueOnce({ supabase, dryRun }) {
  if (!config.queueEnabled) {
    console.log('[video-content-worker] queue_mode_requested_but_disabled');
    return;
  }

  const workerId = `video-content-worker-${process.pid}`;
  const traceId = randomUUID();
  const pending = await listPendingVideoJobs(supabase, { limit: config.queueBatch });

  let processed = 0;
  let retried = 0;
  let deadLettered = 0;

  for (const job of pending.rows) {
    const leased = await leaseJob(supabase, {
      jobId: job.id,
      workerId,
      leaseSeconds: config.leaseSeconds,
    });
    if (!leased.row) continue;

    await updateJobState(supabase, {
      jobId: job.id,
      status: 'running',
      fields: {
        started_at: new Date().toISOString(),
      },
    });

    try {
      const payload = parseJobPayload(leased.row);
      const tenantId = asText(payload.tenant_id || leased.row.tenant_id);
      if (!tenantId) throw new Error('missing_tenant_id_for_queue_job');
      if (!isUuid(tenantId)) throw new Error('invalid_tenant_id_for_queue_job');

      const result = await processPayload({
        supabase,
        tenantId,
        payload,
        traceId,
        dryRun,
      });

      await updateJobState(supabase, {
        jobId: job.id,
        status: 'completed',
        fields: {
          completed_at: new Date().toISOString(),
          lease_expires_at: null,
          last_error: null,
          result: {
            output_count: result.outputs.length,
            calendar_slots: result.calendar.length,
            dry_run: dryRun,
            trace_id: traceId,
            stored: Number(result.stats?.stored || 0),
            skipped: Number(result.stats?.skipped || 0),
            warnings: result.contextWarnings,
          },
        },
      });

      processed += 1;
      console.log(`[video-content-worker] queue_job_completed id=${job.id} outputs=${result.outputs.length}`);
    } catch (error) {
      const failure = await applyQueueFailurePolicy({
        supabase,
        job: leased.row,
        error,
        traceId,
      });

      if (failure.action === 'dead_letter') deadLettered += 1;
      else retried += 1;

      console.error(
        `[video-content-worker] queue_job_failed id=${job.id} action=${failure.action} attempt=${failure.nextAttempt}/${failure.maxAttempts} retry_at=${failure.retryAt || 'n/a'} error=${failure.message}`
      );
    }
  }

  console.log(
    `[video-content-worker] mode=queue trace=${traceId} pending=${pending.rows.length} processed=${processed} retried=${retried} dead_lettered=${deadLettered} dry_run=${String(dryRun)}`
  );
  if (pending.warnings.length > 0) {
    console.log(`[video-content-worker] warnings=${pending.warnings.join(',')}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const supabase = createSupabase(config);

  if (!args.once) {
    console.log('[video-content-worker] use --once for scaffold execution');
    process.exitCode = 0;
    return;
  }

  if (args.queue || config.mode === 'queue') {
    await runQueueOnce({ supabase, dryRun: args.dryRun });
    return;
  }

  const tenantId = ensureDirectTenant(args.tenantId);

  await runDirectOnce({
    supabase,
    tenantId,
    dryRun: args.dryRun,
  });
}

main().catch((error) => {
  console.error(`[video-content-worker] fatal=${error.stack || error.message}`);
  process.exitCode = 1;
});
