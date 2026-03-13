import { ENV } from '../env.js';
import {
  buildRequestFingerprint,
  getCachedResponse,
  hashPrompt,
  normalizePromptForHash,
  storeCachedResponse,
  ttlSecondsForTask,
} from './cache.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function usageStub() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
  };
}

function costStub() {
  return {
    currency: 'USD',
    input_cost: 0,
    output_cost: 0,
    total_cost: 0,
  };
}

function defaultModelForProvider(provider) {
  const p = asText(provider).toLowerCase();
  if (p === 'gemini') return asText(process.env.AI_GEMINI_MODEL) || 'gemini-1.5-flash';
  if (p === 'openai') return asText(process.env.AI_OPENAI_MODEL) || 'gpt-4.1-mini';
  return 'stub';
}

async function executeWithProvider({ provider, model }) {
  // Current gateway execution path remains stubbed. Cache integration is additive.
  return {
    provider,
    model,
    output_text: 'ok',
    usage: usageStub(),
    cost: costStub(),
  };
}

export async function executeAiRequest({ traceId, body = {}, logger = console } = {}) {
  const payload = asObject(body);

  const provider = asText(payload.provider || ENV.AI_PROVIDER || 'stub').toLowerCase();
  const model = asText(payload.model) || defaultModelForProvider(provider);
  const taskType = asText(payload.task_type || payload.taskType || 'assistant_conversation').toLowerCase();
  const tenantId = asText(payload.tenant_id || payload.tenantId || 'public');
  const sourceVersion = asText(payload.source_version || payload.sourceVersion || 'v1');

  const bypassCache = Boolean(payload.cache_bypass || payload.bypass_cache || payload?.cache?.bypass === true);
  const normalizedPrompt = normalizePromptForHash({
    prompt: payload.prompt,
    messages: payload.messages,
    input: payload.input,
    context: payload.context,
    taskType,
  });
  const promptHash = hashPrompt(normalizedPrompt);
  const requestFingerprint = buildRequestFingerprint({
    tenantId,
    provider,
    model,
    taskType,
    promptHash,
    sourceVersion,
  });
  const cacheKey = requestFingerprint;

  if (!bypassCache) {
    const cached = await getCachedResponse({
      provider,
      model,
      taskType,
      requestFingerprint,
      logger,
    });

    if (cached.hit) {
      logger.info({ event: 'cache_hit', trace_id: traceId, provider, model, task_type: taskType, cache_key: cached.cache_key }, 'cache_hit');
      return {
        ok: true,
        trace_id: traceId,
        provider,
        model,
        output_text: asText(cached.response_payload.output_text),
        usage: asObject(cached.token_usage),
        cost: {
          ...costStub(),
          total_cost: Number(cached.cost_estimate || 0),
        },
        cache: {
          status: 'hit',
          cache_key: cached.cache_key,
          expires_at: cached.expires_at || null,
        },
      };
    }

    logger.info({ event: 'cache_miss', trace_id: traceId, provider, model, task_type: taskType, reason: cached.reason || 'miss' }, 'cache_miss');
  }

  const generated = await executeWithProvider({ provider, model, payload, logger });

  const ttlSeconds = ttlSecondsForTask(taskType);
  const expiresAt = new Date(Date.now() + (ttlSeconds * 1000)).toISOString();

  let stored = { ok: false, schemaMissing: false };
  if (!bypassCache) {
    stored = await storeCachedResponse({
      cacheKey,
      provider,
      model,
      taskType,
      promptHash,
      requestFingerprint,
      responsePayload: {
        output_text: generated.output_text,
        provider,
        model,
        task_type: taskType,
      },
      tokenUsage: generated.usage,
      costEstimate: Number(generated?.cost?.total_cost || 0),
      sourceVersion,
      expiresAt,
      logger,
    });

    if (stored.ok) {
      logger.info({ event: 'cache_write', trace_id: traceId, provider, model, task_type: taskType, cache_key: cacheKey }, 'cache_write');
    }
  }

  return {
    ok: true,
    trace_id: traceId,
    provider,
    model,
    output_text: generated.output_text,
    usage: generated.usage,
    cost: generated.cost,
    cache: {
      status: bypassCache
        ? 'bypassed'
        : (stored.ok ? 'stored' : (stored.schemaMissing ? 'skipped_schema_missing' : 'skipped')),
      cache_key: cacheKey,
      expires_at: stored.ok ? (stored.row?.expires_at || expiresAt) : expiresAt,
      bypassed: bypassCache,
    },
  };
}
