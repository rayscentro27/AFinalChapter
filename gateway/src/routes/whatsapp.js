import { ENV } from '../env.js';
import { normalizeE164 } from '../util/normalize.js';
import { deterministicEventId } from '../util/idempotency.js';
import { resolveChannelAccount } from '../util/tenant-resolver.js';
import { storeProviderEvent } from '../util/provider-events.js';
import { getSourceIp } from '../util/request.js';
import {
  getOrCreateConversation,
  upsertContact,
  upsertMessage,
} from '../util/inbox-upsert.js';
import { updateMessageStatusByProviderRealId } from '../db_status.js';
import { runRouting } from '../util/route-conversation.js';
import { deadLetterWebhookError } from '../util/dead-letter.js';
import { verifyWhatsAppWebhookSignature } from '../lib/webhooks/whatsapp-signature.js';
import { extractWhatsAppExternalEventId } from '../lib/webhooks/external-event-id.js';
import { acceptWebhookEvent } from '../lib/webhooks/idempotency.js';
import { WEBHOOK_RATE_LIMIT } from '../util/rate-limit.js';

function isTrustedReplay(req) {
  return req.headers['x-replay'] === 'deadletter' && req.headers['x-api-key'] === ENV.INTERNAL_API_KEY;
}

function verifyIncomingWhatsAppSignature(req) {
  if (isTrustedReplay(req)) return true;

  return verifyWhatsAppWebhookSignature({
    headers: req.headers,
    rawBody: req.rawBody || '',
    whatsappWebhookSecret: ENV.WHATSAPP_WEBHOOK_SECRET,
    metaAppSecret: ENV.META_APP_SECRET,
  });
}

function safeBodyFromWhatsAppMessage(message) {
  if (!message || typeof message !== 'object') return '';
  if (message?.text?.body) return String(message.text.body);
  if (message?.button?.text) return String(message.button.text);
  if (message?.interactive?.button_reply?.title) return String(message.interactive.button_reply.title);
  if (message?.interactive?.list_reply?.title) return String(message.interactive.list_reply.title);
  return '';
}

function extractChanges(payload) {
  const output = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      output.push({
        field: change?.field || null,
        value,
        phoneNumberId: value?.metadata?.phone_number_id ? String(value.metadata.phone_number_id) : null,
        displayPhoneNumber: value?.metadata?.display_phone_number ? String(value.metadata.display_phone_number) : null,
      });
    }
  }

  return output;
}

function statusPayloadSummary(statusObj) {
  return {
    status: statusObj?.status || null,
    recipient_id: statusObj?.recipient_id || null,
    conversation_id: statusObj?.conversation?.id || null,
    pricing: statusObj?.pricing || null,
  };
}

export async function whatsappRoutes(fastify) {
  fastify.get('/webhooks/whatsapp', async (req, reply) => {
    const query = req.query || {};
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === ENV.WHATSAPP_VERIFY_TOKEN) {
      return reply.code(200).send(challenge);
    }

    return reply.code(403).send('Forbidden');
  });

  fastify.post('/webhooks/whatsapp', {
    config: { rateLimit: WEBHOOK_RATE_LIMIT },
  }, async (req, reply) => {
    if (!verifyIncomingWhatsAppSignature(req)) {
      return reply.code(401).send({ ok: false, error: 'Invalid WhatsApp signature' });
    }

    const payload = req.body || {};
    let tenantId = null;

    try {
      const changes = extractChanges(payload);
      const sourceIp = getSourceIp(req);
      const receivedAt = new Date().toISOString();
      let processed = 0;

      const resolvedTenantIds = new Set();
      for (const change of changes) {
        const channel = change.phoneNumberId
          ? await resolveChannelAccount('whatsapp', change.phoneNumberId)
          : null;
        if (channel?.tenantId) resolvedTenantIds.add(channel.tenantId);
      }
      tenantId = resolvedTenantIds.values().next().value || null;

      const idempotency = await acceptWebhookEvent({
        tenantId,
        provider: 'whatsapp',
        externalEventId: extractWhatsAppExternalEventId(payload, req.rawBody || ''),
        payload,
      });

      if (idempotency.ignored) {
        return reply.code(200).send({ ok: true, ignored: true });
      }

      for (const change of changes) {
        const channel = change.phoneNumberId
          ? await resolveChannelAccount('whatsapp', change.phoneNumberId)
          : null;

        if (channel?.tenantId) tenantId = channel.tenantId;

        const contacts = Array.isArray(change.value?.contacts) ? change.value.contacts : [];
        const contactMap = new Map();
        for (const c of contacts) {
          const waId = String(c?.wa_id || '').trim();
          if (!waId) continue;
          contactMap.set(waId, String(c?.profile?.name || '').trim() || null);
        }

        const inboundMessages = Array.isArray(change.value?.messages) ? change.value.messages : [];
        for (const msg of inboundMessages) {
          const providerMessageId = String(msg?.id || '').trim() || deterministicEventId('whatsapp_message', JSON.stringify(msg));
          const fromWa = String(msg?.from || '').trim() || null;
          const fromE164 = normalizeE164(fromWa);
          const toId = change.displayPhoneNumber || change.phoneNumberId;
          const body = safeBodyFromWhatsAppMessage(msg);

          await storeProviderEvent({
            tenant_id: channel?.tenantId || null,
            provider: 'whatsapp',
            provider_event_id: providerMessageId,
            channel_external_id: change.phoneNumberId,
            event_type: 'inbound_message',
            payload,
            normalized: {
              phone_number_id: change.phoneNumberId,
              from: fromE164,
              to: toId,
              type: msg?.type || null,
              body,
            },
            signature_valid: true,
            source_ip: sourceIp,
            received_at: receivedAt,
          });

          if (!channel?.tenantId) continue;

          const contactId = await upsertContact({
            tenantId: channel.tenantId,
            phoneE164: fromE164,
            waNumber: fromE164,
            displayName: contactMap.get(fromWa) || null,
            channelAccountId: channel.channelAccountId,
            metadata: { provider: 'whatsapp', phone_number_id: change.phoneNumberId },
          });

          const conversationId = await getOrCreateConversation({
            tenantId: channel.tenantId,
            channelAccountId: channel.channelAccountId,
            contactId,
            subject: `WhatsApp ${fromE164 || ''}`.trim(),
            provider: 'whatsapp',
          });

          const message = await upsertMessage({
            tenantId: channel.tenantId,
            conversationId,
            provider: 'whatsapp',
            providerMessageId: `in:${providerMessageId}`,
            providerMessageIdReal: providerMessageId,
            direction: 'in',
            fromId: fromE164,
            toId,
            body,
            content: { type: msg?.type || null, raw: msg },
            status: 'received',
            receivedAt,
          });

          if (message) {
            try {
              await runRouting({ tenant_id: channel.tenantId, conversation_id: conversationId });
            } catch (error) {
              req.log.warn({ err: error, tenant_id: channel.tenantId, conversation_id: conversationId }, 'Auto routing failed for WhatsApp inbound message');
            }
          }

          processed += 1;
        }

        const statuses = Array.isArray(change.value?.statuses) ? change.value.statuses : [];
        for (const st of statuses) {
          const messageSid = String(st?.id || '').trim();
          const status = String(st?.status || 'unknown').trim().toLowerCase();
          const eventId = messageSid
            ? `${messageSid}:${status}`
            : deterministicEventId('whatsapp_status', JSON.stringify(st));

          await storeProviderEvent({
            tenant_id: channel?.tenantId || null,
            provider: 'whatsapp',
            provider_event_id: eventId,
            channel_external_id: change.phoneNumberId,
            event_type: 'delivery_status',
            payload,
            normalized: {
              phone_number_id: change.phoneNumberId,
              message_id: messageSid || null,
              ...statusPayloadSummary(st),
            },
            signature_valid: true,
            source_ip: sourceIp,
            received_at: receivedAt,
          });

          if (channel?.tenantId && messageSid) {
            await updateMessageStatusByProviderRealId({
              tenant_id: channel.tenantId,
              provider: 'whatsapp',
              provider_message_id_real: messageSid,
              status,
              error: status === 'failed'
                ? { pricing: st?.pricing || null, conversation: st?.conversation || null }
                : null,
              payload: statusPayloadSummary(st),
            });
          }
        }
      }

      if (processed === 0 && changes.length === 0) {
        const fallbackId = deterministicEventId('whatsapp_webhook', req.rawBody || JSON.stringify(payload));
        await storeProviderEvent({
          tenant_id: null,
          provider: 'whatsapp',
          provider_event_id: fallbackId,
          channel_external_id: null,
          event_type: 'whatsapp_webhook',
          payload,
          normalized: {},
          signature_valid: true,
          source_ip: sourceIp,
          received_at: receivedAt,
        });
      }

      return reply.code(200).send({ ok: true, processed });
    } catch (error) {
      req.log.error({ err: error }, 'WhatsApp webhook failed; dead-lettering payload');
      await deadLetterWebhookError({
        tenantId,
        provider: 'whatsapp',
        endpoint: '/webhooks/whatsapp',
        req,
        payload,
        error,
      });
      return reply.code(200).send({ ok: false, dead_lettered: true });
    }
  });
}
