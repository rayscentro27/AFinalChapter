import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { asText, commandResponseRow } from './_shared/admin_local_state';
import { proxyToOracle } from './_shared/oracle_proxy';
import { requireStaffUser } from './_shared/staff_auth';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().min(1).optional(),
  command_id: z.string().min(1).optional(),
});

function json(statusCode: number, body: unknown) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });

    await requireStaffUser(event);

    const query = QuerySchema.parse({
      limit: event.queryStringParameters?.limit,
      status: event.queryStringParameters?.status,
      command_id: event.queryStringParameters?.command_id,
    });

    const proxied = await proxyToOracle({
      path: '/api/admin/commands',
      method: 'GET',
      query: { limit: query.limit, status: query.status },
      forwardAuth: true,
      event,
    });
    const items = Array.isArray(proxied.json?.items) ? proxied.json.items.map((item: Record<string, unknown>) => commandResponseRow(item)) : [];
    const selectedId = query.command_id || items[0]?.id || '';

    let selected = null;
    if (selectedId) {
      const detailResponse = await proxyToOracle({
        path: `/api/admin/commands/${encodeURIComponent(selectedId)}`,
        method: 'GET',
        forwardAuth: true,
        event,
      });
      selected = detailResponse.json?.detail || null;
    }

    return json(proxied.status, {
      ok: true,
      items,
      selected,
      source: 'oracle_api',
    });
  } catch (error: any) {
    return json(Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
};