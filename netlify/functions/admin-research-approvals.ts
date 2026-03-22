import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

type OracleListResponse = {
  ok?: boolean;
  count?: number;
  items?: any[];
  approval_queue_pending?: number;
  risk_decisions?: number;
  error?: string;
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function onlyApproved(items: any[] | undefined) {
  return (Array.isArray(items) ? items : []).filter((item) => String(item?.approval_status || '').toLowerCase() === 'approved');
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });

    const parsed = QuerySchema.parse({
      tenant_id: event.queryStringParameters?.tenant_id,
      limit: event.queryStringParameters?.limit,
    });

    const limit = parsed.limit ?? 12;
    const tenant_id = parsed.tenant_id;

    const [strategyRes, optionsRes, signalsRes, queueRes, riskRes, replayRes, healthRes] = await Promise.all([
      proxyToOracle({ path: '/api/internal/review/strategies', method: 'GET', query: { tenant_id, limit, approval_status: 'approved' }, forwardAuth: true, event }),
      proxyToOracle({ path: '/api/internal/review/options', method: 'GET', query: { tenant_id, limit, approval_status: 'approved' }, forwardAuth: true, event }),
      proxyToOracle({ path: '/api/internal/review/signals', method: 'GET', query: { tenant_id, limit, approval_status: 'approved' }, forwardAuth: true, event }),
      proxyToOracle({ path: '/api/research/approval-queue', method: 'GET', query: { tenant_id, limit }, forwardAuth: true, event }),
      proxyToOracle({ path: '/api/research/risk-decisions', method: 'GET', query: { tenant_id, limit }, forwardAuth: true, event }),
      proxyToOracle({ path: '/api/research/recent-replay-results', method: 'GET', query: { tenant_id, limit }, forwardAuth: true, event }),
      proxyToOracle({ path: '/api/research/system-health', method: 'GET', forwardAuth: true, event }),
    ]);

    const failures = [strategyRes, optionsRes, signalsRes, queueRes, riskRes, replayRes, healthRes].find((res) => !res.ok);
    if (failures) {
      return json(failures.status, failures.json || { ok: false, error: 'admin_research_approvals_failed' });
    }

    const strategies = Array.isArray(((strategyRes.json || {}) as OracleListResponse).items) ? ((strategyRes.json || {}) as OracleListResponse).items : [];
    const options = Array.isArray(((optionsRes.json || {}) as OracleListResponse).items) ? ((optionsRes.json || {}) as OracleListResponse).items : [];
    const signals = Array.isArray(((signalsRes.json || {}) as OracleListResponse).items) ? ((signalsRes.json || {}) as OracleListResponse).items : [];
    const queue = Array.isArray(((queueRes.json || {}) as OracleListResponse).items) ? ((queueRes.json || {}) as OracleListResponse).items : [];
    const risk = Array.isArray(((riskRes.json || {}) as OracleListResponse).items) ? ((riskRes.json || {}) as OracleListResponse).items : [];
    const replay = Array.isArray(((replayRes.json || {}) as OracleListResponse).items) ? ((replayRes.json || {}) as OracleListResponse).items : [];
    const health = (healthRes.json || {}) as OracleListResponse & Record<string, any>;

    return json(200, {
      ok: true,
      tenant_id,
      metrics: {
        approved_strategies: strategies.length,
        approved_options: options.length,
        approved_signals: signals.length,
        queue_pending: Number(health.approval_queue_pending || queue.filter((item) => String(item?.status || '').toLowerCase() === 'queued').length),
        risk_decisions: Number(health.risk_decisions || risk.length),
        replay_results: replay.length,
      },
      strategies,
      options,
      signals,
      queue,
      risk_decisions: risk,
      replay_results: replay,
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 400;
    return json(statusCode, { ok: false, error: String(error?.message || 'bad_request') });
  }
};