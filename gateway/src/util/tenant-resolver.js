import { supabaseAdmin } from '../supabase.js';

const CACHE_TTL_MS = 60_000;
const cache = new Map();

function cacheKey(provider, externalAccountId) {
  return `${provider}:${externalAccountId}`;
}

export async function resolveChannelAccount(provider, externalAccountId) {
  if (!provider || !externalAccountId) return null;

  const key = cacheKey(provider, externalAccountId);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const { data, error } = await supabaseAdmin
    .from('channel_accounts')
    .select('id, tenant_id, provider, external_account_id, is_active')
    .eq('provider', provider)
    .eq('external_account_id', externalAccountId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(`Channel account resolution failed: ${error.message}`);

  const value = data
    ? {
        channelAccountId: data.id,
        tenantId: data.tenant_id,
        provider: data.provider,
        externalAccountId: data.external_account_id,
      }
    : null;

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function resolveTenantByChannel(provider, externalAccountId) {
  const row = await resolveChannelAccount(provider, externalAccountId);
  return row?.tenantId || null;
}
