import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { SignJWT } from 'jose';

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

const { researchRoutes } = await import('../src/routes/research.js');
const { supabaseAdmin } = await import('../src/supabase.js');
const { clearTenantAuthSettingsCache } = await import('../src/lib/auth/tenantAuthSettings.js');

function missingSchemaError(table) {
  return { message: `relation "${table}" does not exist` };
}

function buildSupabaseMock({ signalRow = null, role = 'admin', tenantId = 'tenant-1', userId = 'user-1', auditSink = [] } = {}) {
  const originalFrom = supabaseAdmin.from;
  let currentSignalRow = signalRow ? { ...signalRow } : null;

  supabaseAdmin.from = (table) => {
    const state = {
      table,
      filters: {},
      pendingUpdate: null,
    };

    const builder = {
      select() {
        return builder;
      },
      eq(column, value) {
        state.filters[column] = value;
        return builder;
      },
      maybeSingle() {
        if (table === 'tenant_auth_settings') {
          return Promise.resolve({ data: null, error: missingSchemaError('tenant_auth_settings') });
        }

        if (table === 'tenant_memberships') {
          if (state.filters.tenant_id !== tenantId || state.filters.user_id !== userId) {
            return Promise.resolve({ data: null, error: null });
          }

          return Promise.resolve({
            data: { tenant_id: tenantId, user_id: userId, role, role_id: null },
            error: null,
          });
        }

        if (table === 'tenant_members') {
          return Promise.resolve({ data: null, error: null });
        }

        if (table === 'reviewed_signal_proposals') {
          if (!currentSignalRow) return Promise.resolve({ data: null, error: null });
          if (state.filters.tenant_id !== currentSignalRow.tenant_id || state.filters.id !== currentSignalRow.id) {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: currentSignalRow, error: null });
        }

        return Promise.resolve({ data: null, error: null });
      },
      update(payload) {
        state.pendingUpdate = payload;
        return builder;
      },
      single() {
        if (table === 'reviewed_signal_proposals' && state.pendingUpdate && currentSignalRow) {
          currentSignalRow = {
            ...currentSignalRow,
            ...state.pendingUpdate,
            meta: state.pendingUpdate.meta || currentSignalRow.meta,
          };
          return Promise.resolve({ data: currentSignalRow, error: null });
        }

        return Promise.resolve({ data: null, error: null });
      },
      insert(payload) {
        if (table === 'audit_events') {
          auditSink.push(payload);
        }
        return Promise.resolve({ error: null });
      },
    };

    return builder;
  };

  return {
    restore() {
      supabaseAdmin.from = originalFrom;
    },
    getSignalRow() {
      return currentSignalRow;
    },
  };
}

async function issueToken({ sub = 'user-1', email = 'admin@goclearonline.cc' } = {}) {
  const secret = new TextEncoder().encode(String(process.env.SUPABASE_JWT_SECRET || 'test-jwt-secret'));
  return new SignJWT({ email, email_verified: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

test.afterEach(() => {
  clearTenantAuthSettingsCache();
});

test('POST /api/internal/review/signals/:id/publish requires bearer auth', async () => {
  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(researchRoutes);

  const response = await app.inject({
    method: 'POST',
    url: '/api/internal/review/signals/11111111-1111-1111-1111-111111111111/publish',
    headers: {
      'x-api-key': 'test-internal-key',
      'content-type': 'application/json',
    },
    payload: JSON.stringify({ tenant_id: 'tenant-1' }),
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().ok, false);
  assert.equal(response.json().error, 'missing_authorization');

  await app.close();
});

test('POST /api/internal/review/signals/:id/publish rejects non-approved content', async () => {
  const auditSink = [];
  const mocked = buildSupabaseMock({
    auditSink,
    signalRow: {
      id: '11111111-1111-1111-1111-111111111111',
      tenant_id: 'tenant-1',
      proposal_key: 'sig-1',
      strategy_id: 'strat-1',
      asset_type: 'forex',
      symbol: 'EURUSD',
      timeframe: '1H',
      side: 'buy',
      approval_status: 'pending',
      status: 'proposed',
      summary: 'summary',
      rationale: 'rationale',
      is_published: false,
      published_at: null,
      expires_at: null,
      expired_at: null,
      created_at: '2026-03-22T00:00:00.000Z',
      updated_at: '2026-03-22T00:00:00.000Z',
      meta: {},
    },
  });

  const token = await issueToken();
  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(researchRoutes);

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/review/signals/11111111-1111-1111-1111-111111111111/publish',
      headers: {
        'x-api-key': 'test-internal-key',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ tenant_id: 'tenant-1' }),
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().ok, false);
    assert.equal(response.json().reason, 'review_not_approved');
    assert.equal(auditSink.length, 0);
  } finally {
    await app.close();
    mocked.restore();
  }
});

test('POST /api/internal/review/signals/:id/publish updates lifecycle state and audits', async () => {
  const auditSink = [];
  const mocked = buildSupabaseMock({
    auditSink,
    signalRow: {
      id: '11111111-1111-1111-1111-111111111111',
      tenant_id: 'tenant-1',
      proposal_key: 'sig-1',
      strategy_id: 'strat-1',
      asset_type: 'forex',
      symbol: 'EURUSD',
      timeframe: '1H',
      side: 'buy',
      approval_status: 'approved',
      status: 'approved',
      summary: 'summary',
      rationale: 'rationale',
      is_published: false,
      published_at: null,
      expires_at: null,
      expired_at: null,
      created_at: '2026-03-22T00:00:00.000Z',
      updated_at: '2026-03-22T00:00:00.000Z',
      meta: {},
    },
  });

  const token = await issueToken();
  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(researchRoutes);

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/review/signals/11111111-1111-1111-1111-111111111111/publish',
      headers: {
        'x-api-key': 'test-internal-key',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ tenant_id: 'tenant-1', notes: 'Ready for portal' }),
    });

    const body = response.json();
    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(body.action, 'publish');
    assert.equal(body.item.is_published, true);
    assert.equal(body.item.published, true);
    assert.equal(auditSink.length, 1);
    assert.equal(auditSink[0].action, 'research_review_publish');
    assert.equal(mocked.getSignalRow().is_published, true);
  } finally {
    await app.close();
    mocked.restore();
  }
});