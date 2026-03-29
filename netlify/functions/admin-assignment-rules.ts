import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const GetQuerySchema = z.object({
  tenant_id: z.string().uuid(),
});

const CreateBodySchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  is_active: z.boolean().optional(),
  match: z.record(z.any()).default({}),
  action: z.record(z.any()).default({}),
});

const UpdateBodySchema = z.object({
  tenant_id: z.string().uuid(),
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  is_active: z.boolean().optional(),
  match: z.record(z.any()).optional(),
  action: z.record(z.any()).optional(),
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
      const query = GetQuerySchema.parse({
        tenant_id: event.queryStringParameters?.tenant_id,
      });

      const proxied = await proxyToOracle({
        path: '/admin/assignment-rules',
        method: 'GET',
        query,
        forwardAuth: true,
        event,
      });

      return json(proxied.status, proxied.json || {});
    }

    if (event.httpMethod === 'POST') {
      const body = CreateBodySchema.parse(JSON.parse(event.body || '{}'));

      const proxied = await proxyToOracle({
        path: '/admin/assignment-rules',
        method: 'POST',
        body,
        forwardAuth: true,
        event,
      });

      return json(proxied.status, proxied.json || {});
    }

    if (event.httpMethod === 'PUT') {
      const body = UpdateBodySchema.parse(JSON.parse(event.body || '{}'));

      const proxied = await proxyToOracle({
        path: '/admin/assignment-rules',
        method: 'PUT',
        body,
        forwardAuth: true,
        event,
      });

      return json(proxied.status, proxied.json || {});
    }

    return json(405, { ok: false, error: 'method_not_allowed' });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 400;
    return json(statusCode, { ok: false, error: String(error?.message || 'bad_request') });
  }
};
