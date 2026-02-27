import { ENV } from '../env.js';
import { normalizeE164 } from '../util/normalize.js';
import { deterministicEventId } from '../util/idempotency.js';
import { storeProviderEvent } from '../util/provider-events.js';
import { getSourceIp } from '../util/request.js';
import { resolveChannelAccount } from '../util/tenant-resolver.js';
import {
  getOrCreateConversation,
  upsertContact,
  upsertMessage,
} from '../util/inbox-upsert.js';
import { updateMessageStatusByProviderRealId } from '../db_status.js';
import { runRouting } from '../util/route-conversation.js';
import { deadLetterWebhookError } from '../util/dead-letter.js';
import { verifyTwilioWebhookSignature } from '../lib/webhooks/twilio-signature.js';
import { extractTwilioExternalEventId } from '../lib/webhooks/external-event-id.js';
import { acceptWebhookEvent } from '../lib/webhooks/idempotency.js';
import { WEBHOOK_RATE_LIMIT } from '../util/rate-limit.js';

function isTrustedReplay(req) {
  return req.headers['x-replay'] === 'deadletter' && req.headers['x-api-key'] === ENV.INTERNAL_API_KEY;
}

function validateTwilioRequest(req) {
  if (isTrustedReplay(req)) return true;

  return verifyTwilioWebhookSignature({
    req,
    authToken: ENV.TWILIO_AUTH_TOKEN,
  });
}

function statusPayloadSummary(payload) {
  return {
    status: payload?.MessageStatus || null,
    error_code: payload?.ErrorCode || null,
    error_message: payload?.ErrorMessage || null,
  };
}

export async function twilioRoutes(fastify) {
  fastify.post('/webhooks/twilio/sms', {
    config: { rateLimit: WEBHOOK_RATE_LIMIT },
  }, async (req, reply) => {
    if (!validateTwilioRequest(req)) {
      return reply.code(401).send({ ok: false, error: 'Invalid Twilio signature' });
    }

    const payload = req.body || {};
    let tenantId = null;

    try {
      const receivedAt = new Date().toISOString();
      const providerMessageId = payload.MessageSid || deterministicEventId('twilio_sms', req.rawBody || JSON.stringify(payload));
      const from = normalizeE164(payload.From);
      const to = normalizeE164(payload.To);
      const sourceIp = getSourceIp(req);

      const channel = await resolveChannelAccount('twilio', to);
      tenantId = channel?.tenantId || null;

      const idempotency = await acceptWebhookEvent({
        tenantId,
        provider: 'twilio',
        externalEventId: extractTwilioExternalEventId(payload, req.rawBody || ''),
        payload,
      });

      if (idempotency.ignored) {
        return reply.code(200).send({ ok: true, ignored: true });
      }

      if (!channel) {
        await storeProviderEvent({
          tenant_id: null,
          provider: 'twilio',
          provider_event_id: providerMessageId,
          channel_external_id: to,
          event_type: 'inbound_message_unresolved',
          payload,
          normalized: { from, to, body: payload.Body || '' },
          signature_valid: true,
          source_ip: sourceIp,
          received_at: receivedAt,
        });

        return reply.code(200).send({ ok: true, unresolved: true });
      }

      const contactId = await upsertContact({
        tenantId: channel.tenantId,
        phoneE164: from,
        waNumber: null,
        fbPsid: null,
        displayName: null,
        channelAccountId: channel.channelAccountId,
        metadata: { provider: 'twilio', from, to },
      });

      const conversationId = await getOrCreateConversation({
        tenantId: channel.tenantId,
        channelAccountId: channel.channelAccountId,
        contactId,
        subject: `SMS ${from || ''}`.trim(),
        provider: 'twilio',
      });

      const message = await upsertMessage({
        tenantId: channel.tenantId,
        conversationId,
        provider: 'twilio',
        providerMessageId: `in:${providerMessageId}`,
        providerMessageIdReal: providerMessageId,
        direction: 'in',
        fromId: from,
        toId: to,
        body: payload.Body || '',
        content: { raw: payload },
        status: 'received',
        receivedAt,
      });

      await storeProviderEvent({
        tenant_id: channel.tenantId,
        provider: 'twilio',
        provider_event_id: providerMessageId,
        channel_external_id: to,
        event_type: 'inbound_message',
        payload,
        normalized: {
          conversation_id: conversationId,
          contact_id: contactId,
          from,
          to,
          body: payload.Body || '',
        },
        signature_valid: true,
        source_ip: sourceIp,
        received_at: receivedAt,
      });

      if (message) {
        try {
          await runRouting({ tenant_id: channel.tenantId, conversation_id: conversationId });
        } catch (error) {
          req.log.warn({ err: error, tenant_id: channel.tenantId, conversation_id: conversationId }, 'Auto routing failed for Twilio inbound message');
        }
      }

      return reply.code(200).send({ ok: true });
    } catch (error) {
      req.log.error({ err: error }, 'Twilio SMS webhook failed; dead-lettering payload');
      await deadLetterWebhookError({
        tenantId,
        provider: 'twilio',
        endpoint: '/webhooks/twilio/sms',
        req,
        payload,
        error,
      });
      return reply.code(200).send({ ok: false, dead_lettered: true });
    }
  });

  fastify.post('/webhooks/twilio/status', {
    config: { rateLimit: WEBHOOK_RATE_LIMIT },
  }, async (req, reply) => {
    if (!validateTwilioRequest(req)) {
      return reply.code(401).send({ ok: false, error: 'Invalid Twilio signature' });
    }

    const payload = req.body || {};
    let tenantId = null;

    try {
      const receivedAt = new Date().toISOString();
      const to = normalizeE164(payload.To);
      const from = normalizeE164(payload.From);
      const status = String(payload.MessageStatus || 'unknown').toLowerCase();
      const providerMessageId = payload.MessageSid || deterministicEventId('twilio_status', req.rawBody || JSON.stringify(payload));
      const providerEventId = `${providerMessageId}:${status}`;
      const sourceIp = getSourceIp(req);

      const channel = await resolveChannelAccount('twilio', to || from);
      tenantId = channel?.tenantId || null;

      const idempotency = await acceptWebhookEvent({
        tenantId,
        provider: 'twilio',
        externalEventId: extractTwilioExternalEventId(payload, req.rawBody || ''),
        payload,
      });

      if (idempotency.ignored) {
        return reply.code(200).send({ ok: true, ignored: true });
      }

      await storeProviderEvent({
        tenant_id: channel?.tenantId || null,
        provider: 'twilio',
        provider_event_id: providerEventId,
        channel_external_id: to || from,
        event_type: 'delivery_status',
        payload,
        normalized: {
          message_sid: payload.MessageSid || null,
          ...statusPayloadSummary(payload),
        },
        signature_valid: true,
        source_ip: sourceIp,
        received_at: receivedAt,
      });

      if (channel?.tenantId && payload.MessageSid) {
        await updateMessageStatusByProviderRealId({
          tenant_id: channel.tenantId,
          provider: 'twilio',
          provider_message_id_real: payload.MessageSid,
          status,
          error: payload.ErrorCode
            ? {
                code: payload.ErrorCode,
                message: payload.ErrorMessage || null,
              }
            : null,
          payload: statusPayloadSummary(payload),
        });
      }

      return reply.code(200).send({ ok: true });
    } catch (error) {
      req.log.error({ err: error }, 'Twilio status webhook failed; dead-lettering payload');
      await deadLetterWebhookError({
        tenantId,
        provider: 'twilio',
        endpoint: '/webhooks/twilio/status',
        req,
        payload,
        error,
      });
      return reply.code(200).send({ ok: false, dead_lettered: true });
    }
  });
}
