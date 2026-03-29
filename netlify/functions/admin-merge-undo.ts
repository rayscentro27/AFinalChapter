import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  job_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  reason: z.string().max(500).optional().nullable(),
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
    const job_id = typeof body.job_id === 'string' ? Number(body.job_id) : body.job_id;

    const proxied = await proxyToOracle({
      path: '/admin/contacts/merge/undo',
      method: 'POST',
      body: {
        tenant_id: body.tenant_id,
        job_id,
        reason: body.reason || null,
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

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
