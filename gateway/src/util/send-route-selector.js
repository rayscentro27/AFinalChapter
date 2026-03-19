import { supabaseAdmin as defaultSupabaseAdmin } from '../supabase.js';

const SUPPORTED_PROVIDERS = new Set(['meta']);

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  const out = String(value || '').trim();
  return out;
}

function lower(value) {
  return asText(value).toLowerCase();
}

function normalizeProvider(value) {
  const raw = lower(value);
  return raw;
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

  const normalizedProvider = normalizeProvider(provider);
  if (normalizedProvider === 'meta') return value;

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
    provider: normalizeProvider(row.provider),
    health_status: row.health_status || 'healthy',
    health_next_retry_at: row.health_next_retry_at || null,
  }));
}

async function loadIdentityRouteHints({ supabaseAdmin, outbox }) {
  const tenantId = asText(outbox?.tenant_id);
  const contactId = asText(outbox?.contact_id);
  const provider = normalizeProvider(outbox?.provider);

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

function providerRecipientFromIdentity(provider, identityType, identityValue) {
  const normalizedProvider = normalizeProvider(provider);
  if (!SUPPORTED_PROVIDERS.has(normalizedProvider)) return '';

  if (normalizedProvider === 'meta') {
    const type = lower(identityType);
    if (type === 'psid' || type === 'igsid') return asText(identityValue);
    return '';
  }

  const type = lower(identityType);
  if (type !== 'phone') return '';
  return normalizePhone(identityValue);
}

function identityQuality(identity) {
  return (identity?.verified ? 100 : 0)
    + (identity?.is_primary ? 25 : 0)
    + Math.max(0, Number(identity?.confidence || 0));
}

async function loadConversationRouteContext({ supabaseAdmin, tenant_id, conversation_id }) {
  if (!tenant_id || !conversation_id) return null;

  const conversation = await supabaseAdmin
    .from('conversations')
    .select('id,tenant_id,contact_id,channel_account_id')
    .eq('tenant_id', tenant_id)
    .eq('id', conversation_id)
    .maybeSingle();

  if (conversation.error) {
    if (isSchemaMissingError(conversation.error)) return null;
    throw new Error(`conversation route context lookup failed: ${conversation.error.message}`);
  }

  if (!conversation.data) return null;

  const channel = await supabaseAdmin
    .from('channel_accounts')
    .select('id,tenant_id,provider,external_account_id,is_active,health_status,health_next_retry_at')
    .eq('tenant_id', tenant_id)
    .eq('id', conversation.data.channel_account_id)
    .maybeSingle();

  if (channel.error) {
    if (isSchemaMissingError(channel.error)) return {
      conversation: conversation.data,
      channel: null,
      recipient: null,
    };
    throw new Error(`conversation channel context lookup failed: ${channel.error.message}`);
  }

  const latestMessage = await supabaseAdmin
    .from('messages')
    .select('direction,from_id,to_id,received_at,created_at')
    .eq('tenant_id', tenant_id)
    .eq('conversation_id', conversation_id)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestMessage.error && !isSchemaMissingError(latestMessage.error)) {
    throw new Error(`conversation latest message lookup failed: ${latestMessage.error.message}`);
  }

  const direction = lower(latestMessage.data?.direction);
  const recipient = direction === 'in'
    ? asText(latestMessage.data?.from_id)
    : asText(latestMessage.data?.to_id);

  return {
    conversation: conversation.data,
    channel: channel.data ? {
      ...channel.data,
      provider: normalizeProvider(channel.data.provider),
      health_status: channel.data.health_status || 'healthy',
      health_next_retry_at: channel.data.health_next_retry_at || null,
    } : null,
    recipient: recipient || null,
  };
}

async function loadContactIdentityCandidates({
  supabaseAdmin,
  tenant_id,
  contact_id,
  identity_id,
}) {
  if (!tenant_id || !contact_id) return [];

  let query = supabaseAdmin
    .from('contact_identities')
    .select('id,provider,identity_type,identity_value,channel_account_id,verified,confidence,is_primary,created_at')
    .eq('tenant_id', tenant_id)
    .eq('contact_id', contact_id)
    .limit(300);

  if (identity_id !== null && identity_id !== undefined && String(identity_id).trim().length > 0) {
    query = query.eq('id', identity_id);
  }

  const { data, error } = await query;
  if (error) {
    if (isSchemaMissingError(error)) return [];
    throw new Error(`contact identity candidates lookup failed: ${error.message}`);
  }

  const candidates = [];
  for (const row of data || []) {
    const provider = normalizeProvider(row.provider);
    if (!SUPPORTED_PROVIDERS.has(provider)) continue;

    const recipient = providerRecipientFromIdentity(provider, row.identity_type, row.identity_value);
    if (!recipient) continue;

    candidates.push({
      source: 'identity',
      provider,
      to_address: recipient,
      channel_account_id: asText(row.channel_account_id) || null,
      identity_id: row.id,
      score: 500 + identityQuality(row),
      quality: identityQuality(row),
      created_at: row.created_at || null,
    });
  }

  return candidates;
}

function asProviderPreference(value) {
  const normalized = normalizeProvider(value);
  return SUPPORTED_PROVIDERS.has(normalized) ? normalized : null;
}

function computeFromAddress(provider, selectedChannel, fallbackFromAddress = null) {
  const explicit = asText(fallbackFromAddress);
  if (provider === 'meta') {
    return explicit || asText(selectedChannel?.external_account_id) || null;
  }

  return explicit || null;
}

async function channelsByProvider({ supabaseAdmin, tenant_id, providers }) {
  const map = new Map();
  for (const provider of providers) {
    const rows = await loadProviderChannels({ supabaseAdmin, tenant_id, provider });
    map.set(provider, rows);
  }
  return map;
}

function chooseEligibleChannel({ rows, nowMs, preferredChannelId }) {
  const eligible = (rows || []).filter((row) => isRouteEligible(row, nowMs));
  if (!eligible.length) return null;

  if (preferredChannelId) {
    const match = eligible.find((row) => asText(row.id) === asText(preferredChannelId));
    if (match) return match;
  }

  const ranked = [...eligible].sort((a, b) => {
    const rank = healthRank(a.health_status) - healthRank(b.health_status);
    if (rank !== 0) return rank;
    return asText(a.id).localeCompare(asText(b.id));
  });

  return ranked[0] || null;
}

export async function resolveBestIdentityForQueue({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  contact_id,
  conversation_id = null,
  preferred_provider = null,
  channel_preference = null,
  to_address = null,
  identity_id = null,
  now = new Date(),
}) {
  const tenantId = asText(tenant_id);
  if (!tenantId) {
    return { ok: false, reason: 'missing_tenant_id' };
  }

  const nowMs = new Date(now).getTime();
  const channelPreferenceText = asText(channel_preference) || null;
  const providerPreference = asProviderPreference(preferred_provider) || asProviderPreference(channel_preference);

  const conversationCtx = await loadConversationRouteContext({
    supabaseAdmin,
    tenant_id: tenantId,
    conversation_id: asText(conversation_id),
  });

  const resolvedContactId = asText(contact_id) || asText(conversationCtx?.conversation?.contact_id) || null;

  const candidates = [];

  const explicitRecipient = asText(to_address);
  if (explicitRecipient && providerPreference) {
    candidates.push({
      source: 'explicit',
      provider: providerPreference,
      to_address: normalizeIdentityValue(providerPreference, providerPreference === 'meta' ? 'psid' : 'phone', explicitRecipient),
      channel_account_id: null,
      identity_id: null,
      score: 700,
      quality: 0,
      from_address: null,
    });
  }

  if (conversationCtx?.channel?.provider && conversationCtx?.recipient) {
    candidates.push({
      source: 'conversation',
      provider: normalizeProvider(conversationCtx.channel.provider),
      to_address: normalizeIdentityValue(
        conversationCtx.channel.provider,
        normalizeProvider(conversationCtx.channel.provider) === 'meta' ? 'psid' : 'phone',
        conversationCtx.recipient,
      ),
      channel_account_id: asText(conversationCtx.channel.id) || null,
      identity_id: null,
      score: 1200,
      quality: 0,
      from_address: asText(conversationCtx.channel.external_account_id) || null,
    });
  }

  const identityCandidates = await loadContactIdentityCandidates({
    supabaseAdmin,
    tenant_id: tenantId,
    contact_id: resolvedContactId,
    identity_id,
  });

  for (const candidate of identityCandidates) candidates.push(candidate);

  if (!candidates.length) {
    return {
      ok: false,
      reason: 'no_identity_route_candidates',
      contact_id: resolvedContactId,
    };
  }

  const providers = Array.from(new Set(candidates.map((candidate) => normalizeProvider(candidate.provider)).filter(Boolean)));
  const channelsMap = await channelsByProvider({
    supabaseAdmin,
    tenant_id: tenantId,
    providers,
  });

  const expanded = [];

  for (const candidate of candidates) {
    const provider = normalizeProvider(candidate.provider);
    if (!SUPPORTED_PROVIDERS.has(provider)) continue;

    const providerChannels = channelsMap.get(provider) || [];
    const selectedChannel = chooseEligibleChannel({
      rows: providerChannels,
      nowMs,
      preferredChannelId: candidate.channel_account_id || channelPreferenceText,
    });

    if (!selectedChannel) continue;

    const preferredBonus = providerPreference && provider === providerPreference ? 300 : 0;
    const conversationBonus = candidate.source === 'conversation' ? 200 : 0;
    const explicitBonus = candidate.source === 'explicit' ? 150 : 0;
    const healthPenalty = healthRank(selectedChannel.health_status) * 100;
    const score = Number(candidate.score || 0) + preferredBonus + conversationBonus + explicitBonus - healthPenalty;

    expanded.push({
      provider,
      to_address: candidate.to_address,
      from_address: computeFromAddress(provider, selectedChannel, candidate.from_address),
      channel_account_id: asText(selectedChannel.id),
      identity_id: candidate.identity_id || null,
      health_status: lower(selectedChannel.health_status || 'healthy') || 'healthy',
      score,
      source: candidate.source,
      fallback_used: Boolean(providerPreference && provider !== providerPreference),
    });
  }

  if (!expanded.length) {
    return {
      ok: false,
      reason: 'no_healthy_route',
      contact_id: resolvedContactId,
      provider_preference: providerPreference,
      candidates_total: candidates.length,
    };
  }

  expanded.sort((a, b) => b.score - a.score || a.provider.localeCompare(b.provider));
  const selected = expanded[0];

  return {
    ok: true,
    tenant_id: tenantId,
    contact_id: resolvedContactId,
    provider: selected.provider,
    to_address: selected.to_address,
    from_address: selected.from_address,
    channel_account_id: selected.channel_account_id,
    identity_id: selected.identity_id,
    health_status: selected.health_status,
    fallback_used: selected.fallback_used,
    source: selected.source,
    candidate_count: expanded.length,
  };
}

export async function resolveBestIdentityForSend({
  supabaseAdmin = defaultSupabaseAdmin,
  outbox,
  now = new Date(),
}) {
  const tenantId = asText(outbox?.tenant_id);
  const provider = normalizeProvider(outbox?.provider);
  if (!tenantId || !provider) {
    return {
      ok: false,
      reason: 'missing_tenant_or_provider',
      candidates_total: 0,
      eligible_total: 0,
    };
  }

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return {
      ok: false,
      reason: 'unsupported_provider',
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
  if (provider === 'meta') {
    fromAddress = asText(selected.external_account_id);
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
