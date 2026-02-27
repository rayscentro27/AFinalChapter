import { randomBytes } from 'node:crypto';
import { sha256Hex } from '../../util/hash.js';
import { supabaseAdmin as defaultSupabaseAdmin } from '../../supabase.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function parseScopes(value) {
  return asArray(value).map((scope) => asText(scope).toLowerCase()).filter(Boolean);
}

export function generateRawApiKey() {
  return `nxa_${randomBytes(24).toString('base64url')}`;
}

export function apiKeyHash(rawKey) {
  return sha256Hex(asText(rawKey));
}

export async function listTenantApiKeys({ supabaseAdmin = defaultSupabaseAdmin, tenant_id }) {
  const tenantId = asText(tenant_id);
  if (!tenantId) throw new Error('missing_tenant_id');

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id,tenant_id,name,scopes,is_active,created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingSchema(error)) return [];
    throw new Error(`api key list failed: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    scopes: parseScopes(row.scopes),
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
  }));
}

export async function createTenantApiKey({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  name,
  scopes = ['read', 'write'],
}) {
  const tenantId = asText(tenant_id);
  const keyName = asText(name) || 'Tenant API Key';
  const scopeList = parseScopes(scopes);

  if (!tenantId) throw new Error('missing_tenant_id');

  const raw_key = generateRawApiKey();
  const key_hash = apiKeyHash(raw_key);

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .insert({
      tenant_id: tenantId,
      name: keyName,
      key_hash,
      scopes: scopeList.length ? scopeList : ['read', 'write'],
      is_active: true,
      created_at: new Date().toISOString(),
    })
    .select('id,tenant_id,name,scopes,is_active,created_at')
    .single();

  if (error) throw new Error(`api key create failed: ${error.message}`);

  return {
    key: {
      id: data.id,
      tenant_id: data.tenant_id,
      name: data.name,
      scopes: parseScopes(data.scopes),
      is_active: Boolean(data.is_active),
      created_at: data.created_at,
    },
    raw_key,
  };
}

export async function revokeTenantApiKey({ supabaseAdmin = defaultSupabaseAdmin, tenant_id, key_id }) {
  const tenantId = asText(tenant_id);
  const keyId = asText(key_id);
  if (!tenantId || !keyId) throw new Error('missing_required_fields');

  const { error } = await supabaseAdmin
    .from('api_keys')
    .update({ is_active: false })
    .eq('tenant_id', tenantId)
    .eq('id', keyId);

  if (error) throw new Error(`api key revoke failed: ${error.message}`);

  return { ok: true };
}

export async function lookupTenantByApiKey({ supabaseAdmin = defaultSupabaseAdmin, rawKey }) {
  const key = asText(rawKey);
  if (!key) return null;

  const key_hash = apiKeyHash(key);

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id,tenant_id,name,scopes,is_active,created_at')
    .eq('key_hash', key_hash)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) return null;
    throw new Error(`api key lookup failed: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    tenant_id: data.tenant_id,
    name: data.name,
    scopes: parseScopes(data.scopes),
    is_active: Boolean(data.is_active),
    created_at: data.created_at,
  };
}

export function requireTenantApiKey({ supabaseAdmin = defaultSupabaseAdmin, requiredScopes = [] } = {}) {
  const required = new Set(parseScopes(requiredScopes));

  return async function tenantApiKeyGuard(req, reply) {
    try {
      const rawKey = req.headers['x-tenant-api-key'];
      const apiKey = await lookupTenantByApiKey({ supabaseAdmin, rawKey });

      if (!apiKey) {
        return reply.code(401).send({ ok: false, error: 'invalid_api_key' });
      }

      if (required.size > 0) {
        const scopeSet = new Set(apiKey.scopes || []);
        const missing = Array.from(required).filter((scope) => !scopeSet.has(scope));
        if (missing.length > 0) {
          return reply.code(403).send({ ok: false, error: 'insufficient_api_key_scope', missing_scopes: missing });
        }
      }

      const tenantInRequest = asText(req?.query?.tenant_id) || asText(req?.body?.tenant_id) || asText(req?.params?.tenant_id);
      if (tenantInRequest && tenantInRequest !== asText(apiKey.tenant_id)) {
        return reply.code(403).send({ ok: false, error: 'tenant_scope_mismatch' });
      }

      req.publicApi = {
        key_id: apiKey.id,
        tenant_id: apiKey.tenant_id,
        scopes: apiKey.scopes,
      };
      return undefined;
    } catch (error) {
      req.log.warn({ err: error }, 'tenant api key auth failed');
      return reply.code(401).send({ ok: false, error: 'invalid_api_key' });
    }
  };
}
