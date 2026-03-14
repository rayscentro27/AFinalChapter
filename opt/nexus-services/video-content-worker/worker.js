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

function asText(value) {
  return String(value || '').trim();
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  const tenantArg = argv.find((part) => part.startsWith('--tenant='));
  const tenantFlagIndex = argv.findIndex((part) => part === '--tenant');
  const tenantFromFlag = tenantFlagIndex >= 0 ? argv[tenantFlagIndex + 1] : '';

  return {
    once: args.has('--once'),
    queue: args.has('--queue'),
    dryRun: args.has('--dry-run') || config.dryRun,
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

  const topics = normalized.topic
    ? [{ topic: normalized.topic, title: normalized.title, evidence: ['topic_forced_by_payload'] }]
    : detectTopics(context, { maxTopics: config.maxTopics });

  const outputs = [];
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

      const artifactInput = toArtifactInput(reviewed);
      await writeDraftArtifact(supabase, {
        output: artifactInput,
        traceId,
      });
    }
  }

  const calendar = buildWeeklyCalendar(outputs, { days: 7, slotsPerDay: 2 });

  return {
    outputs,
    calendar,
    contextWarnings: context.warnings,
  };
}

async function runDirectOnce({ supabase, tenantId, dryRun }) {
  const traceId = randomUUID();
  const platformList = config.platforms.length ? config.platforms : ['youtube'];
  const allOutputs = [];
  const allCalendars = [];
  const warnings = new Set();

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
  }

  console.log(`[video-content-worker] mode=direct trace=${traceId} outputs=${allOutputs.length} calendar_slots=${allCalendars.length} dry_run=${String(dryRun)}`);
  if (warnings.size > 0) {
    console.log(`[video-content-worker] warnings=${Array.from(warnings).join(',')}`);
  }

  await sendTelegramMessage(
    config.telegramBotToken,
    config.telegramChatId,
    `VideoContentWorker run complete\ntrace=${traceId}\noutputs=${allOutputs.length}\ndry_run=${String(dryRun)}`
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
      fields: { started_at: new Date().toISOString() },
    });

    try {
      const payload = parseJobPayload(leased.row);
      const tenantId = asText(payload.tenant_id || leased.row.tenant_id);
      if (!tenantId) throw new Error('missing_tenant_id_for_queue_job');

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
          result: {
            output_count: result.outputs.length,
            calendar_slots: result.calendar.length,
            dry_run: dryRun,
            trace_id: traceId,
          },
          lease_expires_at: null,
        },
      });

      processed += 1;
    } catch (error) {
      await updateJobState(supabase, {
        jobId: job.id,
        status: 'failed',
        fields: {
          last_error: String(error.message || error),
          lease_expires_at: null,
        },
      }).catch(() => {});
      console.error(`[video-content-worker] queue_job_failed id=${job.id} error=${error.message}`);
    }
  }

  console.log(`[video-content-worker] mode=queue trace=${traceId} pending=${pending.rows.length} processed=${processed} dry_run=${String(dryRun)}`);
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

  if (!args.tenantId) {
    throw new Error('missing_tenant_id_for_direct_mode (use --tenant <TENANT_UUID>)');
  }

  await runDirectOnce({
    supabase,
    tenantId: args.tenantId,
    dryRun: args.dryRun,
  });
}

main().catch((error) => {
  console.error(`[video-content-worker] fatal=${error.stack || error.message}`);
  process.exitCode = 1;
});
