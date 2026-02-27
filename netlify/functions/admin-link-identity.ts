import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  provider: z.string().min(1),
  identity_type: z.string().min(1),
  identity_value: z.string().min(1),
  channel_account_id: z.string().uuid().optional().nullable(),
  verified: z.boolean().optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  is_primary: z.boolean().optional(),
  metadata: z.any().optional(),
});

function getAuthHeader(event: { headers?: Record<string, string | undefined> }): string {
  const hit = Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === 'authorization')?.[1];
  return String(hit || '').trim();
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    const auth = getAuthHeader(event);
    if (!auth.toLowerCase().startsWith('bearer ')) {
      return json(401, { ok: false, error: 'missing_authorization' });
    }

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const proxied = await proxyToOracle({
      path: '/admin/contacts/link-identity',
      method: 'POST',
      body,
      forwardAuth: true,
      event,
    });

    return json(proxied.status, proxied.json || {});
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 400;
    return json(statusCode, { ok: false, error: String(error?.message || 'bad_request') });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
