import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  asset_type: z.enum(['forex', 'options']).optional(),
});

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });

    const parsed = QuerySchema.parse({
      tenant_id: event.queryStringParameters?.tenant_id,
      limit: event.queryStringParameters?.limit,
      asset_type: event.queryStringParameters?.asset_type,
    });

    const proxied = await proxyToOracle({
      path: '/api/research/approved-signals',
      method: 'GET',
      query: {
        tenant_id: parsed.tenant_id,
        limit: parsed.limit ?? 10,
        asset_type: parsed.asset_type,
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