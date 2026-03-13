import { randomUUID } from 'node:crypto';
import { ENV } from '../env.js';
import { insertMessage } from '../db.js';
import {
  getConversationOrThrow,
  getChannelAccountOrThrow,
  markMessageFailed,
  setMessageStatus,
  setProviderRealId,
} from '../db_send.js';
import { twilioSendSMS } from '../providers/twilio.js';
import { whatsappSendText } from '../providers/whatsapp.js';
import { metaSendText } from '../providers/meta.js';

function requireApiKey(req, reply) {
  const key = req.headers['x-api-key'];
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    reply.code(401).send({ ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

function internalOutboundKey() {
  return `out:${randomUUID()}`;
}

function requiredFields(body, fields) {
  for (const field of fields) {
    if (!body?.[field]) return field;
  }
  return null;
}

export async function sendRoutes(fastify) {
  fastify.post('/send/sms', async (req, reply) => {
    if (!requireApiKey(req, reply)) return;

    if (ENV.SAFE_MODE) {
      return reply.code(503).send({ ok: false, error: 'safe_mode_enabled', message: 'Outbound sending is disabled while SAFE_MODE=true' });
    }

    const body = req.body || {};
    const missing = requiredFields(body, ['tenant_id', 'conversation_id', 'to', 'text']);
    if (missing) {
      return reply.code(400).send({ ok: false, error: `Missing ${missing}` });
    }

    const { tenant_id, conversation_id, to, text } = body;
    const convo = await getConversationOrThrow({ tenant_id, conversation_id });

    const message_id = await insertMessage({
      tenant_id,
      conversation_id: convo.id,
      direction: 'out',
      provider: 'twilio',
      provider_message_id: internalOutboundKey(),
      provider_message_id_real: null,
      from_id: ENV.TWILIO_FROM_NUMBER,
      to_id: String(to),
      body: String(text),
      content: {},
      status: 'queued',
      received_at: new Date().toISOString(),
    });

    if (!message_id) {
      return reply.code(500).send({ ok: false, error: 'Failed to create queued message row' });
    }

    try {
      const sent = await twilioSendSMS({ to: String(to), body: String(text) });
      await setProviderRealId({
        tenant_id,
        message_id,
        provider_message_id_real: sent.provider_message_id,
      });
      await setMessageStatus({ tenant_id, message_id, status: 'sent' });

      return reply.send({ ok: true, message_id, provider_message_id_real: sent.provider_message_id, raw: sent.raw });
    } catch (error) {
      await markMessageFailed({
        tenant_id,
        message_id,
        errorPayload: { message: String(error?.message || error) },
      });

      return reply.code(502).send({
        ok: false,
        error: 'Twilio send failed',
        details: String(error?.message || error),
        message_id,
      });
    }
  });

  fastify.post('/send/whatsapp', async (req, reply) => {
    if (!requireApiKey(req, reply)) return;

    if (ENV.SAFE_MODE) {
      return reply.code(503).send({ ok: false, error: 'safe_mode_enabled', message: 'Outbound sending is disabled while SAFE_MODE=true' });
    }

    const body = req.body || {};
    const missing = requiredFields(body, ['tenant_id', 'conversation_id', 'to', 'text']);
    if (missing) {
      return reply.code(400).send({ ok: false, error: `Missing ${missing}` });
    }

    const { tenant_id, conversation_id, to, text } = body;
    const convo = await getConversationOrThrow({ tenant_id, conversation_id });
    const channel = await getChannelAccountOrThrow({ tenant_id, channel_account_id: convo.channel_account_id });

    if (channel.provider !== 'whatsapp') {
      return reply.code(400).send({ ok: false, error: 'Conversation is not on WhatsApp channel account' });
    }

    const phone_number_id = channel.external_account_id;

    const message_id = await insertMessage({
      tenant_id,
      conversation_id: convo.id,
      direction: 'out',
      provider: 'whatsapp',
      provider_message_id: internalOutboundKey(),
      provider_message_id_real: null,
      from_id: String(phone_number_id),
      to_id: String(to),
      body: String(text),
      content: {},
      status: 'queued',
      received_at: new Date().toISOString(),
    });

    if (!message_id) {
      return reply.code(500).send({ ok: false, error: 'Failed to create queued message row' });
    }

    try {
      const sent = await whatsappSendText({ phone_number_id, to: String(to), body: String(text) });
      await setProviderRealId({
        tenant_id,
        message_id,
        provider_message_id_real: sent.provider_message_id,
      });
      await setMessageStatus({ tenant_id, message_id, status: 'sent' });

      return reply.send({ ok: true, message_id, provider_message_id_real: sent.provider_message_id, raw: sent.raw });
    } catch (error) {
      await markMessageFailed({
        tenant_id,
        message_id,
        errorPayload: { message: String(error?.message || error) },
      });

      return reply.code(502).send({
        ok: false,
        error: 'WhatsApp send failed',
        details: String(error?.message || error),
        message_id,
      });
    }
  });

  fastify.post('/send/meta', async (req, reply) => {
    if (!requireApiKey(req, reply)) return;

    if (ENV.SAFE_MODE) {
      return reply.code(503).send({ ok: false, error: 'safe_mode_enabled', message: 'Outbound sending is disabled while SAFE_MODE=true' });
    }

    const body = req.body || {};
    const missing = requiredFields(body, ['tenant_id', 'conversation_id', 'recipient_id', 'text']);
    if (missing) {
      return reply.code(400).send({ ok: false, error: `Missing ${missing}` });
    }

    const { tenant_id, conversation_id, recipient_id, text } = body;
    const convo = await getConversationOrThrow({ tenant_id, conversation_id });
    const channel = await getChannelAccountOrThrow({ tenant_id, channel_account_id: convo.channel_account_id });

    if (channel.provider !== 'meta') {
      return reply.code(400).send({ ok: false, error: 'Conversation is not on Meta channel account' });
    }

    const message_id = await insertMessage({
      tenant_id,
      conversation_id: convo.id,
      direction: 'out',
      provider: 'meta',
      provider_message_id: internalOutboundKey(),
      provider_message_id_real: null,
      from_id: String(channel.external_account_id),
      to_id: String(recipient_id),
      body: String(text),
      content: {},
      status: 'queued',
      received_at: new Date().toISOString(),
    });

    if (!message_id) {
      return reply.code(500).send({ ok: false, error: 'Failed to create queued message row' });
    }

    try {
      const sent = await metaSendText({ recipient_id: String(recipient_id), text: String(text) });
      await setProviderRealId({
        tenant_id,
        message_id,
        provider_message_id_real: sent.provider_message_id,
      });
      await setMessageStatus({ tenant_id, message_id, status: 'sent' });

      return reply.send({ ok: true, message_id, provider_message_id_real: sent.provider_message_id, raw: sent.raw });
    } catch (error) {
      await markMessageFailed({
        tenant_id,
        message_id,
        errorPayload: { message: String(error?.message || error) },
      });

      return reply.code(502).send({
        ok: false,
        error: 'Meta send failed',
        details: String(error?.message || error),
        message_id,
      });
    }
  });
}
