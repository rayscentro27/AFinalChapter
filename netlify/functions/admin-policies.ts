import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
  action: z.string().optional(),
  id: z.string().uuid().optional(),
});

const CreateSchema = z.object({
  tenant_id: z.string().uuid(),
  is_active: z.boolean().optional(),
  priority: z.number().int().optional(),
  effect: z.enum(['allow', 'deny']),
  action: z.string().min(1),
  conditions: z.record(z.any()).default({}),
});

const UpdateSchema = z.object({
  tenant_id: z.string().uuid(),
  id: z.string().uuid(),
  is_active: z.boolean().optional(),
  priority: z.number().int().optional(),
  effect: z.enum(['allow', 'deny']).optional(),
  action: z.string().min(1).optional(),
  conditions: z.record(z.any()).optional(),
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
    if (event.httpMethod === 'GET') {
      const query = QuerySchema.parse({
        tenant_id: event.queryStringParameters?.tenant_id,
        action: event.queryStringParameters?.action,
        id: event.queryStringParameters?.id,
      });

      const proxied = await proxyToOracle({
        path: '/admin/policies',
        method: 'GET',
        query,
        forwardAuth: true,
        event,
      });

      return json(proxied.status, proxied.json || {});
    }

    if (event.httpMethod === 'POST') {
      const body = CreateSchema.parse(JSON.parse(event.body || '{}'));
      const proxied = await proxyToOracle({
        path: '/admin/policies',
        method: 'POST',
        body,
        forwardAuth: true,
        event,
      });
      return json(proxied.status, proxied.json || {});
    }

    if (event.httpMethod === 'PUT') {
      const body = UpdateSchema.parse(JSON.parse(event.body || '{}'));
      const proxied = await proxyToOracle({
        path: `/admin/policies/${encodeURIComponent(body.id)}`,
        method: 'PUT',
        body,
        forwardAuth: true,
        event,
      });
      return json(proxied.status, proxied.json || {});
    }

    if (event.httpMethod === 'DELETE') {
      const query = QuerySchema.parse({
        tenant_id: event.queryStringParameters?.tenant_id,
        id: event.queryStringParameters?.id,
      });

      if (!query.id) return json(400, { ok: false, error: 'missing_id' });

      const proxied = await proxyToOracle({
        path: `/admin/policies/${encodeURIComponent(query.id)}`,
        method: 'DELETE',
        query: { tenant_id: query.tenant_id },
        forwardAuth: true,
        event,
      });

      return json(proxied.status, proxied.json || {});
    }

    return json(405, { ok: false, error: 'method_not_allowed' });
  } catch (error: any) {
    return json(Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
};
