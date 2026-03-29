import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
  asset_type: z.enum(['forex', 'options']),
  record_id: z.string().min(1),
});

type OracleListResponse = {
  ok?: boolean;
  items?: any[];
};

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
      asset_type: event.queryStringParameters?.asset_type,
      record_id: event.queryStringParameters?.record_id,
    });

    const proxied = await proxyToOracle({
      path: parsed.asset_type === 'options' ? '/api/research/options-rankings' : '/api/research/strategy-rankings',
      method: 'GET',
      query: {
        tenant_id: parsed.tenant_id,
        limit: 50,
      },
      forwardAuth: true,
      event,
    });

    if (!proxied.ok) return json(proxied.status, proxied.json || { ok: false, error: 'strategy_detail_query_failed' });

    const payload = (proxied.json || {}) as OracleListResponse;
    const record = (Array.isArray(payload.items) ? payload.items : []).find((item) => {
      const approved = String(item?.approval_status || '').toLowerCase() === 'approved';
      return approved && String(item?.id || '') === parsed.record_id;
    });

    if (!record) {
      return json(404, { ok: false, error: 'approved_strategy_not_found' });
    }

    return json(200, {
      ok: true,
      tenant_id: parsed.tenant_id,
      item: {
        ...record,
        asset_type: parsed.asset_type,
        portal_id: `${parsed.asset_type}:${String(record.id)}`,
      },
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 400;
    return json(statusCode, { ok: false, error: String(error?.message || 'bad_request') });
  }
};