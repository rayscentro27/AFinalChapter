import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  format: z.enum(['jsonl', 'csv']).optional(),
  limit: z.coerce.number().int().min(1).max(50000).optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'method_not_allowed' }),
      };
    }

    const query = QuerySchema.parse({
      tenant_id: event.queryStringParameters?.tenant_id,
      from: event.queryStringParameters?.from,
      to: event.queryStringParameters?.to,
      format: event.queryStringParameters?.format,
      limit: event.queryStringParameters?.limit,
    });

    const proxied = await proxyToOracle({
      path: '/admin/audit/export',
      method: 'GET',
      query,
      forwardAuth: true,
      event,
    });

    const format = query.format || 'jsonl';
    const contentType = format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8';

    return {
      statusCode: proxied.status,
      headers: { 'Content-Type': contentType },
      body: proxied.text || '',
    };
  } catch (error: any) {
    return {
      statusCode: Number(error?.statusCode) || 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(error?.message || 'bad_request') }),
    };
  }
};
