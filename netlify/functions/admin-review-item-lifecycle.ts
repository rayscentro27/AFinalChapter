import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  item_id: z.string().uuid(),
  target_type: z.enum(['strategy', 'signal']),
  action: z.enum(['publish', 'unpublish', 'expire']),
  notes: z.string().trim().max(500).optional(),
});

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function buildOraclePath(input: z.infer<typeof BodySchema>) {
  const target = input.target_type === 'signal' ? 'signals' : 'strategies';
  return `/api/internal/review/${target}/${input.item_id}/${input.action}`;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const proxied = await proxyToOracle({
      path: buildOraclePath(body),
      method: 'POST',
      body: {
        tenant_id: body.tenant_id,
        notes: body.notes,
      },
      forwardAuth: true,
      event,
    });

    return json(proxied.status, proxied.json || {});
  } catch (error: any) {
    return json(Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
};