import { ENV } from '../env.js';
import { deterministicEventId } from '../util/idempotency.js';
import { storeProviderEvent } from '../util/provider-events.js';
import { verifyMetaWebhookSignature } from '../lib/webhooks/meta-signature.js';
import { extractMetaExternalEventId } from '../lib/webhooks/external-event-id.js';
import { acceptWebhookEvent } from '../lib/webhooks/idempotency.js';
import { WEBHOOK_RATE_LIMIT } from '../util/rate-limit.js';
import { getSourceIp } from '../util/request.js';
import { resolveChannelAccount } from '../util/tenant-resolver.js';
import {
  getOrCreateConversation,
  upsertContact,
  upsertMessage,
} from '../util/inbox-upsert.js';
import { runRouting } from '../util/route-conversation.js';
import {
  updateMessageStatusByProviderRealId,
  markMessagesReadByRecipientWatermark,
  markConversationMessagesReadByWatermark,
} from '../db_status.js';
import { deadLetterWebhookError } from '../util/dead-letter.js';
import {
  resolveConversationIdByMetaParticipants,
  upsertMetaParticipant,
} from '../util/meta-participants.js';
import { handleMetaStatusCallbacks } from '../providers/meta_status_callbacks.js';
import { maybeCaptureMetaSample } from '../util/meta-sample-capture.js';

function isTrustedReplay(req, deps) {
  return req.headers['x-replay'] === 'deadletter' && req.headers['x-api-key'] === deps.env.INTERNAL_API_KEY;
}

function verifyMetaSignature(req, deps) {
  if (isTrustedReplay(req, deps)) return true;

  return verifyMetaWebhookSignature({
    headers: req.headers,
    rawBody: req.rawBody || '',
    appSecret: deps.env.META_APP_SECRET,
  });
}

function asString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function extractText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (payload?.text?.body) return String(payload.text.body);
  if (payload?.text) return String(payload.text);
  if (payload?.message?.text) return String(payload.message.text);
  if (payload?.message?.body) return String(payload.message.body);
  return '';
}

function getMetaEntries(payload) {
  return Array.isArray(payload?.entry) ? payload.entry : [];
}

function getChanges(entry) {
  return Array.isArray(entry?.changes) ? entry.changes : [];
}

function getMessagingEvents(entry) {
  return Array.isArray(entry?.messaging) ? entry.messaging : [];
}

async function resolveMetaWebhookTenantHint(payload, deps) {
  const entries = getMetaEntries(payload);

  for (const entry of entries) {
    const entryId = asString(entry?.id);
    if (entryId) {
      const channel = await deps.resolveChannelAccount('meta', entryId);
      if (channel?.tenantId) return channel.tenantId;
    }

    const changes = getChanges(entry);
    for (const change of changes) {
      const value = change?.value || {};
      const channelExternalId =
        asString(value?.recipient?.id)
        || asString(value?.instagram_business_account?.id)
        || asString(value?.ig_id)
        || asString(value?.metadata?.phone_number_id);

      if (!channelExternalId) continue;

      const channel = await deps.resolveChannelAccount('meta', channelExternalId);
      if (channel?.tenantId) return channel.tenantId;
    }
  }

  return null;
}

function isLikelyStatusChange(change) {
  const value = change?.value || {};
  const field = String(change?.field || '').toLowerCase();
  const status = String(value?.status || value?.event || '').toLowerCase();

  if (Array.isArray(value?.delivery?.mids) && value.delivery.mids.length > 0) return true;
  if (Array.isArray(value?.read?.mids) && value.read.mids.length > 0) return true;
  if (value?.read?.watermark) return true;
  if (Array.isArray(value?.statuses) && value.statuses.length > 0) return true;

  if (field.includes('delivery') || field.includes('read') || field.includes('seen')) return true;
  if (['delivered', 'read', 'seen', 'sent', 'failed', 'error'].includes(status)) return true;

  const id = value?.message_id || value?.mid || value?.message?.mid || value?.message?.id;
  if (id && (status || field)) return true;

  return false;
}

export async function metaRoutes(fastify, opts = {}) {
  const deps = {
    env: ENV,
    deterministicEventId,
    storeProviderEvent,
    getSourceIp,
    resolveChannelAccount,
    getOrCreateConversation,
    upsertContact,
    upsertMessage,
    runRouting,
    updateMessageStatusByProviderRealId,
    markMessagesReadByRecipientWatermark,
    markConversationMessagesReadByWatermark,
    resolveConversationIdByMetaParticipants,
    upsertMetaParticipant,
    deadLetterWebhookError,
    handleMetaStatusCallbacks,
    maybeCaptureMetaSample,
    acceptWebhookEvent,
    ...(opts.deps || {}),
  };

  fastify.get('/webhooks/meta', async (req, reply) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === deps.env.META_VERIFY_TOKEN) {
      return reply.code(200).send(challenge);
    }

    return reply.code(403).send('Forbidden');
  });

  fastify.post('/webhooks/meta', {
    config: { rateLimit: WEBHOOK_RATE_LIMIT },
  }, async (req, reply) => {
    if (!verifyMetaSignature(req, deps)) {
      return reply.code(401).send({ ok: false, error: 'Invalid Meta signature' });
    }

    const payload = req.body || {};
    let tenantId = null;

    try {
      tenantId = await resolveMetaWebhookTenantHint(payload, deps);

      let idempotency = { ignored: false };
      try {
        idempotency = await deps.acceptWebhookEvent({
          tenantId,
          provider: 'meta',
          externalEventId: extractMetaExternalEventId(payload, req.rawBody || ''),
          payload,
        });
      } catch (error) {
        req.log.warn({ err: error }, 'Meta webhook idempotency check failed; continuing');
      }

      if (idempotency?.ignored) {
        return reply.code(200).send({ ok: true, ignored: true });
      }
      const sourceIp = deps.getSourceIp(req);
      const receivedAt = new Date().toISOString();

      try {
        await deps.maybeCaptureMetaSample({
          payload,
          tenantId,
          sourceIp,
          receivedAt,
          enabled: true,
          maxPerKind: 3,
        });
      } catch (sampleErr) {
        req.log.warn({ err: sampleErr }, 'Meta sample capture failed');
      }

      const entries = getMetaEntries(payload);

      const statusResult = await deps.handleMetaStatusCallbacks({
        deps,
        payload,
        sourceIp,
        receivedAt,
      });

      let processed = Number(statusResult?.processed || 0);
      if (statusResult?.tenantId) tenantId = statusResult.tenantId;

      for (const entry of entries) {
        const entryId = asString(entry?.id);

        const messagingEvents = getMessagingEvents(entry);
        for (const event of messagingEvents) {
          const senderId = asString(event?.sender?.id);
          const recipientId = asString(event?.recipient?.id) || entryId;
          const mid = asString(event?.message?.mid);
          const isEcho = Boolean(event?.message?.is_echo);
          if (!mid || isEcho) continue;

          const body = extractText(event?.message || event);

          const channel = recipientId
            ? await deps.resolveChannelAccount('meta', recipientId)
            : null;

          if (channel?.tenantId) tenantId = channel.tenantId;

          await deps.storeProviderEvent({
            tenant_id: channel?.tenantId || null,
            provider: 'meta',
            provider_event_id: `meta_msg:${mid}`,
            channel_external_id: recipientId,
            event_type: 'inbound_message',
            payload,
            normalized: {
              entry_id: entryId,
              sender_id: senderId,
              recipient_id: recipientId,
              message_id: mid,
              body,
            },
            signature_valid: true,
            source_ip: sourceIp,
            received_at: receivedAt,
          });

          if (!channel?.tenantId || !senderId) continue;

          const contactId = await deps.upsertContact({
            tenantId: channel.tenantId,
            phoneE164: null,
            waNumber: null,
            fbPsid: senderId,
            displayName: null,
            channelAccountId: channel.channelAccountId,
            metadata: {
              provider: 'meta',
              channel: 'messenger',
              sender_id: senderId,
              recipient_id: recipientId,
            },
          });

          const conversationId = await deps.getOrCreateConversation({
            tenantId: channel.tenantId,
            channelAccountId: channel.channelAccountId,
            contactId,
            subject: `Meta ${senderId}`,
            provider: 'meta',
          });

          await deps.upsertMetaParticipant({
            tenant_id: channel.tenantId,
            conversation_id: conversationId,
            senderId,
            recipientId,
          });

          const message = await deps.upsertMessage({
            tenantId: channel.tenantId,
            conversationId,
            provider: 'meta',
            providerMessageId: `in:${mid}`,
            providerMessageIdReal: mid,
            direction: 'in',
            fromId: senderId,
            toId: recipientId,
            body,
            content: { raw: event },
            status: 'received',
            receivedAt,
          });

          if (message) {
            try {
              await deps.runRouting({ tenant_id: channel.tenantId, conversation_id: conversationId });
            } catch (error) {
              req.log.warn({ err: error, tenant_id: channel.tenantId, conversation_id: conversationId }, 'Auto routing failed for Meta Messenger inbound message');
            }
          }

          processed += 1;
        }

        const changes = getChanges(entry);
        for (const change of changes) {
          const value = change?.value || {};
          const channelExternalId =
            asString(value?.recipient?.id) ||
            asString(value?.instagram_business_account?.id) ||
            asString(value?.ig_id) ||
            entryId;

          const channel = channelExternalId
            ? await deps.resolveChannelAccount('meta', channelExternalId)
            : null;

          if (channel?.tenantId) tenantId = channel.tenantId;

          const messages = Array.isArray(value?.messages)
            ? value.messages
            : value?.message
              ? [value.message]
              : [];

          if (messages.length === 0) {
            if (!isLikelyStatusChange(change)) {
              const changeEventId = deps.deterministicEventId(
                'meta_change',
                JSON.stringify({ entry_id: entryId, field: change?.field || null, value })
              );

              await deps.storeProviderEvent({
                tenant_id: channel?.tenantId || null,
                provider: 'meta',
                provider_event_id: changeEventId,
                channel_external_id: channelExternalId,
                event_type: 'meta_change',
                payload,
                normalized: {
                  entry_id: entryId,
                  field: change?.field || null,
                  channel_external_id: channelExternalId,
                },
                signature_valid: true,
                source_ip: sourceIp,
                received_at: receivedAt,
              });
            }
            continue;
          }

          for (const messagePayload of messages) {
            const senderId =
              asString(messagePayload?.from) ||
              asString(messagePayload?.sender_id) ||
              asString(value?.from) ||
              asString(value?.sender?.id);

            const rawId = asString(messagePayload?.id) || asString(messagePayload?.mid);
            const providerMessageRealId =
              rawId ||
              deps.deterministicEventId(
                'meta_synth_msg',
                JSON.stringify({ entry_id: entryId, channel_external_id: channelExternalId, sender_id: senderId, message: messagePayload })
              );

            const providerEventId = `meta_msg:${providerMessageRealId}`;
            const body = extractText(messagePayload) || extractText(value);

            await deps.storeProviderEvent({
              tenant_id: channel?.tenantId || null,
              provider: 'meta',
              provider_event_id: providerEventId,
              channel_external_id: channelExternalId,
              event_type: 'inbound_message',
              payload,
              normalized: {
                entry_id: entryId,
                field: change?.field || null,
                sender_id: senderId,
                recipient_id: channelExternalId,
                message_id: providerMessageRealId,
                body,
              },
              signature_valid: true,
              source_ip: sourceIp,
              received_at: receivedAt,
            });

            if (!channel?.tenantId || !senderId) continue;

            const contactId = await deps.upsertContact({
              tenantId: channel.tenantId,
              phoneE164: null,
              waNumber: null,
              fbPsid: `ig:${senderId}`,
              displayName: null,
              channelAccountId: channel.channelAccountId,
              metadata: {
                provider: 'meta',
                channel: 'instagram',
                sender_id: senderId,
                recipient_id: channelExternalId,
              },
            });

            const conversationId = await deps.getOrCreateConversation({
              tenantId: channel.tenantId,
              channelAccountId: channel.channelAccountId,
              contactId,
              subject: `Instagram ${senderId}`,
              provider: 'meta',
            });

            await deps.upsertMetaParticipant({
              tenant_id: channel.tenantId,
              conversation_id: conversationId,
              senderId,
              recipientId: channelExternalId,
            });

            const message = await deps.upsertMessage({
              tenantId: channel.tenantId,
              conversationId,
              provider: 'meta',
              providerMessageId: `in:${providerMessageRealId}`,
              providerMessageIdReal: providerMessageRealId,
              direction: 'in',
              fromId: senderId,
              toId: channelExternalId,
              body,
              content: { field: change?.field || null, raw: messagePayload },
              status: 'received',
              receivedAt,
            });

            if (message) {
              try {
                await deps.runRouting({ tenant_id: channel.tenantId, conversation_id: conversationId });
              } catch (error) {
                req.log.warn({ err: error, tenant_id: channel.tenantId, conversation_id: conversationId }, 'Auto routing failed for Meta Instagram inbound message');
              }
            }

            processed += 1;
          }
        }
      }

      if (processed === 0) {
        const fallbackId = deps.deterministicEventId('meta_webhook', req.rawBody || JSON.stringify(payload));
        await deps.storeProviderEvent({
          tenant_id: null,
          provider: 'meta',
          provider_event_id: fallbackId,
          channel_external_id: null,
          event_type: 'meta_webhook',
          payload,
          normalized: {},
          signature_valid: true,
          source_ip: sourceIp,
          received_at: receivedAt,
        });
      }

      return reply.code(200).send({ ok: true, processed });
    } catch (error) {
      req.log.error({ err: error }, 'Meta webhook failed; dead-lettering payload');
      await deps.deadLetterWebhookError({
        tenantId,
        provider: 'meta',
        endpoint: '/webhooks/meta',
        req,
        payload,
        error,
      });
      return reply.code(200).send({ ok: false, dead_lettered: true });
    }
  });
}
