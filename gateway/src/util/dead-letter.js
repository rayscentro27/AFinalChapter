import { supabaseAdmin } from '../supabase.js';
import { logAudit } from '../lib/audit/auditLog.js';

const DEFAULT_RETRY_DELAY_MS = 5 * 60 * 1000;

function toJsonObject(value) {
  if (!value || typeof value !== 'object') return {};
  return JSON.parse(JSON.stringify(value));
}

function normalizeError(error) {
  if (!error) return 'Unknown error';
  return String(error?.message || error).slice(0, 5000);
}

export async function deadLetterWebhookError({
  tenantId = null,
  provider,
  endpoint,
  req,
  payload,
  error,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}) {
  try {
    const headers = toJsonObject(req?.headers || {});
    const body = toJsonObject(payload || req?.body || {});

    await supabaseAdmin.from('webhook_dead_letters').insert({
      tenant_id: tenantId,
      provider,
      endpoint,
      headers,
      payload: body,
      error: normalizeError(error),
      attempts: 0,
      next_retry_at: new Date(Date.now() + retryDelayMs).toISOString(),
    });

    await logAudit({
      tenant_id: tenantId || '00000000-0000-0000-0000-000000000000',
      actor_user_id: null,
      actor_type: 'webhook',
      action: 'webhook_dead_lettered',
      entity_type: 'webhook',
      entity_id: `${String(provider || 'unknown')}:${String(endpoint || 'unknown')}`,
      metadata: {
        endpoint: endpoint || null,
        provider: provider || null,
        error: normalizeError(error),
      },
    }).catch(() => {});
  } catch (insertError) {
    req?.log?.error?.({ err: insertError }, 'Failed to insert webhook dead-letter row');
  }
}
