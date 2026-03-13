const REDACTED = '[REDACTED]';

const DEFAULT_KEYS = new Set([
  'authorization',
  'x-api-key',
  'access_token',
  'app_secret',
  'service_role_key',
  'supabase_service_role_key',
]);

function shouldRedactKey(key, keys) {
  const normalized = String(key || '').trim().toLowerCase();
  if (!normalized) return false;
  return keys.has(normalized);
}

function redactArray(input, keys) {
  return input.map((item) => redactSecrets(item, keys));
}

function redactObject(input, keys) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (shouldRedactKey(key, keys)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = redactSecrets(value, keys);
  }
  return out;
}

export function redactSecrets(value, keys = DEFAULT_KEYS) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return redactArray(value, keys);
  if (typeof value === 'object') return redactObject(value, keys);
  return value;
}

export function redactText(value) {
  const text = String(value || '');
  if (!text) return text;

  return text
    .replace(/(authorization\s*[:=]\s*)(bearer\s+[a-z0-9._-]+)/gi, `$1${REDACTED}`)
    .replace(/(x-api-key\s*[:=]\s*)([^\s]+)/gi, `$1${REDACTED}`)
    .replace(/(access_token\s*[:=]\s*)([^\s&]+)/gi, `$1${REDACTED}`)
    .replace(/(service_role_key\s*[:=]\s*)([^\s&]+)/gi, `$1${REDACTED}`)
    .replace(/(app_secret\s*[:=]\s*)([^\s&]+)/gi, `$1${REDACTED}`);
}

export function redactError(error) {
  return {
    message: redactText(error?.message || ''),
    code: error?.code || null,
    statusCode: Number(error?.statusCode) || null,
  };
}
