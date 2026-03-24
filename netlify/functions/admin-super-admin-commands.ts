import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { commandResponseRow } from './_shared/admin_local_state';
import { proxyToOracle } from './_shared/oracle_proxy';
import { requireStaffUser } from './_shared/staff_auth';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().min(1).optional(),
  risk_level: z.string().min(1).optional(),
  tenant_id: z.string().uuid().optional(),
});

const BodySchema = z.object({
  command: z.string().min(3),
  tenant_id: z.string().uuid().optional(),
});

const ActionSchema = z.object({
  command_id: z.string().min(1),
  action: z.enum(['approve', 'reject', 'cancel', 'request_approval']),
  reason: z.string().optional(),
});

function json(statusCode: number, body: unknown) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      await requireStaffUser(event);
      const query = QuerySchema.parse({
        limit: event.queryStringParameters?.limit,
        status: event.queryStringParameters?.status,
        risk_level: event.queryStringParameters?.risk_level,
        tenant_id: event.queryStringParameters?.tenant_id,
      });

      const proxied = await proxyToOracle({
        path: '/api/admin/commands',
        method: 'GET',
        query,
        forwardAuth: true,
        event,
      });
      const items = Array.isArray(proxied.json?.items) ? proxied.json.items.map((item: Record<string, unknown>) => commandResponseRow(item)) : [];
      return json(proxied.status, { ...(proxied.json || {}), items, source: 'oracle_api' });
    }

    if (event.httpMethod === 'POST') {
      await requireStaffUser(event);
      const body = BodySchema.parse(JSON.parse(event.body || '{}'));
      const proxied = await proxyToOracle({
        path: '/api/admin/commands',
        method: 'POST',
        body: {
          command_text: body.command.trim(),
          tenant_id: body.tenant_id,
        },
        forwardAuth: true,
        event,
      });

      return json(proxied.status, {
        ...(proxied.json || {}),
        submitted: proxied.json?.submitted ? commandResponseRow(proxied.json.submitted as Record<string, unknown>) : null,
        source: 'oracle_api',
      });
    }

    if (event.httpMethod === 'PATCH') {
      await requireStaffUser(event);
      const body = ActionSchema.parse(JSON.parse(event.body || '{}'));
      if (body.action === 'request_approval') {
        return json(409, { ok: false, error: 'request_approval_obsolete', message: 'Commands now enter the approval queue automatically when required.' });
      }

      const path = `/api/admin/commands/${encodeURIComponent(body.command_id)}/${body.action}`;
      const proxied = await proxyToOracle({
        path,
        method: 'POST',
        body: { reason: body.reason },
        forwardAuth: true,
        event,
      });

      return json(proxied.status, { ...(proxied.json || {}), source: 'oracle_api' });
    }

    return json(405, { ok: false, error: 'method_not_allowed' });
  } catch (error: any) {
    return json(Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
};