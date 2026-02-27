import { request } from 'undici';
import { ENV } from '../env.js';

export async function metaSendText({ recipient_id, text }) {
  const url = `https://graph.facebook.com/${ENV.META_GRAPH_VERSION}/me/messages`;

  const payload = {
    messaging_type: 'RESPONSE',
    recipient: { id: recipient_id },
    message: { text },
  };

  const res = await request(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ENV.META_PAGE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await res.body.text();
  let json;
  try {
    json = JSON.parse(bodyText);
  } catch {
    json = { raw: bodyText };
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`Meta send failed (${res.statusCode}): ${bodyText}`);
  }

  const provider_message_id = json?.message_id || `meta:${Date.now()}`;
  return { provider_message_id, raw: json };
}
