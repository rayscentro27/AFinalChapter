import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
  scope: z.string().min(1).optional(),
  scope_id: z.string().optional(),
  enabled_only: z.enum(['true', 'false']).optional(),
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
      scope: event.queryStringParameters?.scope,
      scope_id: event.queryStringParameters?.scope_id,
      enabled_only: event.queryStringParameters?.enabled_only,
      limit: event.queryStringParameters?.limit,
    });

    const query: Record<string, unknown> = {
      tenant_id: parsed.tenant_id,
    };
    if (parsed.scope) query.scope = parsed.scope;
    if (parsed.scope_id) query.scope_id = parsed.scope_id;
    if (parsed.enabled_only) query.enabled_only = parsed.enabled_only;
    if (typeof parsed.limit === 'number') query.limit = parsed.limit;

    const proxied = await proxyToOracle({
      path: '/api/control-plane/flags',
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
