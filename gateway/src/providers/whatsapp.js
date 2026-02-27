import { request } from 'undici';
import { ENV } from '../env.js';

export async function whatsappSendText({ phone_number_id, to, body }) {
  const url = `https://graph.facebook.com/${ENV.WHATSAPP_GRAPH_VERSION}/${phone_number_id}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  };

  const res = await request(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ENV.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.body.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`WhatsApp send failed (${res.statusCode}): ${text}`);
  }

  const provider_message_id = json?.messages?.[0]?.id || `wa:${Date.now()}`;
  return { provider_message_id, raw: json };
}
