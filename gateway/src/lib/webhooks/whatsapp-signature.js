import { hmacSha256Hex, safeEqual } from '../../util/hash.js';
import { verifyMetaWebhookSignature } from './meta-signature.js';

function getHeader(headers, names) {
  const wanted = new Set((names || []).map((name) => String(name || '').toLowerCase()));
  for (const [key, value] of Object.entries(headers || {})) {
    if (wanted.has(String(key || '').toLowerCase())) return String(value || '').trim();
  }
  return '';
}

export function verifyWhatsAppWebhookSignature({ headers, rawBody, whatsappWebhookSecret, metaAppSecret }) {
  const configuredSecret = String(whatsappWebhookSecret || '').trim();
  if (configuredSecret) {
    const signature = getHeader(headers, [
      'x-whatsapp-signature-256',
      'x-signature-256',
      'x-webhook-signature',
    ]);

    if (!signature) {
      // TODO: If your vendor uses a different header, update this verifier mapping.
      return false;
    }

    const [algo, digest] = signature.split('=');
    if (String(algo || '').toLowerCase() !== 'sha256' || !digest) return false;

    const expected = hmacSha256Hex(configuredSecret, String(rawBody || ''));
    return safeEqual(digest, expected);
  }

  // Cloud API compatibility path (Meta signature header).
  return verifyMetaWebhookSignature({ headers, rawBody, appSecret: metaAppSecret });
}
