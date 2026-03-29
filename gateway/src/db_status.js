import { supabaseAdmin } from './supabase.js';
import { normalizeDeliveryStatus } from './util/delivery-status.js';
import { redactSecrets, redactText } from './util/redact.js';
import { buildWebhookEventKey, queueOutgoingWebhookEvent } from './lib/public-api/webhookDispatcher.js';
import { logAudit } from './lib/audit/auditLog.js';

function text(value) {
  return String(value || '').trim().toLowerCase();
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function missingColumn(error, column) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('column') && msg.includes(String(column || '').toLowerCase());
}

function toIsoFromTimestamp(value) {
  if (value === null || value === undefined) return null;

  const n = Number(value);
  if (Number.isFinite(n)) {
    const ms = n > 1e12 ? n : n * 1000;
    const date = new Date(ms);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }

  const parsed = new Date(String(value));
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  return null;
}

async function insertDeliveryEvent({
  tenant_id,
  provider,
  provider_message_id,
  status,
  raw_status = null,
  error = null,
  occurred_at = null,
  payload = null,
}) {
  const normalizedStatus = normalizeDeliveryStatus(provider, status);
  const occurredAt = occurred_at || new Date().toISOString();

  const row = {
    tenant_id,
    provider,
    provider_message_id,
    status: normalizedStatus,
    occurred_at: occurredAt,
    payload: redactSecrets({
      normalized_status: normalizedStatus,
      raw_status: raw_status || status || null,
      error: error || null,
      ...(payload && typeof payload === 'object' ? payload : {}),
    }),
  };

  let insert = await supabaseAdmin
    .from('message_delivery_events')
    .insert(row);

  if (!insert.error) return;

  // Compatibility path for older schema (event_type + created_at).
  if (missingColumn(insert.error, 'status') || missingColumn(insert.error, 'occurred_at')) {
    insert = await supabaseAdmin
      .from('message_delivery_events')
      .insert({
        tenant_id,
        provider,
        provider_message_id,
        event_type: normalizedStatus,
        created_at: occurredAt,
        payload: row.payload,
      });
  }

  if (insert.error && !isMissingSchema(insert.error)) {
    throw new Error(`message_delivery_events insert failed: ${insert.error.message}`);
  }
}

async function updateOutboxStatus({
  tenant_id,
  provider,
  provider_message_id,
  status,
  error,
}) {
  const normalized = normalizeDeliveryStatus(provider, status);

  const patch = {
    updated_at: new Date().toISOString(),
  };

  if (normalized === 'failed') {
    patch.status = 'failed';
    patch.last_error = redactText(JSON.stringify(error || { status: normalized })).slice(0, 5000);
  } else if (['pending', 'sent', 'delivered', 'read'].includes(normalized)) {
    patch.status = normalized === 'pending' ? 'queued' : 'sent';
    patch.last_error = null;
  }

  if (!patch.status) return;

  const { error: updateError } = await supabaseAdmin
    .from('outbox_messages')
    .update(patch)
    .eq('tenant_id', tenant_id)
    .eq('provider', provider)
    .eq('provider_message_id', provider_message_id)
    .neq('status', 'canceled');

  if (updateError && !isMissingSchema(updateError)) {
    throw new Error(`outbox_messages status update failed: ${updateError.message}`);
  }
}

async function patchMessagesByProviderRealId({
  tenant_id,
  provider,
  provider_message_id_real,
  normalizedStatus,
  error,
  statusAt,
}) {
  const patch = {
    status: normalizedStatus,
    delivery_status: normalizedStatus,
    last_status_at: statusAt,
    updated_at: statusAt,
  };

  if (error) {
    patch.error = redactSecrets(error);
  }

  let update = await supabaseAdmin
    .from('messages')
    .update(patch)
    .eq('tenant_id', tenant_id)
    .eq('provider', provider)
    .eq('provider_message_id_real', provider_message_id_real);

  if (
    update.error
    && (
      missingColumn(update.error, 'delivery_status')
      || missingColumn(update.error, 'last_status_at')
      || missingColumn(update.error, 'updated_at')
    )
  ) {
    delete patch.delivery_status;
    delete patch.last_status_at;
    delete patch.updated_at;

    update = await supabaseAdmin
      .from('messages')
      .update(patch)
      .eq('tenant_id', tenant_id)
      .eq('provider', provider)
      .eq('provider_message_id_real', provider_message_id_real);
  }

  if (update.error) {
    throw new Error(`updateMessageStatusByProviderRealId failed: ${update.error.message}`);
  }

  // Best effort: backfill provider_message_id if missing in newer schema.
  const backfillProviderMessageId = await supabaseAdmin
    .from('messages')
    .update({ provider_message_id: provider_message_id_real })
    .eq('tenant_id', tenant_id)
    .eq('provider', provider)
    .eq('provider_message_id_real', provider_message_id_real)
    .is('provider_message_id', null);

  if (backfillProviderMessageId.error && !isMissingSchema(backfillProviderMessageId.error) && !missingColumn(backfillProviderMessageId.error, 'provider_message_id')) {
    throw new Error(`messages provider_message_id backfill failed: ${backfillProviderMessageId.error.message}`);
  }
}

export async function updateMessageStatusByProviderRealId({
  tenant_id,
  provider,
  provider_message_id_real,
  status,
  error = null,
  payload = null,
}) {
  const normalizedStatus = normalizeDeliveryStatus(provider, status);
  const statusAt = new Date().toISOString();

  await patchMessagesByProviderRealId({
    tenant_id,
    provider,
    provider_message_id_real,
    normalizedStatus,
    error,
    statusAt,
  });

  await insertDeliveryEvent({
    tenant_id,
    provider,
    provider_message_id: provider_message_id_real,
    status: normalizedStatus,
    raw_status: status,
    error,
    occurred_at: statusAt,
    payload,
  });

  await updateOutboxStatus({
    tenant_id,
    provider,
    provider_message_id: provider_message_id_real,
    status: normalizedStatus,
    error,
  });

  await queueOutgoingWebhookEvent({
    tenant_id,
    event_type: 'message.status',
    event_key: buildWebhookEventKey('message.status', {
      provider,
      provider_message_id: provider_message_id_real,
      status: normalizedStatus,
    }),
    payload: {
      provider,
      provider_message_id: provider_message_id_real,
      status: normalizedStatus,
      raw_status: status || null,
      error: error || null,
      occurred_at: statusAt,
    },
  }).catch(() => {});

  await logAudit({
    tenant_id,
    actor_user_id: null,
    actor_type: 'webhook',
    action: 'message_status_update',
    entity_type: 'message',
    entity_id: provider_message_id_real,
    metadata: { provider, status: normalizedStatus, raw_status: status || null },
  }).catch(() => {});
}

async function markMessageRowsRead({ tenant_id, provider, ids }) {
  if (!ids.length) return;

  const patch = {
    status: 'read',
    delivery_status: 'read',
    last_status_at: new Date().toISOString(),
  };

  let update = await supabaseAdmin
    .from('messages')
    .update(patch)
    .in('id', ids);

  if (update.error && (missingColumn(update.error, 'delivery_status') || missingColumn(update.error, 'last_status_at'))) {
    delete patch.delivery_status;
    delete patch.last_status_at;
    update = await supabaseAdmin
      .from('messages')
      .update(patch)
      .in('id', ids);
  }

  if (update.error) {
    throw new Error(`message read update failed: ${update.error.message}`);
  }
}

export async function markMessagesReadByRecipientWatermark({
  tenant_id,
  provider,
  recipient_id,
  watermark,
}) {
  const toId = String(recipient_id || '').trim();
  if (!toId) return 0;

  const watermarkIso = toIsoFromTimestamp(watermark);
  if (!watermarkIso) return 0;

  const { data: rows, error: selectError } = await supabaseAdmin
    .from('messages')
    .select('id, provider_message_id, provider_message_id_real')
    .eq('tenant_id', tenant_id)
    .eq('provider', provider)
    .eq('direction', 'out')
    .eq('to_id', toId)
    .in('status', ['sent', 'delivered'])
    .lte('received_at', watermarkIso)
    .limit(500);

  if (selectError) {
    throw new Error(`markMessagesReadByRecipientWatermark select failed: ${selectError.message}`);
  }

  const ids = (rows || []).map((row) => row.id).filter(Boolean);
  if (ids.length === 0) return 0;

  await markMessageRowsRead({ tenant_id, provider, ids });

  for (const row of rows || []) {
    const providerMessageId = row.provider_message_id_real || row.provider_message_id;
    if (!providerMessageId) continue;

    await insertDeliveryEvent({
      tenant_id,
      provider,
      provider_message_id: providerMessageId,
      status: 'read',
      raw_status: 'read',
      error: null,
    });

    await updateOutboxStatus({
      tenant_id,
      provider,
      provider_message_id: providerMessageId,
      status: 'read',
      error: null,
    });
  }

  return ids.length;
}

async function getConversationWatermark({ tenant_id, conversationId }) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, last_read_watermark')
    .eq('tenant_id', tenant_id)
    .eq('id', conversationId)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) return { supported: false, value: 0 };
    throw new Error(`conversation watermark lookup failed: ${error.message}`);
  }

  const value = Number(data?.last_read_watermark || 0);
  return {
    supported: true,
    value: Number.isFinite(value) ? value : 0,
  };
}

async function setConversationWatermark({ tenant_id, conversationId, watermark }) {
  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ last_read_watermark: watermark, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenant_id)
    .eq('id', conversationId)
    .or(`last_read_watermark.is.null,last_read_watermark.lt.${watermark}`);

  if (error && !isMissingSchema(error)) {
    throw new Error(`conversation watermark update failed: ${error.message}`);
  }
}

export async function markConversationMessagesReadByWatermark({
  tenant_id,
  provider,
  conversation_id,
  recipient_id,
  watermark,
}) {
  const conversationId = String(conversation_id || '').trim();
  if (!conversationId) return 0;

  const watermarkNum = Number(watermark || 0);
  if (!Number.isFinite(watermarkNum) || watermarkNum <= 0) return 0;

  const watermarkIso = toIsoFromTimestamp(watermarkNum);
  if (!watermarkIso) return 0;

  const wm = await getConversationWatermark({ tenant_id, conversationId });
  if (wm.supported && watermarkNum <= wm.value) {
    return 0;
  }

  const toId = String(recipient_id || '').trim();

  let query = supabaseAdmin
    .from('messages')
    .select('id, provider_message_id, provider_message_id_real')
    .eq('tenant_id', tenant_id)
    .eq('provider', provider)
    .eq('conversation_id', conversationId)
    .eq('direction', 'out')
    .in('status', ['sent', 'delivered'])
    .lte('received_at', watermarkIso)
    .limit(500);

  if (toId) query = query.eq('to_id', toId);

  const { data: rows, error: selectError } = await query;

  if (selectError) {
    throw new Error(`markConversationMessagesReadByWatermark select failed: ${selectError.message}`);
  }

  const ids = (rows || []).map((row) => row.id).filter(Boolean);

  if (ids.length > 0) {
    await markMessageRowsRead({ tenant_id, provider, ids });

    for (const row of rows || []) {
      const providerMessageId = row.provider_message_id_real || row.provider_message_id;
      if (!providerMessageId) continue;

      await insertDeliveryEvent({
        tenant_id,
        provider,
        provider_message_id: providerMessageId,
        status: 'read',
        raw_status: 'read',
        error: null,
      });

      await updateOutboxStatus({
        tenant_id,
        provider,
        provider_message_id: providerMessageId,
        status: 'read',
        error: null,
      });
    }
  }

  if (wm.supported) {
    await setConversationWatermark({
      tenant_id,
      conversationId,
      watermark: watermarkNum,
    });
  }

  return ids.length;
}
