import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { buildExecutiveCommandCenterPayload } from './_shared/admin_command_center';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { requireStaffUser } from './_shared/staff_auth';

const QuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  hours: z.coerce.number().int().min(1).max(24 * 30).optional().default(72),
  limit: z.coerce.number().int().min(5).max(50).optional().default(8),
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
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });

    await requireStaffUser(event);

    const query = QuerySchema.parse(event.queryStringParameters || {});
    const supabase = getAdminSupabaseClient();
    const snapshot = await buildExecutiveCommandCenterPayload(supabase, event, {
      tenantId: query.tenant_id,
      hours: query.hours,
      limit: query.limit,
    });

    return json(200, {
      ok: true,
      tenant_id: query.tenant_id || null,
      hours: query.hours,
      snapshot,
      empty_state: snapshot.totalClients === 0,
    });
  } catch (error: any) {
    return json(Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
};