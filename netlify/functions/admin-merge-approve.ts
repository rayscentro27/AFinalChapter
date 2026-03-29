import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  from_contact_id: z.string().uuid(),
  into_contact_id: z.string().uuid(),
  suggestion_key: z.string().max(1200).optional(),
  identity_type: z.string().max(64).optional(),
  identity_value: z.string().max(320).optional(),
  reason: z.string().max(500).optional(),
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
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    if (body.from_contact_id === body.into_contact_id) {
      return json(400, { ok: false, error: 'from_contact_id_and_into_contact_id_must_differ' });
    }

    const proxied = await proxyToOracle({
      path: '/admin/merges/approve',
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
