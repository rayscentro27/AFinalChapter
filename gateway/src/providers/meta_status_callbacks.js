function asString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueNonEmpty(list) {
  return Array.from(new Set((list || []).map((item) => asString(item)).filter(Boolean)));
}

function normalizeMetaStatus(value) {
  const status = norm(value);
  if (!status) return null;
  if (['sent', 'delivered', 'read', 'failed'].includes(status)) return status;
  if (status === 'error' || status === 'failure') return 'failed';
  if (status === 'seen') return 'read';
  return status;
}

async function applyStatusToMessageIds({
  tenantId,
  messageIds,
  status,
  error = null,
  deps,
}) {
  const ids = uniqueNonEmpty(messageIds);
  if (!tenantId || ids.length === 0 || !status) return 0;

  for (const messageId of ids) {
    await deps.updateMessageStatusByProviderRealId({
      tenant_id: tenantId,
      provider: 'meta',
      provider_message_id_real: messageId,
      status,
      error,
    });
  }

  return ids.length;
}

function getMetaEntries(payload) {
  return Array.isArray(payload?.entry) ? payload.entry : [];
}

function getMessagingEvents(entry) {
  return Array.isArray(entry?.messaging) ? entry.messaging : [];
}

function getChanges(entry) {
  return Array.isArray(entry?.changes) ? entry.changes : [];
}

async function resolveReadWatermark({
  deps,
  tenantId,
  senderId,
  recipientId,
  watermark,
}) {
  if (!tenantId || !senderId || !watermark) return 0;

  const resolvedConversationId = await deps.resolveConversationIdByMetaParticipants({
    tenant_id: tenantId,
    senderId,
    recipientId,
  });

  if (resolvedConversationId) {
    return deps.markConversationMessagesReadByWatermark({
      tenant_id: tenantId,
      provider: 'meta',
      conversation_id: resolvedConversationId,
      recipient_id: senderId,
      watermark,
    });
  }

  return deps.markMessagesReadByRecipientWatermark({
    tenant_id: tenantId,
    provider: 'meta',
    recipient_id: senderId,
    watermark,
  });
}

function findMessageId(value) {
  return (
    asString(value?.message_id)
    || asString(value?.mid)
    || asString(value?.message?.mid)
    || asString(value?.message?.id)
    || null
  );
}

function findSenderId(value) {
  return (
    asString(value?.sender?.id)
    || asString(value?.from?.id)
    || asString(value?.sender_id)
    || asString(value?.user?.id)
    || asString(value?.messaging?.sender?.id)
    || asString(value?.from)
    || null
  );
}

function findRecipientId(value, entryId) {
  return (
    asString(value?.recipient?.id)
    || asString(value?.to?.id)
    || asString(value?.page_id)
    || asString(value?.ig_id)
    || asString(value?.instagram_business_account?.id)
    || asString(entryId)
    || null
  );
}

function isDeliveryLike(field, value) {
  const f = norm(field);
  const event = norm(value?.event);
  const status = norm(value?.status);
  return f.includes('delivery') || event === 'delivered' || status === 'delivered';
}

function isReadLike(field, value) {
  const f = norm(field);
  const event = norm(value?.event);
  const status = norm(value?.status);
  return (
    f.includes('read')
    || f.includes('seen')
    || event === 'read'
    || status === 'read'
    || status === 'seen'
  );
}

export async function handleMetaStatusCallbacks({
  deps,
  payload,
  sourceIp,
  receivedAt,
}) {
  const entries = getMetaEntries(payload);
  let processed = 0;
  let tenantId = null;

  for (const entry of entries) {
    const entryId = asString(entry?.id);

    for (const event of getMessagingEvents(entry)) {
      const senderId = asString(event?.sender?.id);
      const recipientId = asString(event?.recipient?.id) || entryId;
      const mid = asString(event?.message?.mid);
      const isEcho = Boolean(event?.message?.is_echo);
      const deliveredMids = uniqueNonEmpty(event?.delivery?.mids || []);
      const readMids = uniqueNonEmpty(event?.read?.mids || []);
      const readWatermark = event?.read?.watermark;
      const hasStatus = isEcho || deliveredMids.length > 0 || readMids.length > 0 || Boolean(readWatermark);
      if (!hasStatus) continue;

      const channel = recipientId
        ? await deps.resolveChannelAccount('meta', recipientId)
        : null;

      if (channel?.tenantId) tenantId = channel.tenantId;

      const providerEventId =
        mid
          ? `meta_status:${mid}:${isEcho ? 'sent' : (readWatermark || readMids.length ? 'read' : 'delivered')}`
          : deps.deterministicEventId('meta_event', JSON.stringify({ entry_id: entryId, event }));

      const eventType =
        deliveredMids.length > 0
          ? 'delivery_status'
          : (readMids.length > 0 || readWatermark)
            ? 'read_status'
            : 'delivery_status';

      await deps.storeProviderEvent({
        tenant_id: channel?.tenantId || null,
        provider: 'meta',
        provider_event_id: providerEventId,
        channel_external_id: recipientId,
        event_type: eventType,
        payload,
        normalized: {
          entry_id: entryId,
          sender_id: senderId,
          recipient_id: recipientId,
          message_id: mid,
          delivery_mids: deliveredMids,
          read_mids: readMids,
          watermark: readWatermark || null,
          is_echo: isEcho,
        },
        signature_valid: true,
        source_ip: sourceIp,
        received_at: receivedAt,
      });
      processed += 1;

      if (!channel?.tenantId) continue;

      if (isEcho && mid) {
        await deps.updateMessageStatusByProviderRealId({
          tenant_id: channel.tenantId,
          provider: 'meta',
          provider_message_id_real: mid,
          status: 'sent',
          error: null,
        });
        processed += 1;
      }

      if (deliveredMids.length) {
        processed += await applyStatusToMessageIds({
          tenantId: channel.tenantId,
          messageIds: deliveredMids,
          status: 'delivered',
          deps,
        });
      }

      if (readMids.length) {
        processed += await applyStatusToMessageIds({
          tenantId: channel.tenantId,
          messageIds: readMids,
          status: 'read',
          deps,
        });
      }

      if (senderId && readWatermark) {
        processed += await resolveReadWatermark({
          deps,
          tenantId: channel.tenantId,
          senderId,
          recipientId,
          watermark: readWatermark,
        });
      }
    }

    for (const change of getChanges(entry)) {
      const value = change?.value || {};
      const field = change?.field || null;
      const channelExternalId = findRecipientId(value, entryId);
      const channel = channelExternalId
        ? await deps.resolveChannelAccount('meta', channelExternalId)
        : null;

      if (channel?.tenantId) tenantId = channel.tenantId;

      let statusProcessed = 0;
      const seenDeliveryMids = new Set();
      const seenReadMids = new Set();

      const changeDeliveryMids = uniqueNonEmpty(value?.delivery?.mids || []);
      if (changeDeliveryMids.length) {
        const deliveryEventId = deps.deterministicEventId(
          'meta_change_delivery',
          JSON.stringify({ entry_id: entryId, channel_external_id: channelExternalId, mids: changeDeliveryMids })
        );

        await deps.storeProviderEvent({
          tenant_id: channel?.tenantId || null,
          provider: 'meta',
          provider_event_id: deliveryEventId,
          channel_external_id: channelExternalId,
          event_type: 'delivery_status',
          payload,
          normalized: {
            entry_id: entryId,
            field,
            mids: changeDeliveryMids,
          },
          signature_valid: true,
          source_ip: sourceIp,
          received_at: receivedAt,
        });

        statusProcessed += 1;
        for (const mid of changeDeliveryMids) seenDeliveryMids.add(mid);

        if (channel?.tenantId) {
          statusProcessed += await applyStatusToMessageIds({
            tenantId: channel.tenantId,
            messageIds: changeDeliveryMids,
            status: 'delivered',
            deps,
          });
        }
      }

      const changeReadMids = uniqueNonEmpty(value?.read?.mids || []);
      if (changeReadMids.length) {
        const readEventId = deps.deterministicEventId(
          'meta_change_read_mids',
          JSON.stringify({ entry_id: entryId, channel_external_id: channelExternalId, mids: changeReadMids })
        );

        await deps.storeProviderEvent({
          tenant_id: channel?.tenantId || null,
          provider: 'meta',
          provider_event_id: readEventId,
          channel_external_id: channelExternalId,
          event_type: 'read_status',
          payload,
          normalized: {
            entry_id: entryId,
            field,
            mids: changeReadMids,
          },
          signature_valid: true,
          source_ip: sourceIp,
          received_at: receivedAt,
        });

        statusProcessed += 1;
        for (const mid of changeReadMids) seenReadMids.add(mid);

        if (channel?.tenantId) {
          statusProcessed += await applyStatusToMessageIds({
            tenantId: channel.tenantId,
            messageIds: changeReadMids,
            status: 'read',
            deps,
          });
        }
      }

      const readWatermark = value?.read?.watermark;
      const readActor = findSenderId(value) || asString(value?.recipient?.id);
      if (readWatermark && readActor) {
        const readWatermarkEventId = deps.deterministicEventId(
          'meta_change_read_watermark',
          JSON.stringify({ entry_id: entryId, channel_external_id: channelExternalId, actor: readActor, watermark: readWatermark })
        );

        await deps.storeProviderEvent({
          tenant_id: channel?.tenantId || null,
          provider: 'meta',
          provider_event_id: readWatermarkEventId,
          channel_external_id: channelExternalId,
          event_type: 'read_status',
          payload,
          normalized: {
            entry_id: entryId,
            field,
            reader_id: readActor,
            watermark: readWatermark,
          },
          signature_valid: true,
          source_ip: sourceIp,
          received_at: receivedAt,
        });

        statusProcessed += 1;
        if (channel?.tenantId) {
          statusProcessed += await resolveReadWatermark({
            deps,
            tenantId: channel.tenantId,
            senderId: readActor,
            recipientId: channelExternalId,
            watermark: readWatermark,
          });
        }
      }

      const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
      for (const st of statuses) {
        const mid = asString(st?.id) || asString(st?.message_id) || asString(st?.mid);
        const waStatus = normalizeMetaStatus(st?.status || st?.event || field);

        if (mid && waStatus === 'delivered') seenDeliveryMids.add(mid);
        if (mid && waStatus === 'read') seenReadMids.add(mid);

        const statusEventId =
          mid
            ? `meta_status:${mid}:${waStatus || 'unknown'}`
            : deps.deterministicEventId('meta_status', JSON.stringify({ entry_id: entryId, channel_external_id: channelExternalId, status: st }));

        await deps.storeProviderEvent({
          tenant_id: channel?.tenantId || null,
          provider: 'meta',
          provider_event_id: statusEventId,
          channel_external_id: channelExternalId,
          event_type: 'delivery_status',
          payload,
          normalized: {
            entry_id: entryId,
            field,
            message_id: mid,
            status: waStatus,
            raw_status: st,
          },
          signature_valid: true,
          source_ip: sourceIp,
          received_at: receivedAt,
        });

        statusProcessed += 1;

        if (channel?.tenantId && mid && waStatus) {
          await deps.updateMessageStatusByProviderRealId({
            tenant_id: channel.tenantId,
            provider: 'meta',
            provider_message_id_real: mid,
            status: waStatus,
            error: waStatus === 'failed' ? { raw: st } : null,
          });

          statusProcessed += 1;
        }
      }

      // Defensive fallback for IG-style envelopes that only expose a single message/status id.
      const genericMid = findMessageId(value);
      if (channel?.tenantId && genericMid) {
        if (isDeliveryLike(field, value) && !seenDeliveryMids.has(genericMid)) {
          await deps.updateMessageStatusByProviderRealId({
            tenant_id: channel.tenantId,
            provider: 'meta',
            provider_message_id_real: genericMid,
            status: 'delivered',
            error: null,
          });
          statusProcessed += 1;
        }

        if (isReadLike(field, value) && !seenReadMids.has(genericMid)) {
          await deps.updateMessageStatusByProviderRealId({
            tenant_id: channel.tenantId,
            provider: 'meta',
            provider_message_id_real: genericMid,
            status: 'read',
            error: null,
          });
          statusProcessed += 1;
        }
      }

      const genericWatermark = Number(value?.watermark || value?.timestamp || entry?.time || 0) || null;
      if (!readWatermark && channel?.tenantId && genericWatermark && isReadLike(field, value)) {
        const senderId = findSenderId(value);
        if (senderId) {
          statusProcessed += await resolveReadWatermark({
            deps,
            tenantId: channel.tenantId,
            senderId,
            recipientId: channelExternalId,
            watermark: genericWatermark,
          });
        }
      }

      processed += statusProcessed;
    }
  }

  return { processed, tenantId };
}
