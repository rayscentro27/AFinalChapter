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

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map((part) => part.trim()).filter(Boolean);
  }
  return [];
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
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

function providerTier(provider) {
  const p = asText(provider).toLowerCase();
  if (p === 'nvidia_nim' || p === 'nim' || p === 'local') return 'local';
  if (p === 'gemini' || p === 'openrouter') return 'cheap';
  if (p === 'openai') return 'premium';
  return 'fallback';
}

function normalizeProvider(provider) {
  const p = asText(provider).toLowerCase();
  if (p === 'nim' || p === 'local') return 'nvidia_nim';
  return p;
}

function isProviderConfigured(provider) {
  const p = normalizeProvider(provider);
  if (p === 'nvidia_nim') return Boolean(ENV.NVIDIA_NIM_API_KEY) || ENV.ENABLE_NIM_DEV;
  if (p === 'gemini') return Boolean(ENV.GEMINI_API_KEY);
  if (p === 'openrouter') return Boolean(ENV.OPENROUTER_API_KEY);
  if (p === 'openai') return Boolean(ENV.AI_API_KEY);
  if (p === 'heuristic' || p === 'stub') return true;
  return false;
}

function uniqueProviders(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const provider = normalizeProvider(value);
    if (!provider || seen.has(provider)) continue;
    seen.add(provider);
    out.push(provider);
  }
  return out;
}

export function buildProviderExecutionPlan({ requestedProvider, forceOrder, allowFallback = true } = {}) {
  const requested = normalizeProvider(requestedProvider);
  const forced = uniqueProviders(forceOrder);

  if (forced.length > 0) {
    return forced.filter((provider) => isProviderConfigured(provider) || provider === requested);
  }

  const defaults = [
    'nvidia_nim',
    'gemini',
    'openrouter',
    'openai',
    'heuristic',
    'stub',
  ];

  const plan = uniqueProviders([requested, ...defaults]);
  const filtered = plan.filter((provider) => isProviderConfigured(provider) || provider === requested);

  if (!allowFallback && requested) return [requested];
  if (!allowFallback) return filtered.slice(0, 1);
  return filtered.length > 0 ? filtered : ['stub'];
}

function defaultModelForProvider(provider) {
  const p = normalizeProvider(provider);
  if (p === 'gemini') return asText(process.env.AI_GEMINI_MODEL) || 'gemini-1.5-flash';
  if (p === 'openrouter') return asText(process.env.AI_OPENROUTER_MODEL) || 'openai/gpt-4o-mini';
  if (p === 'nvidia_nim') return asText(process.env.AI_NIM_MODEL) || 'meta/llama-3.1-8b-instruct';
  if (p === 'openai') return asText(process.env.AI_OPENAI_MODEL) || 'gpt-4.1-mini';
  return 'stub';
}

function normalizeCost(value) {
  const raw = asObject(value);
  return {
    ...costStub(),
    ...raw,
    input_cost: Number(raw.input_cost || 0),
    output_cost: Number(raw.output_cost || 0),
    total_cost: Number(raw.total_cost || 0),
  };
}

function normalizeUsage(value) {
  const raw = asObject(value);
  return {
    ...usageStub(),
    ...raw,
    input_tokens: Number(raw.input_tokens || 0),
    output_tokens: Number(raw.output_tokens || 0),
    total_tokens: Number(raw.total_tokens || 0),
  };
}

function shouldSimulateProviderFailure(payload, provider) {
  const requested = asArray(payload?.simulate_provider_failure).map((item) => normalizeProvider(item));
  return requested.includes(normalizeProvider(provider));
}

function readKnowledgeOutput(payload = {}) {
  const candidate = payload.knowledge_result
    || payload.retrieval_result
    || payload.structured_result
    || payload.knowledge
    || null;

  if (!candidate) return null;
  if (typeof candidate === 'string') return candidate;
  if (Array.isArray(candidate)) return JSON.stringify(candidate);
  if (typeof candidate === 'object') {
    if (asText(candidate.output_text)) return asText(candidate.output_text);
    if (asText(candidate.summary)) return asText(candidate.summary);
    if (asText(candidate.answer)) return asText(candidate.answer);
    if (asText(candidate.explanation)) return asText(candidate.explanation);
    return JSON.stringify(candidate);
  }
  return null;
}

function logTokenUsage({ logger, traceId, provider, model, taskType, usage, cost, source }) {
  logger.info({
    event: 'ai_token_usage',
    trace_id: traceId,
    source: source || 'model',
    provider: provider || null,
    model: model || null,
    task_type: taskType || null,
    token_usage: usage,
    cost,
  }, 'ai_token_usage');
}

async function executeWithProvider({ provider, model, payload }) {
  if (!isProviderConfigured(provider)) {
    const err = new Error('provider_not_configured:' + String(provider || 'unknown'));
    err.code = 'PROVIDER_NOT_CONFIGURED';
    throw err;
  }

  if (shouldSimulateProviderFailure(payload, provider)) {
    const err = new Error(`simulated_provider_failure:${provider}`);
    err.code = 'SIMULATED_PROVIDER_FAILURE';
    throw err;
  }

  const outputText = asText(payload?.mock_output_text) || `ok:${provider}`;
  const usage = normalizeUsage(payload?.mock_usage);
  const cost = normalizeCost(payload?.mock_cost);

  return {
    provider,
    model,
    output_text: outputText,
    usage,
    cost,
  };
}

export async function executeAiRequest({ traceId, body = {}, logger = console, deps = {} } = {}) {
  const payload = asObject(body);

  const cacheApi = {
    buildRequestFingerprint: deps?.cache?.buildRequestFingerprint || buildRequestFingerprint,
    getCachedResponse: deps?.cache?.getCachedResponse || getCachedResponse,
    hashPrompt: deps?.cache?.hashPrompt || hashPrompt,
    normalizePromptForHash: deps?.cache?.normalizePromptForHash || normalizePromptForHash,
    storeCachedResponse: deps?.cache?.storeCachedResponse || storeCachedResponse,
    ttlSecondsForTask: deps?.cache?.ttlSecondsForTask || ttlSecondsForTask,
  };
  const providerExecutor = deps.executeWithProvider || executeWithProvider;

  const taskType = asText(payload.task_type || payload.taskType || 'assistant_conversation').toLowerCase();
  const tenantId = asText(payload.tenant_id || payload.tenantId || 'public');
  const sourceVersion = asText(payload.source_version || payload.sourceVersion || 'v1');

  const bypassCache = Boolean(payload.cache_bypass || payload.bypass_cache || payload?.cache?.bypass === true);
  const allowFallback = asBool(payload.allow_fallback, true);
  const providerPlan = buildProviderExecutionPlan({
    requestedProvider: payload.provider || ENV.AI_PROVIDER || 'stub',
    forceOrder: payload.provider_plan || payload.provider_order,
    allowFallback,
  });

  const knowledgeOutput = readKnowledgeOutput(payload);
  if (knowledgeOutput && !asBool(payload.force_model_call, false)) {
    const usage = usageStub();
    const cost = costStub();
    logTokenUsage({
      logger,
      traceId,
      provider: null,
      model: null,
      taskType,
      usage,
      cost,
      source: 'knowledge',
    });

    return {
      ok: true,
      trace_id: traceId,
      provider: null,
      model: null,
      output_text: knowledgeOutput,
      usage,
      cost,
      cache: {
        status: 'bypassed_knowledge',
        cache_key: null,
        expires_at: null,
      },
      routing: {
        stage: 'knowledge',
        attempted_providers: [],
        selected_tier: 'knowledge',
        fallback_used: false,
      },
    };
  }

  const normalizedPrompt = cacheApi.normalizePromptForHash({
    prompt: payload.prompt,
    messages: payload.messages,
    input: payload.input,
    context: payload.context,
    taskType,
  });
  const promptHash = cacheApi.hashPrompt(normalizedPrompt);
  const attempts = [];

  if (!bypassCache) {
    for (let i = 0; i < providerPlan.length; i += 1) {
      const candidateProvider = providerPlan[i];
      const candidateModel = (i === 0 && asText(payload.model))
        ? asText(payload.model)
        : defaultModelForProvider(candidateProvider);
      const requestFingerprint = cacheApi.buildRequestFingerprint({
        tenantId,
        provider: candidateProvider,
        model: candidateModel,
        taskType,
        promptHash,
        sourceVersion,
      });

      const cached = await cacheApi.getCachedResponse({
        provider: candidateProvider,
        model: candidateModel,
        taskType,
        requestFingerprint,
        logger,
      });

      attempts.push({
        provider: candidateProvider,
        model: candidateModel,
        stage: 'cache_lookup',
        result: cached.hit ? 'hit' : 'miss',
        reason: cached.reason || null,
      });

      if (cached.hit) {
        logger.info({
          event: 'cache_hit',
          trace_id: traceId,
          provider: candidateProvider,
          model: candidateModel,
          task_type: taskType,
          cache_key: cached.cache_key,
        }, 'cache_hit');

        const usage = normalizeUsage(cached.token_usage);
        const cost = normalizeCost({ total_cost: Number(cached.cost_estimate || 0) });
        logTokenUsage({
          logger,
          traceId,
          provider: candidateProvider,
          model: candidateModel,
          taskType,
          usage,
          cost,
          source: 'cache',
        });

        return {
          ok: true,
          trace_id: traceId,
          provider: candidateProvider,
          model: candidateModel,
          output_text: asText(cached.response_payload.output_text),
          usage,
          cost,
          cache: {
            status: 'hit',
            cache_key: cached.cache_key,
            expires_at: cached.expires_at || null,
          },
          routing: {
            stage: 'cache',
            attempted_providers: attempts,
            selected_tier: providerTier(candidateProvider),
            fallback_used: i > 0,
          },
        };
      }

      logger.info({
        event: 'cache_miss',
        trace_id: traceId,
        provider: candidateProvider,
        model: candidateModel,
        task_type: taskType,
        reason: cached.reason || 'miss',
      }, 'cache_miss');
    }
  }

  const executionErrors = [];
  for (let i = 0; i < providerPlan.length; i += 1) {
    const provider = providerPlan[i];
    const model = (i === 0 && asText(payload.model))
      ? asText(payload.model)
      : defaultModelForProvider(provider);
    const requestFingerprint = cacheApi.buildRequestFingerprint({
      tenantId,
      provider,
      model,
      taskType,
      promptHash,
      sourceVersion,
    });
    const cacheKey = requestFingerprint;

    logger.info({
      event: 'provider_attempt',
      trace_id: traceId,
      provider,
      model,
      task_type: taskType,
      tier: providerTier(provider),
      attempt: i + 1,
      attempt_total: providerPlan.length,
    }, 'provider_attempt');

    try {
      const generated = await providerExecutor({
        provider,
        model,
        payload,
        logger,
      });

      const usage = normalizeUsage(generated.usage);
      const cost = normalizeCost(generated.cost);
      logTokenUsage({
        logger,
        traceId,
        provider,
        model,
        taskType,
        usage,
        cost,
        source: 'model',
      });

      const ttlSeconds = cacheApi.ttlSecondsForTask(taskType);
      const expiresAt = new Date(Date.now() + (ttlSeconds * 1000)).toISOString();
      let stored = { ok: false, schemaMissing: false };
      if (!bypassCache) {
        stored = await cacheApi.storeCachedResponse({
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
          tokenUsage: usage,
          costEstimate: Number(cost.total_cost || 0),
          sourceVersion,
          expiresAt,
          logger,
        });

        if (stored.ok) {
          logger.info({
            event: 'cache_write',
            trace_id: traceId,
            provider,
            model,
            task_type: taskType,
            cache_key: cacheKey,
          }, 'cache_write');
        }
      }

      attempts.push({
        provider,
        model,
        stage: 'model_execute',
        result: 'success',
        reason: null,
      });

      return {
        ok: true,
        trace_id: traceId,
        provider,
        model,
        output_text: generated.output_text,
        usage,
        cost,
        cache: {
          status: bypassCache
            ? 'bypassed'
            : (stored.ok ? 'stored' : (stored.schemaMissing ? 'skipped_schema_missing' : 'skipped')),
          cache_key: cacheKey,
          expires_at: stored.ok ? (stored.row?.expires_at || expiresAt) : expiresAt,
          bypassed: bypassCache,
        },
        routing: {
          stage: 'model',
          attempted_providers: attempts,
          selected_tier: providerTier(provider),
          fallback_used: i > 0,
        },
      };
    } catch (error) {
      const message = asText(error?.message || 'provider_execution_failed');
      executionErrors.push({ provider, model, error: message });
      attempts.push({
        provider,
        model,
        stage: 'model_execute',
        result: 'failed',
        reason: message,
      });
      logger.warn({
        event: 'provider_failover',
        trace_id: traceId,
        provider,
        model,
        task_type: taskType,
        error: message,
      }, 'provider_failover');
    }
  }

  return {
    ok: false,
    trace_id: traceId,
    provider: null,
    model: null,
    output_text: '',
    error: 'all_providers_failed',
    provider_errors: executionErrors,
    usage: usageStub(),
    cost: costStub(),
    cache: {
      status: bypassCache ? 'bypassed' : 'miss',
      cache_key: null,
      expires_at: null,
      bypassed: bypassCache,
    },
    routing: {
      stage: 'failed',
      attempted_providers: attempts,
      selected_tier: null,
      fallback_used: attempts.length > 1,
    },
  };
}
