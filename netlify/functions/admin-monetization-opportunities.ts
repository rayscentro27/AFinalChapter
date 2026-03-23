import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  hours: z.coerce.number().int().min(24).max(720).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  tenant_id: z.string().uuid().optional(),
});

function json(statusCode: number, body: unknown) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') {
      return json(405, { ok: false, error: 'method_not_allowed' });
    }

    const query = QuerySchema.parse({
      hours: event.queryStringParameters?.hours,
      limit: event.queryStringParameters?.limit,
      tenant_id: event.queryStringParameters?.tenant_id,
    });

    const proxied = await proxyToOracle({
      path: '/admin/monetization-opportunities',
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