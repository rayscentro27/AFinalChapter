import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  flag_key: z.string().min(1).max(120),
  enabled: z.boolean(),
  reason: z.string().min(3).max(500),
  scope: z.string().optional(),
  scope_id: z.string().optional(),
  rollout_pct: z.coerce.number().int().min(0).max(100).nullable().optional(),
});

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    const raw = event.body ? JSON.parse(event.body) : {};
    const parsed = BodySchema.parse(raw);

    const body: Record<string, unknown> = {
      tenant_id: parsed.tenant_id,
      enabled: parsed.enabled,
      reason: parsed.reason,
    };
    if (parsed.scope) body.scope = parsed.scope;
    if (parsed.scope_id) body.scope_id = parsed.scope_id;
    if (parsed.rollout_pct !== undefined) body.rollout_pct = parsed.rollout_pct;

    const proxied = await proxyToOracle({
      path: `/api/control-plane/feature-flags/${encodeURIComponent(parsed.flag_key)}`,
      method: 'POST',
      body,
      forwardAuth: true,
      event,
    });

    return json(proxied.status, proxied.json || {});
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 400;
    return json(statusCode, { ok: false, error: String(error?.message || 'bad_request') });
  }
};
