import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';
import { requireStaffUser } from './_shared/staff_auth';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
});

const VerifySchema = z.object({
  tenant_id: z.string().uuid(),
});

function json(statusCode: number, body: unknown) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  try {
    await requireStaffUser(event);

    if (event.httpMethod === 'GET') {
      const query = QuerySchema.parse({ tenant_id: event.queryStringParameters?.tenant_id });
      const proxied = await proxyToOracle({
        path: '/api/admin/credential-readiness',
        method: 'GET',
        query,
        forwardAuth: true,
        event,
      });
      return json(proxied.status, { ...(proxied.json || {}), source: 'oracle_api' });
    }

    if (event.httpMethod === 'POST') {
      const integrationKey = String(event.queryStringParameters?.integration_key || '').trim();
      if (!integrationKey) return json(400, { ok: false, error: 'integration_key_required' });
      const body = VerifySchema.parse(JSON.parse(event.body || '{}'));
      const proxied = await proxyToOracle({
        path: `/api/admin/credential-readiness/${encodeURIComponent(integrationKey)}/verify`,
        method: 'POST',
        body,
        forwardAuth: true,
        event,
      });
      return json(proxied.status, { ...(proxied.json || {}), source: 'oracle_api' });
    }

    return json(405, { ok: false, error: 'method_not_allowed' });
  } catch (error: any) {
    return json(Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
};