import { hmacSha256Hex, safeEqual } from '../../util/hash.js';

function getHeader(headers, name) {
  const target = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key || '').toLowerCase() === target) return String(value || '').trim();
  }
  return '';
}

export function verifyMetaWebhookSignature({ headers, rawBody, appSecret }) {
  const signature = getHeader(headers, 'x-hub-signature-256');
  if (!signature || !String(appSecret || '').trim()) return false;

  const [algo, digest] = signature.split('=');
  if (String(algo || '').toLowerCase() !== 'sha256' || !digest) return false;

  const expected = hmacSha256Hex(String(appSecret), String(rawBody || ''));
  return safeEqual(digest, expected);
}
