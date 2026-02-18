import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';

const QuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const qs = event.queryStringParameters || {};
    const { tenant_id: requestedTenantId, limit } = QuerySchema.parse(qs);

    const tenant_id = await resolveTenantId(supabase as any, { requestedTenantId });

    const { data, error } = await supabase
      .from('client_tasks')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('group_key', { ascending: true, nullsFirst: true } as any)
      .order('due_date', { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    return json(200, { ok: true, tenant_id, tasks: data || [] });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function json(statusCode: number, body: any) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
