import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
  limit: z.coerce.number().int().positive().max(50).optional(),
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

function normalizeApproved(items: any[] | undefined, assetType: 'forex' | 'options') {
  return (Array.isArray(items) ? items : [])
    .filter((item) => String(item?.approval_status || '').toLowerCase() === 'approved')
    .map((item) => ({
      ...item,
      asset_type: assetType,
      portal_id: `${assetType}:${String(item?.id || item?.strategy_id || Math.random())}`,
    }));
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });

    const parsed = QuerySchema.parse({
      tenant_id: event.queryStringParameters?.tenant_id,
      limit: event.queryStringParameters?.limit,
    });

    const query = {
      tenant_id: parsed.tenant_id,
      limit: parsed.limit ?? 12,
    };

    const [forexRes, optionsRes] = await Promise.all([
      proxyToOracle({
        path: '/api/research/strategy-rankings',
        method: 'GET',
        query,
        forwardAuth: true,
        event,
      }),
      proxyToOracle({
        path: '/api/research/options-rankings',
        method: 'GET',
        query,
        forwardAuth: true,
        event,
      }),
    ]);

    if (!forexRes.ok) return json(forexRes.status, forexRes.json || { ok: false, error: 'forex_strategy_query_failed' });
    if (!optionsRes.ok) return json(optionsRes.status, optionsRes.json || { ok: false, error: 'options_strategy_query_failed' });

    const forexPayload = (forexRes.json || {}) as OracleListResponse;
    const optionsPayload = (optionsRes.json || {}) as OracleListResponse;
    const items = [
      ...normalizeApproved(forexPayload.items, 'forex'),
      ...normalizeApproved(optionsPayload.items, 'options'),
    ].sort((left, right) => {
      const leftRank = Number(left?.rank || Number.MAX_SAFE_INTEGER);
      const rightRank = Number(right?.rank || Number.MAX_SAFE_INTEGER);
      if (leftRank !== rightRank) return leftRank - rightRank;

      const leftCreated = new Date(String(left?.created_at || 0)).getTime();
      const rightCreated = new Date(String(right?.created_at || 0)).getTime();
      return rightCreated - leftCreated;
    });

    return json(200, {
      ok: true,
      tenant_id: parsed.tenant_id,
      count: items.length,
      items,
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 400;
    return json(statusCode, { ok: false, error: String(error?.message || 'bad_request') });
  }
};