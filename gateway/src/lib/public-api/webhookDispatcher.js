import { hmacSha256Hex, sha256Hex } from '../../util/hash.js';
import { supabaseAdmin as defaultSupabaseAdmin } from '../../supabase.js';
import { redactSecrets, redactText } from '../../util/redact.js';

const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 360];

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isDuplicateError(error) {
  const code = String(error?.code || '').trim();
  if (code === '23505') return true;

  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('unique') || msg.includes('conflict');
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function supportsEvent(subscriptionEvents, eventType) {
  const events = asArray(subscriptionEvents).map((v) => asText(v));
  return events.includes('*') || events.includes(eventType);
}

function computeBackoffMinutes(attempts) {
  const idx = Math.max(0, Math.min(RETRY_BACKOFF_MINUTES.length - 1, Number(attempts || 1) - 1));
  return RETRY_BACKOFF_MINUTES[idx];
}

function safeErrorText(error) {
  return redactText(String(error || '')).slice(0, 1000);
}

export function buildWebhookEventKey(eventType, payload) {
  return `${asText(eventType)}:${sha256Hex(JSON.stringify(payload || {}))}`;
}

export async function queueOutgoingWebhookEvent({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  event_type,
  event_key,
  payload,
}) {
  const tenantId = asText(tenant_id);
  const eventType = asText(event_type);
  const key = asText(event_key) || buildWebhookEventKey(eventType, payload || {});

  if (!tenantId || !eventType || !key) return { ok: false, skipped: true };

  const subsRes = await supabaseAdmin
    .from('webhook_subscriptions')
    .select('id,tenant_id,events,is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (subsRes.error) {
    if (isMissingSchema(subsRes.error)) return { ok: false, skipped: true, reason: 'schema_missing' };
    throw new Error(`webhook subscriptions lookup failed: ${subsRes.error.message}`);
  }

  let queued = 0;
  for (const sub of subsRes.data || []) {
    if (!supportsEvent(sub.events, eventType)) continue;

    const row = {
      tenant_id: tenantId,
      subscription_id: sub.id,
      event_type: eventType,
      event_key: key,
      payload: redactSecrets(payload || {}),
      status: 'queued',
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const insert = await supabaseAdmin.from('webhook_dispatch_queue').insert(row);
    if (insert.error) {
      if (isDuplicateError(insert.error)) continue;
      if (isMissingSchema(insert.error)) return { ok: false, skipped: true, reason: 'schema_missing' };
      throw new Error(`webhook dispatch enqueue failed: ${insert.error.message}`);
    }

    queued += 1;
  }

  return { ok: true, queued, event_key: key };
}

async function sendWebhookAttempt({ subscription, queueRow }) {
  const payload = {
    tenant_id: queueRow.tenant_id,
    event: queueRow.event_type,
    event_key: queueRow.event_key,
    occurred_at: new Date().toISOString(),
    data: asObject(queueRow.payload),
  };

  const body = JSON.stringify(payload);
  const signature = hmacSha256Hex(asText(subscription.secret), body);

  const response = await fetch(asText(subscription.url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Nexus-Signature': signature,
      'X-Nexus-Event': queueRow.event_type,
      'X-Nexus-Tenant': queueRow.tenant_id,
    },
    body,
  });

  const text = await response.text();
  return { ok: response.ok, status: response.status, body: text.slice(0, 500) };
}

export async function runWebhookDispatchQueue({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id = null,
  limit = 25,
}) {
  const nowIso = new Date().toISOString();

  let query = supabaseAdmin
    .from('webhook_dispatch_queue')
    .select('id,tenant_id,subscription_id,event_type,event_key,payload,status,attempts,next_attempt_at')
    .in('status', ['queued', 'failed'])
    .lte('next_attempt_at', nowIso)
    .order('next_attempt_at', { ascending: true })
    .limit(Math.max(1, Math.min(200, Number(limit || 25))));

  if (tenant_id) query = query.eq('tenant_id', asText(tenant_id));

  const { data: rows, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { ok: true, processed: 0, sent: 0, failed: 0, skipped: 0, items: [] };
    throw new Error(`webhook dispatch queue lookup failed: ${error.message}`);
  }

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const items = [];

  for (const row of rows || []) {
    const claim = await supabaseAdmin
      .from('webhook_dispatch_queue')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .in('status', ['queued', 'failed'])
      .select('id,tenant_id,subscription_id,event_type,event_key,payload,status,attempts,next_attempt_at')
      .maybeSingle();

    if (claim.error) throw new Error(`webhook dispatch claim failed: ${claim.error.message}`);
    if (!claim.data) {
      skipped += 1;
      continue;
    }

    processed += 1;
    const current = claim.data;

    const subRes = await supabaseAdmin
      .from('webhook_subscriptions')
      .select('id,tenant_id,url,secret,events,is_active')
      .eq('tenant_id', current.tenant_id)
      .eq('id', current.subscription_id)
      .maybeSingle();

    if (subRes.error) throw new Error(`webhook subscription fetch failed: ${subRes.error.message}`);

    if (!subRes.data || !subRes.data.is_active) {
      const attempts = Number(current.attempts || 0) + 1;
      await supabaseAdmin
        .from('webhook_dispatch_queue')
        .update({
          status: 'failed',
          attempts,
          last_error: 'subscription_not_active',
          next_attempt_at: new Date(Date.now() + computeBackoffMinutes(attempts) * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.id);

      failed += 1;
      items.push({ id: current.id, status: 'failed', error: 'subscription_not_active' });
      continue;
    }

    try {
      const result = await sendWebhookAttempt({
        subscription: subRes.data,
        queueRow: current,
      });

      if (result.ok) {
        await supabaseAdmin
          .from('webhook_dispatch_queue')
          .update({
            status: 'sent',
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', current.id);

        sent += 1;
        items.push({ id: current.id, status: 'sent' });
      } else {
        const attempts = Number(current.attempts || 0) + 1;
        await supabaseAdmin
          .from('webhook_dispatch_queue')
          .update({
            status: 'failed',
            attempts,
            last_error: safeErrorText(`http_${result.status}:${result.body}`),
            next_attempt_at: new Date(Date.now() + computeBackoffMinutes(attempts) * 60_000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', current.id);

        failed += 1;
        items.push({ id: current.id, status: 'failed', error: `http_${result.status}` });
      }
    } catch (error) {
      const attempts = Number(current.attempts || 0) + 1;
      await supabaseAdmin
        .from('webhook_dispatch_queue')
        .update({
          status: 'failed',
          attempts,
          last_error: safeErrorText(error?.message || error),
          next_attempt_at: new Date(Date.now() + computeBackoffMinutes(attempts) * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.id);

      failed += 1;
      items.push({ id: current.id, status: 'failed', error: safeErrorText(error?.message || error) });
    }
  }

  return {
    ok: true,
    processed,
    sent,
    failed,
    skipped,
    items,
  };
}
