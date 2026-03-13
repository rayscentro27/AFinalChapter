import { supabaseAdmin as defaultSupabaseAdmin } from '../../supabase.js';
import { redactSecrets, redactText } from '../../util/redact.js';

export const FAIL_THRESHOLD = 5;
export const FAIL_WINDOW_MINUTES = 10;
export const COOLDOWN_MINUTES = 10;
export const DEGRADED_THRESHOLD = 2;

const MAX_ERROR_LEN = 500;

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  const text = String(value || '').trim();
  return text;
}

function asInt(value, fallback = 0) {
  const out = Number(value);
  if (!Number.isFinite(out)) return fallback;
  return Math.trunc(out);
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function cleanErrorText(errorValue) {
  const text = redactText(asText(errorValue));
  return text.length > MAX_ERROR_LEN ? text.slice(0, MAX_ERROR_LEN) : text;
}

function cleanContext(context) {
  const redacted = redactSecrets(context || {});
  try {
    const text = JSON.stringify(redacted);
    if (text.length <= MAX_ERROR_LEN) return redacted;
    return { truncated: true, raw: text.slice(0, MAX_ERROR_LEN) };
  } catch {
    return { truncated: true, raw: '[unserializable_context]' };
  }
}

function parseDateMs(value) {
  const iso = toIso(value);
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function nowIso(now = new Date()) {
  return new Date(now).toISOString();
}

function addMinutesToIso(iso, minutes) {
  const ms = new Date(iso).getTime();
  return new Date(ms + minutes * 60_000).toISOString();
}

export function computeNewHealthState({
  current,
  eventType,
  error,
  now = new Date(),
  failThreshold = FAIL_THRESHOLD,
  failWindowMinutes = FAIL_WINDOW_MINUTES,
  cooldownMinutes = COOLDOWN_MINUTES,
  degradedThreshold = DEGRADED_THRESHOLD,
}) {
  const now_at = nowIso(now);
  const prevStatus = asText(current?.health_status || 'healthy').toLowerCase() || 'healthy';
  const prevFailCount = Math.max(0, asInt(current?.health_fail_count, 0));
  const prevFirstFailMs = parseDateMs(current?.health_first_fail_at);
  const failWindowMs = Math.max(1, asInt(failWindowMinutes, FAIL_WINDOW_MINUTES)) * 60_000;

  if (eventType === 'success') {
    const nextStatus = 'healthy';
    return {
      health_status: nextStatus,
      health_fail_count: 0,
      health_first_fail_at: null,
      health_last_fail_at: current?.health_last_fail_at || null,
      health_last_error: null,
      health_next_retry_at: null,
      health_last_changed_at: nextStatus !== prevStatus ? now_at : (current?.health_last_changed_at || null),
    };
  }

  const inWindow = prevFirstFailMs !== null && (new Date(now_at).getTime() - prevFirstFailMs) <= failWindowMs;
  const failCount = inWindow ? prevFailCount + 1 : 1;

  let status = 'healthy';
  let nextRetryAt = null;

  if (failCount >= failThreshold) {
    status = 'down';
    nextRetryAt = addMinutesToIso(now_at, Math.max(1, asInt(cooldownMinutes, COOLDOWN_MINUTES)));
  } else if (failCount >= degradedThreshold) {
    status = 'degraded';
  }

  return {
    health_status: status,
    health_fail_count: failCount,
    health_first_fail_at: inWindow ? (toIso(current?.health_first_fail_at) || now_at) : now_at,
    health_last_fail_at: now_at,
    health_last_error: cleanErrorText(error),
    health_next_retry_at: nextRetryAt,
    health_last_changed_at: status !== prevStatus ? now_at : (current?.health_last_changed_at || null),
  };
}

async function loadChannelHealthRow({ supabaseAdmin, tenant_id, channel_account_id, provider }) {
  let query = supabaseAdmin
    .from('channel_accounts')
    .select('id,tenant_id,provider,health_status,health_fail_count,health_first_fail_at,health_last_fail_at,health_last_error,health_next_retry_at,health_last_changed_at')
    .eq('tenant_id', tenant_id)
    .eq('id', channel_account_id)
    .limit(1)
    .maybeSingle();

  if (provider) query = query.eq('provider', provider);

  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return null;
    throw new Error(`channel health lookup failed: ${error.message}`);
  }
  return data || null;
}

async function updateChannelHealth({ supabaseAdmin, tenant_id, channel_account_id, provider, patch }) {
  let query = supabaseAdmin
    .from('channel_accounts')
    .update(patch)
    .eq('tenant_id', tenant_id)
    .eq('id', channel_account_id);

  if (provider) query = query.eq('provider', provider);

  const { error } = await query;
  if (error) {
    if (isMissingSchema(error)) return false;
    throw new Error(`channel health update failed: ${error.message}`);
  }

  return true;
}

async function insertHealthEvent({
  supabaseAdmin,
  tenant_id,
  channel_account_id,
  provider,
  severity,
  error,
  context,
}) {
  const row = {
    tenant_id,
    channel_account_id,
    provider,
    severity,
    occurred_at: new Date().toISOString(),
    error: error ? cleanErrorText(error) : null,
    context: cleanContext(context),
  };

  const { error: insertError } = await supabaseAdmin
    .from('provider_health_events')
    .insert(row);

  if (insertError && !isMissingSchema(insertError)) {
    throw new Error(`provider_health_events insert failed: ${insertError.message}`);
  }
}

export async function recordSendFailure({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  channel_account_id,
  provider,
  error,
  context = {},
}) {
  const tenantId = asText(tenant_id);
  const channelAccountId = asText(channel_account_id);
  const providerKey = asText(provider).toLowerCase();

  if (!tenantId || !channelAccountId || !providerKey) {
    return { ok: false, skipped: true, reason: 'missing_inputs' };
  }

  const current = await loadChannelHealthRow({
    supabaseAdmin,
    tenant_id: tenantId,
    channel_account_id: channelAccountId,
    provider: providerKey,
  });

  if (!current) {
    return { ok: false, skipped: true, reason: 'channel_not_found_or_schema_missing' };
  }

  const next = computeNewHealthState({
    current,
    eventType: 'failure',
    error,
  });

  await updateChannelHealth({
    supabaseAdmin,
    tenant_id: tenantId,
    channel_account_id: channelAccountId,
    provider: providerKey,
    patch: next,
  });

  try {
    await insertHealthEvent({
      supabaseAdmin,
      tenant_id: tenantId,
      channel_account_id: channelAccountId,
      provider: providerKey,
      severity: 'error',
      error,
      context,
    });
  } catch {
    // Non-blocking write for observability.
  }

  return { ok: true, state: next };
}

export async function recordSendSuccess({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  channel_account_id,
  provider,
  context = {},
}) {
  const tenantId = asText(tenant_id);
  const channelAccountId = asText(channel_account_id);
  const providerKey = asText(provider).toLowerCase();

  if (!tenantId || !channelAccountId || !providerKey) {
    return { ok: false, skipped: true, reason: 'missing_inputs' };
  }

  const current = await loadChannelHealthRow({
    supabaseAdmin,
    tenant_id: tenantId,
    channel_account_id: channelAccountId,
    provider: providerKey,
  });

  if (!current) {
    return { ok: false, skipped: true, reason: 'channel_not_found_or_schema_missing' };
  }

  const next = computeNewHealthState({
    current,
    eventType: 'success',
  });

  await updateChannelHealth({
    supabaseAdmin,
    tenant_id: tenantId,
    channel_account_id: channelAccountId,
    provider: providerKey,
    patch: next,
  });

  try {
    await insertHealthEvent({
      supabaseAdmin,
      tenant_id: tenantId,
      channel_account_id: channelAccountId,
      provider: providerKey,
      severity: 'info',
      error: null,
      context,
    });
  } catch {
    // Non-blocking write for observability.
  }

  return { ok: true, state: next };
}
