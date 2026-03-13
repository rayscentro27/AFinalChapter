import twilio from 'twilio';
import { getPublicRequestUrl } from '../../util/request.js';

function getHeader(headers, name) {
  const target = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key || '').toLowerCase() === target) return String(value || '').trim();
  }
  return '';
}

export function verifyTwilioWebhookSignature({ req, authToken }) {
  const signature = getHeader(req?.headers, 'x-twilio-signature');
  if (!signature || !String(authToken || '').trim()) return false;

  return twilio.validateRequest(
    String(authToken),
    signature,
    getPublicRequestUrl(req),
    req?.body || {}
  );
}
