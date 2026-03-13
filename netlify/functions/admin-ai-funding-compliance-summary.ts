import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
  contact_id: z.string().uuid().optional(),
  lender_name: z.string().optional(),
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

    const query = QuerySchema.parse({
      tenant_id: event.queryStringParameters?.tenant_id,
      contact_id: event.queryStringParameters?.contact_id,
      lender_name: event.queryStringParameters?.lender_name,
      limit: event.queryStringParameters?.limit,
    });

    const proxied = await proxyToOracle({
      path: '/admin/ai/funding/compliance-summary',
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
