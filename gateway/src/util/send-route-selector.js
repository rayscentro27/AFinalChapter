import { ENV } from '../env.js';
import { supabaseAdmin as defaultSupabaseAdmin } from '../supabase.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  const out = String(value || '').trim();
  return out;
}

function lower(value) {
  return asText(value).toLowerCase();
}

function normalizePhone(value) {
  let out = asText(value).replace(/[^\d+]/g, '');
  if (!out) return '';
  if (!out.startsWith('+') && /^\d{10}$/.test(out)) out = `+1${out}`;
  return out;
}

function normalizeIdentityValue(provider, identityType, rawValue) {
  const value = asText(rawValue);
  if (!value) return '';

  const type = lower(identityType);
  if (type === 'email') return value.toLowerCase();
  if (type === 'phone') return normalizePhone(value);

  if (lower(provider) === 'meta') return value;
  if (lower(provider) === 'whatsapp' || lower(provider) === 'twilio') return normalizePhone(value);

  return value;
}

function parseDateMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function healthRank(status) {
  const value = lower(status || 'healthy');
  if (value === 'healthy') return 0;
  if (value === 'degraded') return 1;
  if (value === 'down') return 2;
  return 1;
}

function isRouteEligible(channel, nowMs) {
  if (!channel?.is_active) return false;

  const status = lower(channel?.health_status || 'healthy');
  if (status !== 'down') return true;

  const retryMs = parseDateMs(channel?.health_next_retry_at);
  if (retryMs === null) return true;
  return retryMs <= nowMs;
}

function isSchemaMissingError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

async function loadProviderChannels({ supabaseAdmin, tenant_id, provider }) {
  let result = await supabaseAdmin
    .from('channel_accounts')
    .select('id,tenant_id,provider,external_account_id,label,is_active,health_status,health_next_retry_at')
    .eq('tenant_id', tenant_id)
    .eq('provider', provider)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (result.error && isSchemaMissingError(result.error)) {
    result = await supabaseAdmin
      .from('channel_accounts')
      .select('id,tenant_id,provider,external_account_id,label,is_active')
      .eq('tenant_id', tenant_id)
      .eq('provider', provider)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
  }

  if (result.error) throw new Error(`channel_accounts route lookup failed: ${result.error.message}`);

  return (result.data || []).map((row) => ({
    ...row,
    health_status: row.health_status || 'healthy',
    health_next_retry_at: row.health_next_retry_at || null,
  }));
}

async function loadIdentityRouteHints({ supabaseAdmin, outbox }) {
  const tenantId = asText(outbox?.tenant_id);
  const contactId = asText(outbox?.contact_id);
  const provider = lower(outbox?.provider);

  if (!tenantId || !contactId || !provider) {
    return { matchedChannelIds: new Set(), qualityByChannel: new Map() };
  }

  const { data, error } = await supabaseAdmin
    .from('contact_identities')
    .select('channel_account_id,identity_type,identity_value,is_primary,verified,confidence')
    .eq('tenant_id', tenantId)
    .eq('contact_id', contactId)
    .eq('provider', provider)
    .limit(200);

  if (error) {
    if (isSchemaMissingError(error)) {
      return { matchedChannelIds: new Set(), qualityByChannel: new Map() };
    }
    throw new Error(`contact_identities route hint lookup failed: ${error.message}`);
  }

  const targetTo = normalizeIdentityValue(provider, provider === 'meta' ? 'psid' : 'phone', outbox?.to_address);
  const matchedChannelIds = new Set();
  const qualityByChannel = new Map();

  for (const row of data || []) {
    const channelId = asText(row?.channel_account_id);
    if (!channelId) continue;

    const normalizedValue = normalizeIdentityValue(provider, row?.identity_type, row?.identity_value);
    const quality = (row?.verified ? 100 : 0)
      + (row?.is_primary ? 25 : 0)
      + Math.max(0, Number(row?.confidence || 0));

    const prev = Number(qualityByChannel.get(channelId) || 0);
    if (quality > prev) qualityByChannel.set(channelId, quality);

    if (targetTo && normalizedValue && normalizedValue === targetTo) {
      matchedChannelIds.add(channelId);
    }
  }

  return { matchedChannelIds, qualityByChannel };
}

export async function resolveBestIdentityForSend({
  supabaseAdmin = defaultSupabaseAdmin,
  outbox,
  now = new Date(),
}) {
  const tenantId = asText(outbox?.tenant_id);
  const provider = lower(outbox?.provider);
  if (!tenantId || !provider) {
    return {
      ok: false,
      reason: 'missing_tenant_or_provider',
      candidates_total: 0,
      eligible_total: 0,
    };
  }

  const channels = await loadProviderChannels({ supabaseAdmin, tenant_id: tenantId, provider });
  const nowMs = new Date(now).getTime();

  const eligible = channels.filter((row) => isRouteEligible(row, nowMs));
  if (!eligible.length) {
    return {
      ok: false,
      reason: 'no_healthy_route',
      candidates_total: channels.length,
      eligible_total: 0,
      blocked_total: channels.length,
    };
  }

  const preferredChannelId = asText(outbox?.channel_account_id);
  const hints = await loadIdentityRouteHints({ supabaseAdmin, outbox });

  const scored = eligible.map((channel) => {
    let score = healthRank(channel.health_status) * 100;

    if (preferredChannelId && channel.id === preferredChannelId) score -= 25;
    if (hints.matchedChannelIds.has(channel.id)) score -= 20;

    const quality = Number(hints.qualityByChannel.get(channel.id) || 0);
    score -= Math.min(30, Math.floor(quality / 10));

    return {
      channel,
      score,
      quality,
      matched: hints.matchedChannelIds.has(channel.id),
    };
  });

  scored.sort((a, b) => a.score - b.score || a.channel.id.localeCompare(b.channel.id));
  const selected = scored[0]?.channel;

  if (!selected) {
    return {
      ok: false,
      reason: 'no_healthy_route',
      candidates_total: channels.length,
      eligible_total: eligible.length,
    };
  }

  let fromAddress = asText(outbox?.from_address);
  if (provider === 'whatsapp' || provider === 'meta') {
    fromAddress = asText(selected.external_account_id);
  } else if (provider === 'twilio') {
    fromAddress = fromAddress || asText(selected.external_account_id) || asText(ENV.TWILIO_FROM_NUMBER);
  }

  return {
    ok: true,
    provider,
    tenant_id: tenantId,
    channel_account_id: selected.id,
    from_address: fromAddress || null,
    to_address: asText(outbox?.to_address) || null,
    health_status: lower(selected.health_status || 'healthy') || 'healthy',
    candidates_total: channels.length,
    eligible_total: eligible.length,
  };
}
