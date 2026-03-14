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

function createFakeSupabase(seed = {}) {
  const tables = {
    business_opportunities: seed.business_opportunities || [],
    grant_opportunities: seed.grant_opportunities || [],
    coverage_gaps: seed.coverage_gaps || [],
    research_briefs: seed.research_briefs || [],
    research_artifacts: seed.research_artifacts || [],
    job_queue: seed.job_queue || [],
    worker_heartbeats: seed.worker_heartbeats || [],
    system_errors: seed.system_errors || [],
    ai_cache: seed.ai_cache || [],
    youtube_transcripts: seed.youtube_transcripts || [],
    knowledge_docs: seed.knowledge_docs || [],
    research_claims: seed.research_claims || [],
    research_clusters: seed.research_clusters || [],
    research_hypotheses: seed.research_hypotheses || [],
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

async function buildApp(seed = {}) {
  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(systemHealthRoutes, {
    supabaseAdmin: createFakeSupabase(seed),
  });
  return app;
}

test('GET /api/system/opportunities returns 401 without internal API key', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/api/system/opportunities' });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { ok: false, error: 'unauthorized' });

  await app.close();
});

test('GET /api/system/opportunities is tenant-safe and empty-safe', async () => {
  const now = Date.now();
  const t1 = new Date(now - (5 * 60 * 1000)).toISOString();
  const t2 = new Date(now - (15 * 60 * 1000)).toISOString();

  const app = await buildApp({
    business_opportunities: [
      { id: 'b1', tenant_id: 'tenant-a', opportunity_type: 'business_opportunity', title: 'AI Agency', score: 91, created_at: t1 },
      { id: 'b2', tenant_id: 'tenant-a', opportunity_type: 'automation_idea', title: 'Automate onboarding', score: 82, created_at: t2 },
      { id: 'b3', tenant_id: 'tenant-b', opportunity_type: 'business_opportunity', title: 'Other tenant', score: 99, created_at: t1 },
    ],
    grant_opportunities: [
      { id: 'g1', tenant_id: 'tenant-a', opportunity_type: 'grant_opportunity', title: 'Local grant', score: 72, created_at: t2 },
    ],
    coverage_gaps: [
      { id: 'c1', tenant_id: 'tenant-a', gap_type: 'service_gap', created_at: t1 },
      { id: 'c2', tenant_id: 'tenant-b', gap_type: 'service_gap', created_at: t1 },
    ],
    research_briefs: [
      { id: 'rb1', tenant_id: 'tenant-a', topic: 'Opportunity Brief', created_at: t1 },
    ],
    research_artifacts: [
      { id: 'ra1', tenant_id: 'tenant-a', type: 'saas_idea', tags: ['opportunity'], created_at: t1 },
      { id: 'ra2', tenant_id: 'tenant-b', type: 'saas_idea', tags: ['opportunity'], created_at: t1 },
    ],
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/system/opportunities?tenant_id=tenant-a&hours=24',
    headers: { 'x-api-key': 'test-internal-key' },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();

  assert.equal(body.ok, true);
  assert.equal(body.tenant_id, 'tenant-a');
  assert.equal(body.business_opportunities_24h, 2);
  assert.equal(body.grant_opportunities_24h, 1);
  assert.equal(body.service_gaps_24h, 1);
  assert.equal(body.opportunity_briefs_24h, 1);
  assert.equal(body.automation_ideas_24h, 1);
  assert.equal(body.total_opportunities_24h, 4);
  assert.equal(body.summary.top_opportunities.length, 3);
  assert.equal(body.summary.top_opportunities[0].id, 'b1');
  assert.equal(body.summary.top_opportunities[0].source_table, 'business_opportunities');
  assert.deepEqual(body.missing_tables, []);

  await app.close();
});

test('GET /api/system/video-worker is tenant-safe and reports throughput', async () => {
  const now = Date.now();
  const fresh = new Date(now - (10 * 1000)).toISOString();
  const stale = new Date(now - (5 * 60 * 1000)).toISOString();
  const t1 = new Date(now - (3 * 60 * 1000)).toISOString();
  const t2 = new Date(now - (20 * 60 * 1000)).toISOString();

  const app = await buildApp({
    job_queue: [
      { id: 'j1', tenant_id: 'tenant-a', job_type: 'video_script_generation', status: 'completed', created_at: t1 },
      { id: 'j2', tenant_id: 'tenant-a', job_type: 'video_caption_generation', status: 'pending', created_at: t1 },
      { id: 'j3', tenant_id: 'tenant-a', job_type: 'research_scan', status: 'completed', created_at: t1 },
      { id: 'j4', tenant_id: 'tenant-b', job_type: 'video_script_generation', status: 'dead_letter', created_at: t1 },
    ],
    worker_heartbeats: [
      { worker_id: 'w1', tenant_id: 'tenant-a', worker_type: 'video_content_worker', last_seen_at: fresh, status: 'running' },
      { worker_id: 'w2', tenant_id: 'tenant-a', worker_type: 'video_content_worker', last_seen_at: stale, status: 'idle' },
      { worker_id: 'w3', tenant_id: 'tenant-a', worker_type: 'research_worker', last_seen_at: fresh, status: 'running' },
      { worker_id: 'w4', tenant_id: 'tenant-b', worker_type: 'video_content_worker', last_seen_at: fresh, status: 'running' },
    ],
    research_artifacts: [
      { id: 'a1', tenant_id: 'tenant-a', title: 'Video script', status: 'draft', tags: ['video'], created_at: t1 },
      { id: 'a2', tenant_id: 'tenant-a', title: 'Reel draft', status: 'review_pending', tags: ['shorts'], created_at: t2 },
      { id: 'a3', tenant_id: 'tenant-a', title: 'Blog post', status: 'draft', tags: ['blog'], created_at: t1 },
      { id: 'a4', tenant_id: 'tenant-b', title: 'Video script', status: 'draft', tags: ['video'], created_at: t1 },
    ],
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/system/video-worker?tenant_id=tenant-a&hours=24',
    headers: { 'x-api-key': 'test-internal-key' },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();

  assert.equal(body.ok, true);
  assert.equal(body.tenant_id, 'tenant-a');
  assert.equal(body.video_jobs_processed_24h, 2);
  assert.equal(body.video_jobs_completed_24h, 1);
  assert.equal(body.queue_depth_pending, 1);
  assert.equal(body.currently_running, 0);
  assert.equal(body.dead_letter_count, 0);
  assert.equal(body.video_worker_failures_24h, 0);
  assert.equal(body.video_drafts_generated_24h, 1);
  assert.equal(body.video_review_pending, 1);
  assert.equal(body.workers_known, 2);
  assert.equal(body.workers_fresh, 1);
  assert.equal(body.workers_stale, 1);
  assert.deepEqual(body.missing_tables, []);

  await app.close();
});

