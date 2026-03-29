import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  endpoint: z.enum([
    'strategy-rankings',
    'options-rankings',
    'agent-scorecards',
    'recent-hypotheses',
    'coverage-gaps',
    'summary',
  ]),
  tenant_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  status: z.string().trim().min(1).optional(),
  symbol: z.string().trim().min(1).optional(),
  agent_role: z.string().trim().min(1).optional(),
  strategy_id: z.string().trim().min(1).optional(),
});

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function buildPath(endpoint: z.infer<typeof QuerySchema>['endpoint']) {
  switch (endpoint) {
    case 'strategy-rankings':
      return '/api/research/strategy-rankings';
    case 'options-rankings':
      return '/api/research/options-rankings';
    case 'agent-scorecards':
      return '/api/research/agent-scorecards';
    case 'recent-hypotheses':
      return '/api/research/recent-hypotheses';
    case 'coverage-gaps':
      return '/api/research/coverage-gaps';
    case 'summary':
      return '/api/research/summary';
  }
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });

    const parsed = QuerySchema.parse({
      endpoint: event.queryStringParameters?.endpoint,
      tenant_id: event.queryStringParameters?.tenant_id,
      limit: event.queryStringParameters?.limit,
      status: event.queryStringParameters?.status,
      symbol: event.queryStringParameters?.symbol,
      agent_role: event.queryStringParameters?.agent_role,
      strategy_id: event.queryStringParameters?.strategy_id,
    });

    const query: Record<string, string | number | undefined> = {
      tenant_id: parsed.tenant_id,
      limit: parsed.limit,
      status: parsed.status,
      symbol: parsed.symbol,
      agent_role: parsed.agent_role,
      strategy_id: parsed.strategy_id,
    };

    const proxied = await proxyToOracle({
      path: buildPath(parsed.endpoint),
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
