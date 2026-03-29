import { supabaseAdmin as defaultSupabaseAdmin } from '../../supabase.js';
import { redactSecrets, redactText } from '../../util/redact.js';
import { logAudit } from '../audit/auditLog.js';

const UNKNOWN_TENANT_ID = '00000000-0000-0000-0000-000000000000';

function isDuplicateError(error) {
  const code = String(error?.code || '').trim();
  if (code === '23505') return true;

  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('unique');
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function webhookEntityId(providerName, eventId) {
  return `${providerName}:${eventId}`;
}

export async function acceptWebhookEvent({
  supabaseAdmin = defaultSupabaseAdmin,
  tenantId,
  provider,
  externalEventId,
  payload,
  status = 'accepted',
  error = null,
}) {
  const tenant_id = String(tenantId || UNKNOWN_TENANT_ID).trim();
  const providerName = String(provider || '').trim().toLowerCase();
  const eventId = String(externalEventId || '').trim();

  if (!providerName || !eventId) {
    return { ok: false, inserted: false, ignored: false, reason: 'missing_event_key' };
  }

  const row = {
    tenant_id,
    provider: providerName,
    external_event_id: eventId,
    payload: redactSecrets(payload || null),
    status,
    error: error ? redactText(error) : null,
  };

  const insert = await supabaseAdmin
    .from('webhook_events')
    .insert(row);

  if (!insert.error) {
    await logAudit({
      tenant_id,
      actor_user_id: null,
      actor_type: 'webhook',
      action: 'webhook_accepted',
      entity_type: 'webhook_event',
      entity_id: webhookEntityId(providerName, eventId),
      metadata: { provider: providerName },
    }).catch(() => {});

    return { ok: true, inserted: true, ignored: false, tenant_id, provider: providerName, external_event_id: eventId };
  }

  if (isDuplicateError(insert.error)) {
    const update = await supabaseAdmin
      .from('webhook_events')
      .update({
        status: 'ignored',
        received_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenant_id)
      .eq('provider', providerName)
      .eq('external_event_id', eventId);

    if (update.error && !isMissingSchema(update.error)) {
      throw new Error(`webhook_events duplicate marker failed: ${update.error.message}`);
    }

    await logAudit({
      tenant_id,
      actor_user_id: null,
      actor_type: 'webhook',
      action: 'webhook_ignored_duplicate',
      entity_type: 'webhook_event',
      entity_id: webhookEntityId(providerName, eventId),
      metadata: { provider: providerName },
    }).catch(() => {});

    return { ok: true, inserted: false, ignored: true, tenant_id, provider: providerName, external_event_id: eventId };
  }

  if (isMissingSchema(insert.error)) {
    return { ok: true, inserted: true, ignored: false, schema_missing: true, tenant_id, provider: providerName, external_event_id: eventId };
  }

  throw new Error(`webhook_events insert failed: ${insert.error.message}`);
}

export async function markWebhookEventFailed({
  supabaseAdmin = defaultSupabaseAdmin,
  tenantId,
  provider,
  externalEventId,
  error,
}) {
  const tenant_id = String(tenantId || UNKNOWN_TENANT_ID).trim();
  const providerName = String(provider || '').trim().toLowerCase();
  const eventId = String(externalEventId || '').trim();
  if (!providerName || !eventId) return;

  const update = await supabaseAdmin
    .from('webhook_events')
    .update({
      status: 'failed',
      error: redactText(error),
    })
    .eq('tenant_id', tenant_id)
    .eq('provider', providerName)
    .eq('external_event_id', eventId);

  if (update.error && !isMissingSchema(update.error)) {
    throw new Error(`webhook_events update failed: ${update.error.message}`);
  }

  await logAudit({
    tenant_id,
    actor_user_id: null,
    actor_type: 'webhook',
    action: 'webhook_failed',
    entity_type: 'webhook_event',
    entity_id: webhookEntityId(providerName, eventId),
    metadata: { provider: providerName, error: redactText(error) },
  }).catch(() => {});
}
