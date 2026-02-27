import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({ tenant_id: z.string().uuid() });
const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  scopes: z.array(z.string()).optional(),
});

function json(statusCode: number, body: any) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      const query = QuerySchema.parse({ tenant_id: event.queryStringParameters?.tenant_id });
      const proxied = await proxyToOracle({ path: '/admin/public/api-keys', method: 'GET', query, forwardAuth: true, event });
      return json(proxied.status, proxied.json || {});
    }

    if (event.httpMethod === 'POST') {
      const body = BodySchema.parse(JSON.parse(event.body || '{}'));
      const proxied = await proxyToOracle({ path: '/admin/public/api-keys', method: 'POST', body, forwardAuth: true, event });
      return json(proxied.status, proxied.json || {});
    }

    return json(405, { ok: false, error: 'method_not_allowed' });
  } catch (error: any) {
    return json(Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
};
