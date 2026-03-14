import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

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

const { systemHealthRoutes } = await import('../src/routes/system_health.js');

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function createFakeSupabase({ aiCacheRows = [], systemErrorRows = [] } = {}) {
  const tables = {
    ai_cache: aiCacheRows,
    system_errors: systemErrorRows,
  };

  const runQuery = (state) => {
    if (!(state.table in tables)) {
      return { data: [], error: { message: `relation \"${state.table}\" does not exist` } };
    }

    let rows = Array.isArray(tables[state.table]) ? [...tables[state.table]] : [];

    for (const fn of state.filters) {
      rows = rows.filter(fn);
    }

    if (state.orderBy) {
      const { column, ascending } = state.orderBy;
      rows.sort((a, b) => {
        const av = a?.[column] ?? null;
        const bv = b?.[column] ?? null;
        if (av === bv) return 0;
        if (av === null) return ascending ? -1 : 1;
        if (bv === null) return ascending ? 1 : -1;
        if (av < bv) return ascending ? -1 : 1;
        return ascending ? 1 : -1;
      });
    }

    if (typeof state.limit === 'number') rows = rows.slice(0, state.limit);

    if (state.selectOptions?.head && state.selectOptions?.count === 'exact') {
      return { count: rows.length, error: null };
    }

    if (state.maybeSingle) {
      return { data: rows[0] || null, error: null };
    }

    return { data: rows, error: null, count: rows.length };
  };

  const buildQuery = (table) => {
    const state = {
      table,
      filters: [],
      orderBy: null,
      limit: null,
      selectOptions: {},
      maybeSingle: false,
    };

    const query = {
      select: (_columns, options = {}) => {
        state.selectOptions = options || {};
        return query;
      },
      gte: (column, value) => {
        state.filters.push((row) => asText(row?.[column]) >= asText(value));
        return query;
      },
      lte: (column, value) => {
        state.filters.push((row) => asText(row?.[column]) <= asText(value));
        return query;
      },
      lt: (column, value) => {
        state.filters.push((row) => asText(row?.[column]) < asText(value));
        return query;
      },
      eq: (column, value) => {
        state.filters.push((row) => asText(row?.[column]) === asText(value));
        return query;
      },
      in: (column, values) => {
        const allowed = Array.isArray(values) ? values.map((v) => asText(v)) : [];
        state.filters.push((row) => allowed.includes(asText(row?.[column])));
        return query;
      },
      is: (column, value) => {
        state.filters.push((row) => {
          if (value === null) return row?.[column] == null;
          return row?.[column] === value;
        });
        return query;
      },
      order: (column, options = {}) => {
        state.orderBy = { column, ascending: options?.ascending !== false };
        return query;
      },
      limit: (value) => {
        state.limit = Number(value);
        return query;
      },
      maybeSingle: () => {
        state.maybeSingle = true;
        return query;
      },
      then: (resolve, reject) => Promise.resolve(runQuery(state)).then(resolve, reject),
      catch: (reject) => Promise.resolve(runQuery(state)).catch(reject),
    };

    return query;
  };

  return {
    from: (table) => buildQuery(table),
  };
}

async function buildApp({ supabase, metrics } = {}) {
  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(systemHealthRoutes, {
    supabaseAdmin: supabase || createFakeSupabase(),
    getAiCacheMetrics: metrics || (() => ({ cache_hit: 0, cache_miss: 0, cache_write: 0, cache_invalidate: 0, cache_error: 0 })),
  });
  return app;
}

test('GET /api/system/usage returns 401 without internal API key', async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: 'GET',
    url: '/api/system/usage',
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { ok: false, error: 'unauthorized' });

  await app.close();
});

test('GET /api/system/usage returns usage telemetry for populated data', async () => {
  const now = Date.now();
  const recent1 = new Date(now - (10 * 60 * 1000)).toISOString();
  const recent2 = new Date(now - (20 * 60 * 1000)).toISOString();

  const app = await buildApp({
    supabase: createFakeSupabase({
      aiCacheRows: [
        {
          provider: 'gemini',
          model: 'gemini-2.5-pro',
          task_type: 'research_summary',
          token_usage: { total_tokens: 100 },
          cost_estimate: 0.12,
          hit_count: 1,
          created_at: recent1,
        },
        {
          provider: 'openrouter',
          model: 'meta-llama',
          task_type: 'assistant_conversation',
          token_usage: { input_tokens: 50, output_tokens: 20 },
          cost_estimate: 0.05,
          hit_count: 0,
          created_at: recent2,
        },
      ],
      systemErrorRows: [
        {
          service: 'ai_router',
          component: 'provider_fallback',
          error_type: 'upstream_failure',
          created_at: recent1,
        },
        {
          service: 'routing',
          component: 'webhook',
          error_type: 'validation_error',
          created_at: recent2,
        },
      ],
    }),
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/system/usage?hours=24',
    headers: {
      'x-api-key': 'test-internal-key',
    },
  });

  assert.equal(response.statusCode, 200);

  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.hours, 24);
  assert.equal(body.ai_requests_24h, 2);
  assert.equal(body.ai_failures_24h, 1);
  assert.equal(body.ai_cache_hits_24h, 1);
  assert.equal(body.ai_cache_hit_rate_24h, 0.5);
  assert.equal(body.token_usage_24h, 170);
  assert.equal(body.cost_estimate_24h_usd, 0.17);
  assert.deepEqual(body.summary.provider_counts, { gemini: 1, openrouter: 1 });
  assert.deepEqual(body.summary.task_type_counts, { research_summary: 1, assistant_conversation: 1 });
  assert.equal(body.summary.openrouter_requests_24h, 1);
  assert.equal(body.summary.openrouter_cache_hits_24h, 0);
  assert.equal(body.summary.openrouter_cache_hit_rate_24h, 0);
  assert.ok(body.runtime_cache_metrics && typeof body.runtime_cache_metrics === 'object');
  assert.deepEqual(body.missing_tables, []);
  assert.deepEqual(body.warnings, []);

  await app.close();
});

test('GET /api/system/usage returns stable empty payload when no rows exist', async () => {
  const app = await buildApp({
    supabase: createFakeSupabase({
      aiCacheRows: [],
      systemErrorRows: [],
    }),
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/system/usage',
    headers: {
      'x-api-key': 'test-internal-key',
    },
  });

  assert.equal(response.statusCode, 200);

  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.ai_requests_24h, 0);
  assert.equal(body.ai_failures_24h, 0);
  assert.equal(body.ai_cache_hits_24h, 0);
  assert.equal(body.ai_cache_hit_rate_24h, 0);
  assert.equal(body.token_usage_24h, 0);
  assert.equal(body.cost_estimate_24h_usd, 0);
  assert.deepEqual(body.summary.provider_counts, {});
  assert.deepEqual(body.summary.task_type_counts, {});
  assert.equal(body.summary.openrouter_requests_24h, 0);
  assert.equal(body.summary.openrouter_cache_hits_24h, 0);
  assert.equal(body.summary.openrouter_cache_hit_rate_24h, 0);
  assert.ok(body.runtime_cache_metrics && typeof body.runtime_cache_metrics === 'object');

  await app.close();
});
