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

const { tradingviewRoutes } = await import('../src/routes/tradingview.js');

test('GET /api/webhooks/tradingview/health requires internal API key', async () => {
  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(tradingviewRoutes, {
    deps: {
      supabaseAdmin: {},
    },
  });

  const unauthorized = await app.inject({
    method: 'GET',
    url: '/api/webhooks/tradingview/health',
  });
  assert.equal(unauthorized.statusCode, 401);
  assert.deepEqual(unauthorized.json(), { ok: false, error: 'unauthorized' });

  const authorized = await app.inject({
    method: 'GET',
    url: '/api/webhooks/tradingview/health',
    headers: { 'x-api-key': 'test-internal-key' },
  });
  assert.equal(authorized.statusCode, 200);

  const body = authorized.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'tradingview_webhook_intake');

  await app.close();
});
