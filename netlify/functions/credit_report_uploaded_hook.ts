import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  storage_path: z.string().min(1).optional(),
  docs_ready: z.boolean().optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const tenant_id = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const { error: profErr } = await supabase
      .from('tenant_profiles')
      .upsert(
        {
          tenant_id,
          credit_report_uploaded: true,
          docs_ready: body.docs_ready ?? true,
        } as any,
        { onConflict: 'tenant_id' }
      );

    if (profErr) throw new Error(`Failed to update tenant profile: ${profErr.message}`);

    const { error: genErr } = await supabase.rpc('generate_tasks_for_tenant', { p_tenant_id: tenant_id });
    if (genErr) throw new Error(`Failed to regenerate tasks: ${genErr.message}`);

    const { error: syncErr } = await supabase.rpc('sync_task_required_attachments', { p_tenant_id: tenant_id });
    if (syncErr) throw new Error(`Failed to sync attachment metadata: ${syncErr.message}`);

    // Run intel matching now that credit docs are present (best-effort).
    let matchResult: any = null;
    const { data: matchData, error: matchErr } = await supabase.rpc('match_approval_intel_for_tenant', {
      p_tenant_id: tenant_id,
      p_hours: 48,
    });
    if (!matchErr) matchResult = matchData;

    const { error: taskErr } = await supabase
      .from('client_tasks')
      .update({ status: 'completed', signal: 'green', updated_at: new Date().toISOString() } as any)
      .eq('tenant_id', tenant_id)
      .eq('task_id', 'tpl:upload_credit_report');

    if (taskErr) throw new Error(`Failed to complete upload task: ${taskErr.message}`);

    const { error: notifErr } = await supabase.from('tenant_notifications').insert({
      tenant_id,
      type: 'credit_report_uploaded',
      severity: 'info',
      title: 'Credit report uploaded',
      message: 'Credit report received. Review and matching tasks were generated.',
      meta: {
        storage_path: body.storage_path || null,
      },
    } as any);

    if (notifErr) throw new Error(`Failed to create notification: ${notifErr.message}`);

    return json(200, { ok: true, tenant_id, match_result: matchResult });
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
