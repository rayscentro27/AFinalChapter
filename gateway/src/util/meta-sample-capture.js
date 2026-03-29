import { supabaseAdmin } from '../supabase.js';

function classifyMetaPayload(payload) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const hasMessaging = entries.some((entry) => Array.isArray(entry?.messaging) && entry.messaging.length > 0);
  if (hasMessaging) return 'messenger';

  const hasChanges = entries.some((entry) => Array.isArray(entry?.changes) && entry.changes.length > 0);
  if (hasChanges) return 'instagram_changes';

  return 'unknown';
}

function redactScalar(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') {
    const digits = String(Math.trunc(Math.abs(value))).length;
    return digits >= 10 ? 'REDACTED_ID' : value;
  }
  if (typeof value !== 'string') return value;
  if (/^\d{10,}$/.test(value)) return 'REDACTED_ID';
  if (/^[A-Za-z0-9_-]{80,}$/.test(value)) return 'REDACTED_TOKEN';
  return value;
}

function redactPayload(payload) {
  if (Array.isArray(payload)) return payload.map((item) => redactPayload(item));
  if (!payload || typeof payload !== 'object') return redactScalar(payload);

  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value && typeof value === 'object') {
      out[key] = redactPayload(value);
      continue;
    }
    out[key] = redactScalar(value);
  }
  return out;
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

async function countSamplesByKind(kind) {
  const withKind = await supabaseAdmin
    .from('provider_events')
    .select('id', { count: 'exact', head: true })
    .eq('provider', 'meta')
    .eq('event_type', 'sample')
    .eq('event_kind', kind);

  if (!withKind.error) return Number(withKind.count || 0);
  if (!isMissingSchema(withKind.error)) {
    throw new Error(`meta sample count failed: ${withKind.error.message}`);
  }

  const fallback = await supabaseAdmin
    .from('provider_events')
    .select('id', { count: 'exact', head: true })
    .eq('provider', 'meta')
    .eq('event_type', `sample_${kind}`);

  if (fallback.error) {
    if (isMissingSchema(fallback.error)) return 0;
    throw new Error(`meta sample fallback count failed: ${fallback.error.message}`);
  }

  return Number(fallback.count || 0);
}

export async function maybeCaptureMetaSample({
  payload,
  tenantId = null,
  sourceIp = null,
  receivedAt = new Date().toISOString(),
  maxPerKind = 3,
  enabled = true,
}) {
  if (!enabled) return false;

  const kind = classifyMetaPayload(payload);
  if (kind === 'unknown') return false;

  const count = await countSamplesByKind(kind);
  if (count >= Number(maxPerKind || 3)) return false;

  const baseRow = {
    tenant_id: tenantId || null,
    provider: 'meta',
    provider_event_id: `meta_sample:${kind}:${Date.now()}:${Math.random().toString(16).slice(2, 10)}`,
    channel_external_id: null,
    event_type: 'sample',
    event_kind: kind,
    payload: redactPayload(payload),
    normalized: {
      event_kind: kind,
      sample: true,
    },
    signature_valid: true,
    source_ip: sourceIp || null,
    received_at: receivedAt,
  };

  const insert = await supabaseAdmin
    .from('provider_events')
    .upsert(baseRow, { onConflict: 'provider,provider_event_id' });

  if (!insert.error) return true;
  if (!isMissingSchema(insert.error)) {
    throw new Error(`meta sample insert failed: ${insert.error.message}`);
  }

  const fallbackRow = {
    ...baseRow,
    event_type: `sample_${kind}`,
  };
  delete fallbackRow.event_kind;

  const fallbackInsert = await supabaseAdmin
    .from('provider_events')
    .upsert(fallbackRow, { onConflict: 'provider,provider_event_id' });

  if (fallbackInsert.error && !isMissingSchema(fallbackInsert.error)) {
    throw new Error(`meta sample fallback insert failed: ${fallbackInsert.error.message}`);
  }

  return !fallbackInsert.error;
}
