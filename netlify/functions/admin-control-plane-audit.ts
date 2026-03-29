import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
  action: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

function json(statusCode: number, body: unknown) {
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
      action: event.queryStringParameters?.action,
      limit: event.queryStringParameters?.limit,
    });

    const query: Record<string, unknown> = {
      tenant_id: parsed.tenant_id,
    };
    if (parsed.action) query.action = parsed.action;
    if (typeof parsed.limit === 'number') query.limit = parsed.limit;

    const proxied = await proxyToOracle({
      path: '/api/control-plane/audit',
      method: 'GET',
      query,
      forwardAuth: true,
      event,
    });

    return json(proxied.status, proxied.json || {});
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 400;
    return json(statusCode, { ok: false, error: String(error?.message || 'bad_request') });
  }
};
