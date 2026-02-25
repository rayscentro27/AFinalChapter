import { request } from 'undici';
import { ENV } from '../env.js';

export async function twilioSendSMS({ to, body, from }) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ENV.TWILIO_ACCOUNT_SID}/Messages.json`;

  const form = new URLSearchParams();
  form.set('To', to);
  form.set('From', from || ENV.TWILIO_FROM_NUMBER);
  form.set('Body', body);

  const auth = Buffer.from(`${ENV.TWILIO_ACCOUNT_SID}:${ENV.TWILIO_AUTH_TOKEN}`).toString('base64');

  const res = await request(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const text = await res.body.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`Twilio send failed (${res.statusCode}): ${text}`);
  }

  return { provider_message_id: json.sid, raw: json };
}
