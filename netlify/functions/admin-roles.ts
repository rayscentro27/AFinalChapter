import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
  role_id: z.string().uuid().optional(),
});

const CreateSchema = z.object({
  tenant_id: z.string().uuid(),
  key: z.string().min(2).max(48),
  name: z.string().min(1).max(120),
  permissions: z.array(z.string()).default([]),
});

const UpdateSchema = z.object({
  tenant_id: z.string().uuid(),
  role_id: z.string().uuid(),
  key: z.string().min(2).max(48).optional(),
  name: z.string().min(1).max(120).optional(),
  permissions: z.array(z.string()).optional(),
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
        role_id: event.queryStringParameters?.role_id,
      });

      const proxied = await proxyToOracle({
        path: '/admin/roles',
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
        path: '/admin/roles',
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
        path: `/admin/roles/${encodeURIComponent(body.role_id)}`,
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
        role_id: event.queryStringParameters?.role_id,
      });

      if (!query.role_id) {
        return json(400, { ok: false, error: 'missing_role_id' });
      }

      const proxied = await proxyToOracle({
        path: `/admin/roles/${encodeURIComponent(query.role_id)}`,
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
