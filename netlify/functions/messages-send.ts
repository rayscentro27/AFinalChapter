import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  conversation_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  body_text: z.string().max(4000).optional(),
  text: z.string().max(4000).optional(),
  attachments: z.array(z.any()).optional(),
  content: z.record(z.any()).optional(),
  provider: z.enum(['meta']).optional(),
  channel_preference: z.string().max(120).optional(),
  identity_id: z.union([z.string(), z.number()]).optional(),
  idempotency_key: z.string().min(8).max(256).optional(),
  client_request_id: z.string().min(8).max(256).optional(),
  to_address: z.string().max(256).optional(),
  to: z.string().max(256).optional(),
  recipient_id: z.string().max(256).optional(),
});

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function hasAttachments(payload: z.infer<typeof BodySchema>) {
  if (Array.isArray(payload.attachments) && payload.attachments.length > 0) return true;
  if (payload.content && Array.isArray((payload.content as any).attachments) && (payload.content as any).attachments.length > 0) return true;
  return false;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    if (!body.conversation_id && !body.contact_id) {
      return json(400, { ok: false, error: 'missing_contact_id_or_conversation_id' });
    }

    const bodyText = String(body.body_text || body.text || '').trim();
    if (!bodyText && !hasAttachments(body)) {
      return json(400, { ok: false, error: 'missing_body_text_or_attachments' });
    }

    const proxied = await proxyToOracle({
      path: '/messages/send',
      method: 'POST',
      body: {
        tenant_id: body.tenant_id,
        conversation_id: body.conversation_id,
        contact_id: body.contact_id,
        body_text: bodyText || null,
        attachments: body.attachments,
        content: body.content,
        provider: body.provider,
        channel_preference: body.channel_preference,
        identity_id: body.identity_id,
        idempotency_key: body.idempotency_key,
        client_request_id: body.client_request_id,
        to_address: body.to_address,
        to: body.to,
        recipient_id: body.recipient_id,
      },
      forwardAuth: true,
      event,
    });

    return json(proxied.status, proxied.json || {});
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 400;
    return json(statusCode, { ok: false, error: String(error?.message || 'bad_request') });
  }
};
