import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  queue_id: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  notes: z.string().trim().max(500).optional(),
});

function json(statusCode: number, body: any) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const proxied = await proxyToOracle({
      path: '/admin/research/queue/decide',
      method: 'POST',
      body,
      forwardAuth: true,
      event,
    });

    return json(proxied.status, proxied.json || {});
  } catch (error: any) {
    return json(Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
};