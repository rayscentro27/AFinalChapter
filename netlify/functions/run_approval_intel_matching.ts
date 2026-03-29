import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { requireStaffUser } from './_shared/staff_auth';

const QuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(168).optional().default(48),
});

export const handler: Handler = async (event) => {
  try {
    if (!['POST', 'GET'].includes(event.httpMethod || '')) {
      return json(405, { error: 'Method not allowed' });
    }

    await requireStaffUser(event);

    const admin = getAdminSupabaseClient();
    const qs = QuerySchema.parse(event.queryStringParameters || {});

    const { data, error } = await admin.rpc('match_approval_intel_recent', { p_hours: qs.hours });
    if (error) throw new Error(error.message);

    return json(200, { ok: true, hours: qs.hours, result: data });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}
