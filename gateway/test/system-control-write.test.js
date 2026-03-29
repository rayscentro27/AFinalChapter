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

const { systemHealthRoutes } = await import('../src/routes/system_health.js');
const { ENV } = await import('../src/env.js');
const { supabaseAdmin } = await import('../src/supabase.js');
const { clearPermissionCache } = await import('../src/lib/auth/permissions.js');
const { clearTenantAuthSettingsCache } = await import('../src/lib/auth/tenantAuthSettings.js');
const { resetSystemControlSnapshots } = await import('../src/system/controlPlaneState.js');

const CONTROL_KEYS = [
  'SYSTEM_MODE',
  'QUEUE_ENABLED',
  'AI_JOBS_ENABLED',
  'RESEARCH_JOBS_ENABLED',
  'NOTIFICATIONS_ENABLED',
  'JOB_MAX_RUNTIME_SECONDS',
  'WORKER_MAX_CONCURRENCY',
  'TENANT_JOB_LIMIT_ACTIVE',
];

const BASE_CONTROL_STATE = CONTROL_KEYS.reduce((acc, key) => {
  acc[key] = ENV[key];
  return acc;
}, {});

function restoreControlState() {
  for (const [key, value] of Object.entries(BASE_CONTROL_STATE)) {
    ENV[key] = value;
  }
}

function missingSchemaError(table) {
  return {
    message: `relation \"${table}\" does not exist`,
  };
}

function buildSupabaseMock({ auditSink, tenantId = 'tenant-1', userId = 'user-1', role = 'admin' } = {}) {
  const originalFrom = supabaseAdmin.from;

  supabaseAdmin.from = (table) => {
    const state = {
      table,
      filters: {},
      selected: null,
    };

    const builder = {
      select(value) {
        state.selected = value;
        return builder;
      },
      eq(column, value) {
        state.filters[column] = value;
        return builder;
      },
      limit(value) {
        if (table === 'tenant_memberships' && !state.filters.user_id) {
          return Promise.resolve({ data: [{ tenant_id: tenantId }], error: null });
        }
        if (table === 'tenant_role_permissions') {
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: [], error: null });
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
            data: {
              tenant_id: tenantId,
              user_id: userId,
              role,
              role_id: null,
            },
            error: null,
          });
        }

        if (table === 'tenant_members') {
          return Promise.resolve({ data: null, error: null });
        }

        if (table === 'tenant_roles') {
          return Promise.resolve({ data: null, error: missingSchemaError('tenant_roles') });
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

  return () => {
    supabaseAdmin.from = originalFrom;
  };
}

async function issueToken({ sub = 'user-1', email = 'admin@goclearonline.cc' } = {}) {
  const secret = new TextEncoder().encode(String(process.env.SUPABASE_JWT_SECRET || 'test-jwt-secret'));
  return new SignJWT({
    email,
    email_verified: true,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

test.afterEach(() => {
  clearPermissionCache();
  clearTenantAuthSettingsCache();
  resetSystemControlSnapshots();
  restoreControlState();
});

test('POST /api/system/mode/set requires bearer auth in addition to internal API key', async () => {
  const auditSink = [];
  const restoreFrom = buildSupabaseMock({ auditSink });

  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(systemHealthRoutes);

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/system/mode/set',
      headers: {
        'x-api-key': 'test-internal-key',
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        tenant_id: 'tenant-1',
        mode: 'maintenance',
      }),
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().ok, false);
    assert.equal(response.json().error, 'missing_authorization');
  } finally {
    await app.close();
    restoreFrom();
  }
});

test('POST /api/system/mode/set updates mode and writes audit event', async () => {
  const auditSink = [];
  const restoreFrom = buildSupabaseMock({ auditSink });
  const token = await issueToken();

  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(systemHealthRoutes);

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/system/mode/set',
      headers: {
        'x-api-key': 'test-internal-key',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        tenant_id: 'tenant-1',
        mode: 'maintenance',
      }),
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();

    assert.equal(body.ok, true);
    assert.equal(body.current.system_mode, 'maintenance');
    assert.ok(body.changed.system_mode);

    assert.equal(auditSink.length, 1);
    assert.equal(auditSink[0].action, 'system_mode_set');
    assert.equal(auditSink[0].tenant_id, 'tenant-1');
    assert.equal(auditSink[0].actor_user_id, 'user-1');
    assert.equal(auditSink[0].entity_type, 'system_control');
  } finally {
    await app.close();
    restoreFrom();
  }
});

test('POST /api/system/flags/update rejects empty patch', async () => {
  const auditSink = [];
  const restoreFrom = buildSupabaseMock({ auditSink });
  const token = await issueToken();

  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(systemHealthRoutes);

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/system/flags/update',
      headers: {
        'x-api-key': 'test-internal-key',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        tenant_id: 'tenant-1',
      }),
    });

    assert.equal(response.statusCode, 400);
    const body = response.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, 'no_flags_provided');
    assert.equal(auditSink.length, 0);
  } finally {
    await app.close();
    restoreFrom();
  }
});

test('POST /api/system/safe-pause then /api/system/safe-resume restores prior state with audit trail', async () => {
  const auditSink = [];
  const restoreFrom = buildSupabaseMock({ auditSink });
  const token = await issueToken();

  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(systemHealthRoutes);

  try {
    const pause = await app.inject({
      method: 'POST',
      url: '/api/system/safe-pause',
      headers: {
        'x-api-key': 'test-internal-key',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        tenant_id: 'tenant-1',
        reason: 'incident containment',
        disable_notifications: true,
      }),
    });

    assert.equal(pause.statusCode, 200);
    const pauseBody = pause.json();
    assert.equal(pauseBody.ok, true);
    assert.equal(pauseBody.current.system_mode, 'maintenance');
    assert.equal(pauseBody.current.queue_enabled, false);
    assert.equal(pauseBody.current.ai_jobs_enabled, false);
    assert.equal(pauseBody.current.research_jobs_enabled, false);
    assert.equal(pauseBody.current.notifications_enabled, false);

    const resume = await app.inject({
      method: 'POST',
      url: '/api/system/safe-resume',
      headers: {
        'x-api-key': 'test-internal-key',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        tenant_id: 'tenant-1',
        reason: 'incident resolved',
      }),
    });

    assert.equal(resume.statusCode, 200);
    const resumeBody = resume.json();
    assert.equal(resumeBody.ok, true);
    assert.equal(resumeBody.current.system_mode, BASE_CONTROL_STATE.SYSTEM_MODE);
    assert.equal(resumeBody.current.queue_enabled, Boolean(BASE_CONTROL_STATE.QUEUE_ENABLED));

    assert.equal(auditSink.length, 2);
    assert.equal(auditSink[0].action, 'system_safe_pause');
    assert.equal(auditSink[1].action, 'system_safe_resume');
  } finally {
    await app.close();
    restoreFrom();
  }
});
