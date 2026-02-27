import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

function getAuthHeader(event: { headers?: Record<string, string | undefined> }): string {
  const hit = Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === 'authorization')?.[1];
  return String(hit || '').trim();
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });

    const auth = getAuthHeader(event);
    if (!auth.toLowerCase().startsWith('bearer ')) {
      return json(401, { ok: false, error: 'missing_authorization' });
    }

    const query = QuerySchema.parse({
      tenant_id: event.queryStringParameters?.tenant_id,
      contact_id: event.queryStringParameters?.contact_id,
      limit: event.queryStringParameters?.limit,
    });

    const proxied = await proxyToOracle({
      path: `/contacts/${query.tenant_id}/${query.contact_id}/timeline`,
      method: 'GET',
      query: {
        limit: query.limit || 200,
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
