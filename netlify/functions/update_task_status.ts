import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  task_id: z.string().min(1),

  // Preferred: explicit fields
  status: z.enum(['pending', 'completed']).optional(),
  signal: z.enum(['red', 'yellow', 'green']).optional(),

  // Back-compat: some callers send red/yellow/green as `status`
  status_signal: z.enum(['red', 'yellow', 'green']).optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const tenant_id = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const payload: any = {};
    if (body.status) payload.status = body.status;
    if (body.signal) payload.signal = body.signal;
    if (!body.signal && body.status_signal) payload.signal = body.status_signal;

    if (Object.keys(payload).length === 0) {
      return json(400, { error: 'Provide status and/or signal' });
    }

    const { data, error } = await supabase
      .from('client_tasks')
      .update(payload)
      .eq('tenant_id', tenant_id)
      .eq('task_id', body.task_id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    return json(200, { ok: true, tenant_id, task: data });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function json(statusCode: number, body: any) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
