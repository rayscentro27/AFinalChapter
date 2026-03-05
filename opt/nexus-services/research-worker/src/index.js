const { randomUUID } = require('crypto');
const config = require('./config');
const { createSupabase, claimNextInboxItem } = require('./db');
const { fetchTranscript } = require('./transcript');
const { summarizeAndExtract } = require('./llm');
const { sendTelegramMessage } = require('./notifier');

function asTextError(error) {
  return String(error && (error.stack || error.message || error)).slice(0, 4000);
}

async function insertRun(supabase, payload) {
  const { error } = await supabase.from('research_runs').insert(payload);
  if (error) {
    console.error(`[research-worker] failed to write research_runs: ${error.message}`);
  }
}

async function updateInbox(supabase, id, changes) {
  const { error } = await supabase
    .from('research_inbox')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update research_inbox id=${id}: ${error.message}`);
  }
}

async function processOne(supabase) {
  const inbox = await claimNextInboxItem(supabase, config.workerName);
  if (!inbox) {
    return { processed: false };
  }

  const traceId = randomUUID();
  const startedAt = Date.now();
  let status = 'failed';
  let provider = 'none';
  let model = 'none';
  let costUsdEst = null;
  let errorText = null;
  let artifactId = null;

  try {
    const transcript = await fetchTranscript(inbox.source_url, {
      timeoutMs: config.transcriptTimeoutMs,
    });

    if (!transcript.ok || !transcript.transcriptText) {
      status = 'skipped';
      errorText = 'no_transcript';

      await updateInbox(supabase, inbox.id, {
        status,
        error: errorText,
        meta: {
          ...(inbox.meta || {}),
          trace_id: traceId,
          transcript_method: transcript.method,
          transcript_language: transcript.language,
          transcript_raw_path: transcript.rawPath,
        },
      });

      try {
        await sendTelegramMessage(
          config.telegramBotToken,
          config.telegramChatId,
          `Nexus Research skipped: no transcript\n${inbox.title || '(untitled)'}`
        );
      } catch (notifyError) {
        console.warn(`[research-worker] telegram notify failed: ${notifyError.message}`);
      }

      return { processed: true, status };
    }

    const llm = await summarizeAndExtract({
      sourceUrl: inbox.source_url,
      title: inbox.title,
      transcriptText: transcript.transcriptText,
      traceId,
      gatewayUrl: config.openclawGatewayUrl,
      gatewayToken: config.openclawGatewayToken,
      geminiApiKey: config.geminiApiKey,
      enableGeminiFallback: config.enableGeminiFallback,
    });

    provider = llm.provider;
    model = llm.model;
    costUsdEst = llm.costUsdEst;

    const artifactPayload = {
      source_url: inbox.source_url,
      title: inbox.title || '(untitled)',
      channel_name: (inbox.meta && inbox.meta.channel_name) || null,
      summary: llm.output.summary,
      key_points: llm.output.key_points,
      tags: llm.output.tags,
      confidence: llm.output.confidence,
      trace_id: traceId,
      published_at: (inbox.meta && inbox.meta.published_at) || null,
    };

    const { data: artifact, error: artifactError } = await supabase
      .from('research_artifacts')
      .insert(artifactPayload)
      .select('id')
      .single();

    if (artifactError) {
      throw new Error(`research_artifacts insert failed: ${artifactError.message}`);
    }

    artifactId = artifact.id;

    if (llm.output.claims.length > 0) {
      const claimsPayload = llm.output.claims.map((claim) => ({
        artifact_id: artifactId,
        claim_text: claim.claim_text,
        claim_type: claim.claim_type,
        verifiability: claim.verifiability,
        suggested_verification: claim.suggested_verification,
        risk_notes: claim.risk_notes,
      }));

      const { error: claimsError } = await supabase.from('research_claims').insert(claimsPayload);
      if (claimsError) {
        throw new Error(`research_claims insert failed: ${claimsError.message}`);
      }
    }

    status = 'done';

    await updateInbox(supabase, inbox.id, {
      status,
      artifact_id: artifactId,
      error: null,
      meta: {
        ...(inbox.meta || {}),
        trace_id: traceId,
        transcript_method: transcript.method,
        transcript_language: transcript.language,
        transcript_raw_path: transcript.rawPath,
      },
    });

    await sendTelegramMessage(
      config.telegramBotToken,
      config.telegramChatId,
      `Nexus Research complete\nartifact_id=${artifactId}\nstatus=${status}\n${inbox.title || '(untitled)'}`
    );
  } catch (error) {
    errorText = asTextError(error);
    status = 'failed';

    await updateInbox(supabase, inbox.id, {
      status,
      error: errorText,
      meta: {
        ...(inbox.meta || {}),
        trace_id: traceId,
      },
    });

    try {
      await sendTelegramMessage(
        config.telegramBotToken,
        config.telegramChatId,
        `Nexus Research ${status}\n${inbox.title || '(untitled)'}\nreason=${String(
          error.message || error
        ).slice(0, 500)}`
      );
    } catch (notifyError) {
      console.warn(`[research-worker] telegram notify failed: ${notifyError.message}`);
    }
  } finally {
    const durationMs = Date.now() - startedAt;

    await insertRun(supabase, {
      trace_id: traceId,
      source_url: inbox.source_url,
      provider,
      model,
      status,
      duration_ms: durationMs,
      cost_usd_est: costUsdEst,
      error: errorText,
    });

    console.log(
      `[research-worker] inbox_id=${inbox.id} trace=${traceId} status=${status} artifact_id=${artifactId || 'null'} duration_ms=${durationMs}`
    );
  }

  return { processed: true, status };
}

async function run() {
  const supabase = createSupabase(config);

  let processedCount = 0;
  for (let i = 0; i < config.maxItemsPerRun; i += 1) {
    const result = await processOne(supabase);
    if (!result.processed) {
      break;
    }
    processedCount += 1;
  }

  console.log(`[research-worker] run complete processed=${processedCount}`);
}

async function runTranscriptTest(videoUrl) {
  if (!videoUrl) {
    throw new Error('Missing value for --transcript-test <videoUrl>');
  }

  const result = await fetchTranscript(videoUrl, {
    timeoutMs: config.transcriptTimeoutMs,
  });

  const text = result.transcriptText || '';
  console.log(
    `[transcript-test] ok=${result.ok} method=${result.method} language=${result.language || 'n/a'} rawPath=${result.rawPath || 'n/a'}`
  );
  console.log(`[transcript-test] transcript_length=${text.length}`);
  console.log(`[transcript-test] preview=${text.slice(0, 300)}`);
}

async function main(argv = process.argv.slice(2)) {
  const idx = argv.indexOf('--transcript-test');
  if (idx >= 0) {
    await runTranscriptTest(argv[idx + 1]);
    return;
  }

  await run();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[research-worker] fatal error: ${asTextError(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  run,
  runTranscriptTest,
};
