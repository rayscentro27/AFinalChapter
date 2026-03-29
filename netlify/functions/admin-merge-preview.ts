import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  from_contact_id: z.string().uuid(),
  into_contact_id: z.string().uuid(),
});

function getAuthHeader(event: { headers?: Record<string, string | undefined> }): string {
  const hit = Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === 'authorization')?.[1];
  return String(hit || '').trim();
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    const auth = getAuthHeader(event);
    if (!auth.toLowerCase().startsWith('bearer ')) {
      return json(401, { ok: false, error: 'missing_authorization' });
    }

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    if (body.from_contact_id === body.into_contact_id) {
      return json(400, { ok: false, error: 'from_contact_id_and_into_contact_id_must_differ' });
    }

    const proxied = await proxyToOracle({
      path: '/admin/contacts/merge/preview',
      method: 'POST',
      body,
      forwardAuth: true,
      event,
    });

    return json(proxied.status, proxied.json || {});
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 400;
    // Log the detailed error server-side (optional: use a logger)
    console.error('admin-merge-preview error:', error);
    // Return a generic error message to the client
    return json(statusCode, { ok: false, error: 'internal_server_error' });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
