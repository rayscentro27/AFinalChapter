const CACHE_TTL_MS = 60_000;
const settingsCache = new Map();

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function lower(value) {
  return asText(value).toLowerCase();
}

function asBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const text = lower(value);
  if (text === 'true') return true;
  if (text === 'false') return false;
  return fallback;
}

function isMissingSchemaError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || msg.includes('schema cache')
  );
}

function cacheKey(tenantId) {
  return asText(tenantId);
}

function getCached(tenantId) {
  const key = cacheKey(tenantId);
  const hit = settingsCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    settingsCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(tenantId, value) {
  settingsCache.set(cacheKey(tenantId), {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return value;
}

function normalizeDomains(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => lower(item)).filter(Boolean);
}

function isEmailVerified(jwt) {
  if (jwt?.email_verified === true) return true;
  if (jwt?.user_metadata?.email_verified === true) return true;
  if (jwt?.app_metadata?.email_verified === true) return true;
  if (asText(jwt?.email_confirmed_at)) return true;
  return false;
}

function hasMfaClaim(jwt) {
  const aal = lower(jwt?.aal || jwt?.app_metadata?.aal);
  if (aal === 'aal2' || aal === 'aal3') return true;

  const amr = Array.isArray(jwt?.amr)
    ? jwt.amr
    : Array.isArray(jwt?.app_metadata?.amr)
      ? jwt.app_metadata.amr
      : [];

  for (const item of amr) {
    if (typeof item === 'string' && lower(item).includes('mfa')) return true;
    if (item && typeof item === 'object') {
      const method = lower(item.method || item.type || item.name || '');
      if (method.includes('mfa') || method.includes('totp') || method.includes('otp')) return true;
    }
  }

  return false;
}

function domainFromEmail(email) {
  const parts = asText(email).toLowerCase().split('@');
  if (parts.length !== 2) return '';
  return parts[1].trim();
}

export function clearTenantAuthSettingsCache() {
  settingsCache.clear();
}

export async function getTenantAuthSettings({ supabaseAdmin, tenantId }) {
  const normalizedTenantId = asText(tenantId);
  if (!normalizedTenantId) {
    return {
      tenant_id: normalizedTenantId,
      sso_enabled: false,
      allowed_email_domains: [],
      require_email_verified: false,
      require_mfa_for_admin: false,
      require_mfa_for_merge: true,
    };
  }

  const cached = getCached(normalizedTenantId);
  if (cached) return cached;

  const res = await supabaseAdmin
    .from('tenant_auth_settings')
    .select('tenant_id,sso_enabled,allowed_email_domains,require_email_verified,require_mfa_for_admin,require_mfa_for_merge')
    .eq('tenant_id', normalizedTenantId)
    .maybeSingle();

  if (res.error) {
    if (!isMissingSchemaError(res.error)) {
      throw new Error(`tenant_auth_settings lookup failed: ${res.error.message}`);
    }

    const defaults = {
      tenant_id: normalizedTenantId,
      sso_enabled: false,
      allowed_email_domains: [],
      require_email_verified: false,
      require_mfa_for_admin: false,
      require_mfa_for_merge: true,
    };

    return setCached(normalizedTenantId, defaults);
  }

  const value = {
    tenant_id: normalizedTenantId,
    sso_enabled: asBool(res.data?.sso_enabled, false),
    allowed_email_domains: normalizeDomains(res.data?.allowed_email_domains),
    require_email_verified: asBool(res.data?.require_email_verified, true),
    require_mfa_for_admin: asBool(res.data?.require_mfa_for_admin, false),
    require_mfa_for_merge: asBool(res.data?.require_mfa_for_merge, true),
  };

  return setCached(normalizedTenantId, value);
}

export async function enforceTenantAuthSettings({
  supabaseAdmin,
  tenantId,
  jwt,
  mfaMode = null,
}) {
  const settings = await getTenantAuthSettings({ supabaseAdmin, tenantId });
  const email = asText(jwt?.email);
  const emailDomain = domainFromEmail(email);

  if (settings.sso_enabled) {
    if (!email) {
      const err = new Error('email_required_for_sso');
      err.statusCode = 403;
      throw err;
    }

    if (settings.allowed_email_domains.length > 0 && !settings.allowed_email_domains.includes(emailDomain)) {
      const err = new Error('email_domain_not_allowed');
      err.statusCode = 403;
      throw err;
    }

    if (settings.require_email_verified && !isEmailVerified(jwt)) {
      const err = new Error('email_not_verified');
      err.statusCode = 403;
      throw err;
    }
  }

  if (mfaMode === 'admin' && settings.require_mfa_for_admin && !hasMfaClaim(jwt)) {
    const err = new Error('mfa_required');
    err.statusCode = 403;
    throw err;
  }

  if (mfaMode === 'merge' && settings.require_mfa_for_merge && !hasMfaClaim(jwt)) {
    const err = new Error('mfa_required');
    err.statusCode = 403;
    throw err;
  }

  return {
    settings,
    email,
    email_domain: emailDomain,
    email_verified: isEmailVerified(jwt),
    mfa_present: hasMfaClaim(jwt),
  };
}
