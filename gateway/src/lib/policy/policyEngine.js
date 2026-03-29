import { ENV } from '../../env.js';

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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeScalar(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return lower(value);
}

function matchesGenericCondition(expected, actual) {
  if (Array.isArray(expected)) {
    const normalizedExpected = expected.map((item) => normalizeScalar(item));
    if (Array.isArray(actual)) {
      return actual.map((item) => normalizeScalar(item)).some((item) => normalizedExpected.includes(item));
    }
    return normalizedExpected.includes(normalizeScalar(actual));
  }

  if (expected && typeof expected === 'object') {
    const shape = asObject(expected);
    if (Object.prototype.hasOwnProperty.call(shape, 'in')) {
      return matchesGenericCondition(asArray(shape.in), actual);
    }
    if (Object.prototype.hasOwnProperty.call(shape, 'eq')) {
      return matchesGenericCondition(shape.eq, actual);
    }
    if (Object.prototype.hasOwnProperty.call(shape, 'neq')) {
      return !matchesGenericCondition(shape.neq, actual);
    }
    return true;
  }

  if (typeof expected === 'boolean') {
    return asBool(actual, false) === expected;
  }

  if (typeof expected === 'number') {
    return asNumber(actual, Number.NaN) === expected;
  }

  return normalizeScalar(actual) === normalizeScalar(expected);
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || msg.includes('schema cache')
  );
}

function ipToInt(ip) {
  const parts = String(ip || '').trim().split('.').map((v) => Number(v));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return (((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0)) >>> 0;
}

function ipInCidr(ip, cidr) {
  const [base, bitsRaw] = String(cidr || '').split('/');
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipInt = ipToInt(ip);
  const baseInt = ipToInt(base);
  if (ipInt === null || baseInt === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function inTimeWindow(now, windowDef) {
  const window = asObject(windowDef);
  const start = asText(window.start);
  const end = asText(window.end);
  if (!start || !end) return true;

  const toMinutes = (text) => {
    const match = text.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  };

  const startM = toMinutes(start);
  const endM = toMinutes(end);
  if (startM === null || endM === null) return true;

  const currentM = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (startM <= endM) {
    return currentM >= startM && currentM <= endM;
  }

  // Overnight range (e.g. 22:00-06:00)
  return currentM >= startM || currentM <= endM;
}

function defaultDenyActions() {
  const raw = asText(ENV.POLICY_DEFAULT_DENY_ACTIONS || '');
  if (!raw) return new Set();
  return new Set(raw.split(',').map((item) => lower(item)).filter(Boolean));
}

export async function loadPolicies({ supabaseAdmin, tenant_id, action }) {
  const tenantId = asText(tenant_id);
  const normalizedAction = lower(action);
  if (!tenantId || !normalizedAction) return [];

  const query = supabaseAdmin
    .from('tenant_policies')
    .select('id,tenant_id,is_active,priority,effect,action,conditions,created_at')
    .eq('tenant_id', tenantId)
    .eq('action', normalizedAction)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(500);

  const res = await query;

  if (res.error) {
    if (isMissingSchema(res.error)) return [];
    throw new Error(`tenant_policies lookup failed: ${res.error.message}`);
  }

  return (res.data || []).map((row) => ({
    ...row,
    effect: lower(row.effect) || 'deny',
    action: lower(row.action),
    conditions: asObject(row.conditions),
  }));
}

export function evaluate(action, context = {}, policies = []) {
  const normalizedAction = lower(action);
  const now = context.now instanceof Date ? context.now : new Date();
  const genericConditionKeys = new Set([
    'providers_blocked',
    'ip_cidr',
    'time_window',
    'requires_mfa',
    'max_upload_mb',
    'max_message_length',
  ]);

  for (const policy of policies) {
    if (lower(policy.action) !== normalizedAction) continue;
    const conditions = asObject(policy.conditions);

    let matches = true;

    const providersBlocked = asArray(conditions.providers_blocked).map((item) => lower(item)).filter(Boolean);
    if (providersBlocked.length > 0) {
      const provider = lower(context.provider);
      matches = matches && providersBlocked.includes(provider);
    }

    const ipCidrs = asArray(conditions.ip_cidr).map((item) => asText(item)).filter(Boolean);
    if (ipCidrs.length > 0) {
      const ip = asText(context.ip || context.request_ip);
      matches = matches && ipCidrs.some((cidr) => ipInCidr(ip, cidr));
    }

    if (conditions.time_window) {
      matches = matches && inTimeWindow(now, conditions.time_window);
    }

    if (Object.prototype.hasOwnProperty.call(conditions, 'requires_mfa')) {
      const requiresMfa = asBool(conditions.requires_mfa, false);
      if (requiresMfa) {
        matches = matches && Boolean(context.mfa_present);
      }
    }

    if (Object.prototype.hasOwnProperty.call(conditions, 'max_upload_mb')) {
      const maxUploadMb = asNumber(conditions.max_upload_mb, 0);
      if (maxUploadMb > 0) {
        const bytes = asNumber(context.attachment_bytes, 0);
        matches = matches && (bytes <= Math.round(maxUploadMb * 1024 * 1024));
      }
    }

    if (Object.prototype.hasOwnProperty.call(conditions, 'max_message_length')) {
      const maxLength = asNumber(conditions.max_message_length, 0);
      if (maxLength > 0) {
        const len = asNumber(context.message_length, 0);
        matches = matches && (len <= maxLength);
      }
    }

    for (const [key, expected] of Object.entries(conditions)) {
      if (genericConditionKeys.has(key)) continue;
      matches = matches && matchesGenericCondition(expected, context[key]);
      if (!matches) break;
    }

    if (!matches) continue;

    return {
      allowed: policy.effect !== 'deny',
      reason: policy.effect === 'deny' ? 'policy_deny' : 'policy_allow',
      policy,
    };
  }

  const denyByDefault = defaultDenyActions().has(normalizedAction);
  if (denyByDefault) {
    return {
      allowed: false,
      reason: 'policy_default_deny',
      policy: null,
    };
  }

  return {
    allowed: true,
    reason: 'no_matching_policy',
    policy: null,
  };
}

export async function evaluatePolicy({ supabaseAdmin, action, context }) {
  const tenantId = asText(context?.tenant_id);
  const policies = await loadPolicies({
    supabaseAdmin,
    tenant_id: tenantId,
    action,
  });

  return evaluate(action, context, policies);
}
