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

function createFakeSupabase({
  youtubeTranscripts = [],
  knowledgeDocs = [],
  researchArtifacts = [],
  researchClaims = [],
  researchClusters = [],
  researchBriefs = [],
  researchHypotheses = [],
  coverageGaps = [],
  systemErrors = [],
} = {}) {
  const tables = {
    youtube_transcripts: youtubeTranscripts,
    knowledge_docs: knowledgeDocs,
    research_artifacts: researchArtifacts,
    research_claims: researchClaims,
    research_clusters: researchClusters,
    research_briefs: researchBriefs,
    research_hypotheses: researchHypotheses,
    coverage_gaps: coverageGaps,
    system_errors: systemErrors,
    ai_cache: [],
    job_queue: [],
    worker_heartbeats: [],
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

async function buildApp({ supabase } = {}) {
  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(systemHealthRoutes, {
    supabaseAdmin: supabase || createFakeSupabase(),
  });
  return app;
}

test('GET /api/system/ingestion returns 401 without internal API key', async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: 'GET',
    url: '/api/system/ingestion',
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { ok: false, error: 'unauthorized' });

  await app.close();
});

test('GET /api/system/ingestion returns counts, failures, and latest timestamps', async () => {
  const now = Date.now();
  const t1 = new Date(now - (5 * 60 * 1000)).toISOString();
  const t2 = new Date(now - (15 * 60 * 1000)).toISOString();
  const t3 = new Date(now - (25 * 60 * 1000)).toISOString();

  const app = await buildApp({
    supabase: createFakeSupabase({
      youtubeTranscripts: [{ created_at: t2 }, { created_at: t1 }],
      knowledgeDocs: [{ created_at: t2 }],
      researchArtifacts: [{ created_at: t1 }],
      researchClaims: [{ created_at: t2 }, { created_at: t3 }],
      researchClusters: [{ created_at: t3 }],
      researchBriefs: [{ created_at: t3 }],
      researchHypotheses: [{ created_at: t2 }],
      coverageGaps: [{ created_at: t1 }, { created_at: t2 }],
      systemErrors: [
        {
          service: 'research_worker',
          component: 'transcript_ingestion',
          error_message: 'no_transcript available',
          created_at: t1,
        },
        {
          service: 'research_worker',
          component: 'claim_extractor',
          error_message: 'research claim extraction failed',
          created_at: t2,
        },
      ],
    }),
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/system/ingestion?hours=24',
    headers: {
      'x-api-key': 'test-internal-key',
    },
  });

  assert.equal(response.statusCode, 200);

  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.hours, 24);
  assert.equal(body.transcripts_ingested_24h, 2);
  assert.equal(body.knowledge_docs_ingested_24h, 1);
  assert.equal(body.research_artifacts_ingested_24h, 1);
  assert.equal(body.research_claims_ingested_24h, 2);
  assert.equal(body.research_clusters_ingested_24h, 1);
  assert.equal(body.research_briefs_ingested_24h, 1);
  assert.equal(body.research_hypotheses_ingested_24h, 1);
  assert.equal(body.coverage_gaps_ingested_24h, 2);
  assert.equal(body.transcript_ingest_failures_24h, 1);
  assert.equal(body.research_ingest_failures_24h, 2);
  assert.equal(body.latest_transcript_ingested_at, t1);
  assert.equal(body.latest_research_artifact_at, t1);
  assert.equal(body.latest_research_claim_at, t2);
  assert.equal(body.summary.research_total_ingested_24h, 8);
  assert.equal(body.summary.total_ingest_failures_24h, 3);
  assert.deepEqual(body.missing_tables, []);

  await app.close();
});

test('GET /api/system/ingestion returns stable empty payload when tables exist but are empty', async () => {
  const app = await buildApp({
    supabase: createFakeSupabase(),
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/system/ingestion',
    headers: {
      'x-api-key': 'test-internal-key',
    },
  });

  assert.equal(response.statusCode, 200);

  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.transcripts_ingested_24h, 0);
  assert.equal(body.knowledge_docs_ingested_24h, 0);
  assert.equal(body.research_artifacts_ingested_24h, 0);
  assert.equal(body.research_claims_ingested_24h, 0);
  assert.equal(body.research_clusters_ingested_24h, 0);
  assert.equal(body.research_briefs_ingested_24h, 0);
  assert.equal(body.research_hypotheses_ingested_24h, 0);
  assert.equal(body.coverage_gaps_ingested_24h, 0);
  assert.equal(body.transcript_ingest_failures_24h, 0);
  assert.equal(body.research_ingest_failures_24h, 0);
  assert.equal(body.latest_transcript_ingested_at, null);
  assert.equal(body.latest_research_artifact_at, null);
  assert.equal(body.latest_research_claim_at, null);
  assert.equal(body.summary.research_total_ingested_24h, 0);
  assert.equal(body.summary.total_ingest_failures_24h, 0);

  await app.close();
});
