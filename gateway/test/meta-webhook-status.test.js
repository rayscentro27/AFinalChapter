import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

const { metaRoutes } = await import('../src/routes/meta.js');

function signMeta(raw) {
  const digest = crypto
    .createHmac('sha256', process.env.META_APP_SECRET)
    .update(raw)
    .digest('hex');

  return `sha256=${digest}`;
}

async function buildApp(deps = {}) {
  const app = Fastify({ logger: false, trustProxy: true });

  const mergedDeps = {
    maybeCaptureMetaSample: async () => false,
    ...deps,
  };

  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    req.rawBody = body?.toString('utf8') || '';
    try {
      done(null, JSON.parse(req.rawBody || '{}'));
    } catch (error) {
      done(error);
    }
  });

  await app.register(metaRoutes, { deps: mergedDeps });
  return app;
}

test('POST /webhooks/meta returns 401 when signature is invalid', async () => {
  const app = await buildApp({
    storeProviderEvent: async () => {
      throw new Error('storeProviderEvent should not be called on invalid signature');
    },
  });

  const payload = {
    object: 'page',
    entry: [{ id: 'PAGE_1' }],
  };

  const response = await app.inject({
    method: 'POST',
    url: '/webhooks/meta',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': 'sha256=invalid',
    },
    payload: JSON.stringify(payload),
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { ok: false, error: 'Invalid Meta signature' });

  await app.close();
});

test('POST /webhooks/meta processes delivery/read/status callbacks and updates message state', async () => {
  const storeEvents = [];
  const statusUpdates = [];
  const watermarkReads = [];
  const resolvedConversationLookups = [];

  const app = await buildApp({
    getSourceIp: () => '127.0.0.1',
    resolveChannelAccount: async () => ({ tenantId: 'tenant-1', channelAccountId: 'channel-1' }),
    storeProviderEvent: async (event) => {
      storeEvents.push(event);
    },
    updateMessageStatusByProviderRealId: async (input) => {
      statusUpdates.push(input);
    },
    markMessagesReadByRecipientWatermark: async () => {
      throw new Error('markMessagesReadByRecipientWatermark should not run when conversation resolver succeeds');
    },
    resolveConversationIdByMetaParticipants: async (input) => {
      resolvedConversationLookups.push(input);
      return 'convo-meta-1';
    },
    markConversationMessagesReadByWatermark: async (input) => {
      watermarkReads.push(input);
      return 1;
    },
    upsertContact: async () => {
      throw new Error('upsertContact should not run for status-only payload');
    },
    getOrCreateConversation: async () => {
      throw new Error('getOrCreateConversation should not run for status-only payload');
    },
    upsertMessage: async () => {
      throw new Error('upsertMessage should not run for status-only payload');
    },
    runRouting: async () => {
      throw new Error('runRouting should not run for status-only payload');
    },
  });

  const payload = {
    object: 'page',
    entry: [
      {
        id: 'PAGE_1',
        messaging: [
          {
            sender: { id: 'USER_1' },
            recipient: { id: 'PAGE_1' },
            delivery: { mids: ['mid_delivery_1', 'mid_delivery_2'] },
            read: { mids: ['mid_read_1'], watermark: 1700000000 },
          },
        ],
        changes: [
          {
            field: 'messages',
            value: {
              recipient: { id: 'PAGE_1' },
              sender: { id: 'USER_1' },
              delivery: { mids: ['mid_change_delivery'] },
              read: { mids: ['mid_change_read'], watermark: 1700000100 },
              statuses: [
                { id: 'mid_status_delivered', status: 'delivered' },
                { id: 'mid_status_failed', status: 'error' },
              ],
            },
          },
        ],
      },
    ],
  };

  const raw = JSON.stringify(payload);

  const response = await app.inject({
    method: 'POST',
    url: '/webhooks/meta',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signMeta(raw),
    },
    payload: raw,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);
  assert.equal(response.json().processed, 15);

  assert.equal(storeEvents.length, 6);
  assert.equal(statusUpdates.length, 7);
  assert.equal(watermarkReads.length, 2);
  assert.equal(resolvedConversationLookups.length, 2);
  assert.equal(watermarkReads[0].conversation_id, 'convo-meta-1');
  assert.equal(watermarkReads[1].conversation_id, 'convo-meta-1');

  assert.deepEqual(
    statusUpdates.map((x) => ({ id: x.provider_message_id_real, status: x.status })),
    [
      { id: 'mid_delivery_1', status: 'delivered' },
      { id: 'mid_delivery_2', status: 'delivered' },
      { id: 'mid_read_1', status: 'read' },
      { id: 'mid_change_delivery', status: 'delivered' },
      { id: 'mid_change_read', status: 'read' },
      { id: 'mid_status_delivered', status: 'delivered' },
      { id: 'mid_status_failed', status: 'failed' },
    ]
  );

  await app.close();
});

test('POST /webhooks/meta handles IG-style changes status payloads with message_id and read watermark fallback', async () => {
  const statusUpdates = [];
  const watermarkReads = [];
  const resolvedConversationLookups = [];

  const app = await buildApp({
    getSourceIp: () => '127.0.0.1',
    resolveChannelAccount: async () => ({ tenantId: 'tenant-ig', channelAccountId: 'channel-ig' }),
    storeProviderEvent: async () => {},
    updateMessageStatusByProviderRealId: async (input) => {
      statusUpdates.push(input);
    },
    markMessagesReadByRecipientWatermark: async () => {
      throw new Error('markMessagesReadByRecipientWatermark should not run when conversation resolver succeeds');
    },
    resolveConversationIdByMetaParticipants: async (input) => {
      resolvedConversationLookups.push(input);
      return 'convo-ig-1';
    },
    markConversationMessagesReadByWatermark: async (input) => {
      watermarkReads.push(input);
      return 1;
    },
    upsertContact: async () => {
      throw new Error('upsertContact should not run for status-only payload');
    },
    getOrCreateConversation: async () => {
      throw new Error('getOrCreateConversation should not run for status-only payload');
    },
    upsertMessage: async () => {
      throw new Error('upsertMessage should not run for status-only payload');
    },
    runRouting: async () => {
      throw new Error('runRouting should not run for status-only payload');
    },
  });

  const payload = {
    object: 'instagram',
    entry: [
      {
        id: '17841480265043148',
        time: 1700000200,
        changes: [
          {
            field: 'messages',
            value: {
              status: 'delivered',
              message_id: 'ig_msg_1',
              recipient: { id: '17841480265043148' },
            },
          },
          {
            field: 'messages',
            value: {
              status: 'read',
              message_id: 'ig_msg_2',
              from: { id: 'IG_USER_1' },
              recipient: { id: '17841480265043148' },
              timestamp: 1700000300,
            },
          },
        ],
      },
    ],
  };

  const raw = JSON.stringify(payload);

  const response = await app.inject({
    method: 'POST',
    url: '/webhooks/meta',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signMeta(raw),
    },
    payload: raw,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);

  assert.deepEqual(
    statusUpdates.map((x) => ({ id: x.provider_message_id_real, status: x.status })),
    [
      { id: 'ig_msg_1', status: 'delivered' },
      { id: 'ig_msg_2', status: 'read' },
    ]
  );

  assert.equal(watermarkReads.length, 1);
  assert.equal(watermarkReads[0].conversation_id, 'convo-ig-1');
  assert.equal(resolvedConversationLookups.length, 1);
  assert.equal(resolvedConversationLookups[0].senderId, 'IG_USER_1');

  await app.close();
});

test('POST /webhooks/meta handles exact IG sample shape with sender.id + top-level watermark', async () => {
  const statusUpdates = [];
  const watermarkReads = [];
  const resolvedConversationLookups = [];

  const app = await buildApp({
    getSourceIp: () => '127.0.0.1',
    resolveChannelAccount: async () => ({ tenantId: 'tenant-ig', channelAccountId: 'channel-ig' }),
    storeProviderEvent: async () => {},
    updateMessageStatusByProviderRealId: async (input) => {
      statusUpdates.push(input);
    },
    markMessagesReadByRecipientWatermark: async () => {
      throw new Error('markMessagesReadByRecipientWatermark should not run when conversation resolver succeeds');
    },
    resolveConversationIdByMetaParticipants: async (input) => {
      resolvedConversationLookups.push(input);
      return 'convo-ig-2';
    },
    markConversationMessagesReadByWatermark: async (input) => {
      watermarkReads.push(input);
      return 1;
    },
    upsertContact: async () => {
      throw new Error('upsertContact should not run for status-only payload');
    },
    getOrCreateConversation: async () => {
      throw new Error('getOrCreateConversation should not run for status-only payload');
    },
    upsertMessage: async () => {
      throw new Error('upsertMessage should not run for status-only payload');
    },
    runRouting: async () => {
      throw new Error('runRouting should not run for status-only payload');
    },
  });

  const payload = {
    object: 'instagram',
    entry: [
      {
        id: '17841480265043148',
        time: 1771969257632,
        changes: [
          {
            field: 'messages',
            value: {
              sender: { id: 'IG_USER_2' },
              status: 'delivered',
              recipient: { id: '17841480265043148' },
              timestamp: 1771969257632,
              message_id: 'ig.live.1771969257632',
            },
          },
          {
            field: 'messages',
            value: {
              sender: { id: 'IG_USER_2' },
              status: 'read',
              recipient: { id: '17841480265043148' },
              timestamp: 1771969258332,
              watermark: 1771969258332,
            },
          },
        ],
      },
    ],
  };

  const raw = JSON.stringify(payload);
  const response = await app.inject({
    method: 'POST',
    url: '/webhooks/meta',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signMeta(raw),
    },
    payload: raw,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);

  assert.deepEqual(
    statusUpdates.map((x) => ({ id: x.provider_message_id_real, status: x.status })),
    [
      { id: 'ig.live.1771969257632', status: 'delivered' },
    ]
  );

  assert.equal(watermarkReads.length, 1);
  assert.equal(watermarkReads[0].conversation_id, 'convo-ig-2');
  assert.equal(resolvedConversationLookups.length, 1);
  assert.equal(resolvedConversationLookups[0].senderId, 'IG_USER_2');
  assert.equal(resolvedConversationLookups[0].recipientId, '17841480265043148');

  await app.close();
});
