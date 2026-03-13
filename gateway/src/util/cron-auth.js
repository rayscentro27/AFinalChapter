import crypto from 'node:crypto';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseIps(raw) {
  return String(raw || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function isLoopbackIp(ip) {
  const value = String(ip || '').trim().toLowerCase();
  return (
    value === '127.0.0.1'
    || value === '::1'
    || value === '::ffff:127.0.0.1'
    || value === 'localhost'
  );
}

export function isLocalRequest(req) {
  const directIp = asText(req?.ip);
  if (isLoopbackIp(directIp)) return true;

  const forwarded = parseIps(req?.headers?.['x-forwarded-for']);
  if (forwarded.length > 0 && forwarded.every(isLoopbackIp)) return true;

  const realIp = asText(req?.headers?.['x-real-ip']);
  if (isLoopbackIp(realIp)) return true;

  return false;
}

export function hasValidCronToken(req, expectedToken) {
  const configured = asText(expectedToken);
  if (!configured) return false;

  const incoming = asText(req?.headers?.['x-cron-token']);
  if (!incoming) return false;

  return safeEqual(incoming, configured);
}

export function parseAllowedTenantIds(raw) {
  return new Set(
    String(raw || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
}
