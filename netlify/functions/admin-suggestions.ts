import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
  type: z.enum(['merge_contacts', 'link_identity']).optional(),
  status: z.enum(['open', 'approved', 'rejected', 'all']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  refresh: z.enum(['true', 'false']).optional(),
});

function json(statusCode: number, body: any) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });

    const query = QuerySchema.parse({
      tenant_id: event.queryStringParameters?.tenant_id,
      type: event.queryStringParameters?.type,
      status: event.queryStringParameters?.status,
      limit: event.queryStringParameters?.limit,
      refresh: event.queryStringParameters?.refresh,
    });

    const proxied = await proxyToOracle({
      path: '/admin/suggestions',
      method: 'GET',
      query,
      forwardAuth: true,
      event,
    });

    return json(proxied.status, proxied.json || {});
  } catch (error: any) {
    return json(Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
};
