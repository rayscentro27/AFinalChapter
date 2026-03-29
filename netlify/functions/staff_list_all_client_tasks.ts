import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { requireStaffUser } from './_shared/staff_auth';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional().default(300),
  status: z.enum(['pending', 'completed']).optional(),
  signal: z.enum(['red', 'yellow', 'green']).optional(),
  overdue_only: z.coerce.boolean().optional().default(false),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

    await requireStaffUser(event);

    const supabase = getUserSupabaseClient(event);
    const qs = QuerySchema.parse(event.queryStringParameters || {});

    let q = supabase
      .from('client_tasks')
      .select('tenant_id, task_id, title, description, status, due_date, type, signal, assigned_employee, group_key, template_key, meta, updated_at, tenants(name, slug, status)')
      .order('due_date', { ascending: true })
      .order('updated_at', { ascending: false })
      .limit(qs.limit);

    if (qs.status) q = q.eq('status', qs.status);
    if (qs.signal) q = q.eq('signal', qs.signal);
    if (qs.overdue_only) q = q.lt('due_date', new Date().toISOString().slice(0, 10)).eq('status', 'pending');

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const rows = data || [];
    const summary = {
      total: rows.length,
      pending: rows.filter((r: any) => r.status === 'pending').length,
      completed: rows.filter((r: any) => r.status === 'completed').length,
      red: rows.filter((r: any) => r.signal === 'red').length,
      yellow: rows.filter((r: any) => r.signal === 'yellow').length,
      green: rows.filter((r: any) => r.signal === 'green').length,
      overdue: rows.filter((r: any) => r.status === 'pending' && String(r.due_date) < new Date().toISOString().slice(0, 10)).length,
    };

    return json(200, { ok: true, summary, tasks: rows });
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
