import { supabaseAdmin as defaultSupabaseAdmin } from '../../supabase.js';
import { redactSecrets, redactText } from '../../util/redact.js';

const MAX_METADATA_TEXT = 500;

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function sanitizeMetadata(input) {
  const redacted = redactSecrets(input || {});
  if (!redacted || typeof redacted !== 'object') return {};

  const out = {};
  for (const [key, value] of Object.entries(redacted)) {
    if (typeof value === 'string') {
      out[key] = redactText(value).slice(0, MAX_METADATA_TEXT);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export async function logAudit({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  actor_user_id = null,
  actor_type = 'user',
  action,
  entity_type,
  entity_id,
  metadata = null,
  occurred_at = null,
}) {
  const tenantId = asText(tenant_id);
  const actionName = asText(action);
  const entityType = asText(entity_type);
  const entityId = asText(entity_id);

  if (!tenantId || !actionName || !entityType || !entityId) return { ok: false, skipped: true };

  const insert = await supabaseAdmin
    .from('audit_events')
    .insert({
      tenant_id: tenantId,
      actor_user_id: asText(actor_user_id) || null,
      actor_type: asText(actor_type) || 'user',
      action: actionName,
      entity_type: entityType,
      entity_id: entityId,
      metadata: sanitizeMetadata(metadata),
      occurred_at: occurred_at || new Date().toISOString(),
    });

  if (insert.error) {
    if (isMissingSchema(insert.error)) return { ok: false, skipped: true, reason: 'schema_missing' };
    throw new Error(`audit event insert failed: ${insert.error.message}`);
  }

  return { ok: true };
}
