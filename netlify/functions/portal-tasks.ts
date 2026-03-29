import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import {
  getPortalTasks,
  resolveAuthedUserId,
  toHttpErrorBody,
} from './_shared/funding_foundation';

const QuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  reconcile: z
    .string()
    .optional()
    .transform((value) => {
      const normalized = String(value || '').trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes';
    }),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const query = QuerySchema.parse(event.queryStringParameters || {});
    const userId = await resolveAuthedUserId(supabase as any);
    const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: query.tenant_id });

    const board = await getPortalTasks(supabase as any, {
      tenantId,
      userId,
      reconcile: query.reconcile,
    });

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      ...board,
    });
  } catch (error) {
    const err = toHttpErrorBody(error);
    return json(err.statusCode, err.body);
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
