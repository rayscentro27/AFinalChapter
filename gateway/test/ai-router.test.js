import test from 'node:test';
import assert from 'node:assert/strict';

process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'test-internal-key';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';
process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'test-jwt-secret';
process.env.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
process.env.TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'twilio-auth-token';
process.env.TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '+15550001111';
process.env.META_APP_SECRET = process.env.META_APP_SECRET || 'meta-app-secret';
process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'meta-verify-token';
process.env.WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'wa-verify-token';
process.env.WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || 'wa-token';
process.env.META_PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || 'meta-page-token';

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'gemini-key';
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'openrouter-key';
process.env.NVIDIA_NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY || 'nim-key';
process.env.ENABLE_NIM_DEV = process.env.ENABLE_NIM_DEV || 'true';
process.env.AI_API_KEY = process.env.AI_API_KEY || 'openai-key';

const { buildProviderExecutionPlan, executeAiRequest } = await import('../src/ai/router.js');

const quietLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

test('buildProviderExecutionPlan prefers local -> cheap -> premium tiers', () => {
  const plan = buildProviderExecutionPlan({ requestedProvider: '', allowFallback: true });

  assert.equal(plan[0], 'nvidia_nim');
  assert.ok(plan.includes('gemini'));
  assert.ok(plan.includes('openrouter'));
  assert.ok(plan.includes('openai'));
  assert.ok(plan.includes('heuristic'));
});

test('executeAiRequest short-circuits on retrieval-first knowledge result', async () => {
  const result = await executeAiRequest({
    traceId: 'trace-knowledge',
    body: {
      task_type: 'research_summary',
      knowledge_result: {
        summary: 'cached from structured research',
      },
    },
    logger: quietLogger,
    deps: {
      cache: {
        getCachedResponse: async () => {
          throw new Error('cache should not be called on knowledge short-circuit');
        },
      },
      executeWithProvider: async () => {
        throw new Error('provider should not be called on knowledge short-circuit');
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.cache.status, 'bypassed_knowledge');
  assert.equal(result.output_text, 'cached from structured research');
  assert.equal(result.routing.stage, 'knowledge');
});

test('executeAiRequest uses provider fallback when first provider fails', async () => {
  const attempts = [];

  const result = await executeAiRequest({
    traceId: 'trace-fallback',
    body: {
      provider: 'gemini',
      task_type: 'assistant_conversation',
      prompt: 'Hello there',
      cache_bypass: true,
    },
    logger: quietLogger,
    deps: {
      executeWithProvider: async ({ provider, model }) => {
        attempts.push({ provider, model });
        if (provider === 'gemini') throw new Error('simulated upstream failure');

        return {
          provider,
          model,
          output_text: `from:${provider}`,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
          },
          cost: {
            currency: 'USD',
            input_cost: 0.0001,
            output_cost: 0.0002,
            total_cost: 0.0003,
          },
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(attempts[0].provider, 'gemini');
  assert.notEqual(result.provider, 'gemini');
  assert.equal(result.routing.fallback_used, true);
  assert.ok(Array.isArray(result.routing.attempted_providers));
  assert.ok(result.routing.attempted_providers.some((item) => item.result === 'failed'));
  assert.ok(result.routing.attempted_providers.some((item) => item.result === 'success'));
});

test('executeAiRequest returns cache hit payload when cache has match', async () => {
  let providerCalls = 0;

  const result = await executeAiRequest({
    traceId: 'trace-cache-hit',
    body: {
      provider: 'gemini',
      task_type: 'assistant_conversation',
      prompt: 'Summarize this',
    },
    logger: quietLogger,
    deps: {
      cache: {
        getCachedResponse: async () => ({
          hit: true,
          cache_key: 'cache-key-1',
          response_payload: { output_text: 'from-cache' },
          token_usage: {
            input_tokens: 1,
            output_tokens: 1,
            total_tokens: 2,
          },
          cost_estimate: 0.0004,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        }),
      },
      executeWithProvider: async () => {
        providerCalls += 1;
        return {
          output_text: 'should-not-run',
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.cache.status, 'hit');
  assert.equal(result.output_text, 'from-cache');
  assert.equal(providerCalls, 0);
});
