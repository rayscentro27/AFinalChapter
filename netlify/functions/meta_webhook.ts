import type { Handler } from '@netlify/functions';
import crypto from 'node:crypto';

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function parseRawBody(body: string | null) {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function verifySignature(rawBody: string, signatureHeader: string | undefined, appSecret: string) {
  if (!signatureHeader) return false;
  const [algo, received] = signatureHeader.split('=');
  if (algo !== 'sha256' || !received) return false;

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export const handler: Handler = async (event) => {
  const method = event.httpMethod;

  if (method === 'GET') {
    const mode = event.queryStringParameters?.['hub.mode'];
    const token = event.queryStringParameters?.['hub.verify_token'];
    const challenge = event.queryStringParameters?.['hub.challenge'];

    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (!verifyToken) {
      return json(500, { error: 'Server misconfigured: META_WEBHOOK_VERIFY_TOKEN is missing.' });
    }

    if (mode === 'subscribe' && token === verifyToken && challenge) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: challenge,
      };
    }

    return json(403, { error: 'Webhook verification failed.' });
  }

  if (method === 'POST') {
    const rawBody = event.body || '';
    const appSecret = process.env.META_APP_SECRET || '';
    const signature = event.headers['x-hub-signature-256'] || event.headers['X-Hub-Signature-256'];

    if (appSecret) {
      const ok = verifySignature(rawBody, signature, appSecret);
      if (!ok) {
        return json(401, { error: 'Invalid signature.' });
      }
    }

    const payload = parseRawBody(rawBody);
    if (!payload) {
      return json(400, { error: 'Invalid JSON body.' });
    }

    // Minimal event ack; add event routing logic here.
    return json(200, {
      ok: true,
      received: true,
      object: (payload as any)?.object || null,
      entry_count: Array.isArray((payload as any)?.entry) ? (payload as any).entry.length : 0,
    });
  }

  return json(405, { error: 'Method not allowed.' });
};
