import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
  role_key: z.string().optional(),
  membership_tier: z.enum(['tier1', 'tier2', 'tier3']).optional(),
  active_only: z.union([z.literal('true'), z.literal('false')]).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
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
      role_key: event.queryStringParameters?.role_key,
      membership_tier: event.queryStringParameters?.membership_tier,
      active_only: event.queryStringParameters?.active_only,
      limit: event.queryStringParameters?.limit,
    });

    const query = {
      tenant_id: parsed.tenant_id,
      role_key: parsed.role_key,
      membership_tier: parsed.membership_tier,
      active_only: parsed.active_only === undefined ? undefined : parsed.active_only === 'true',
      limit: parsed.limit,
    };

    const proxied = await proxyToOracle({
      path: '/admin/ai/playbooks',
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
