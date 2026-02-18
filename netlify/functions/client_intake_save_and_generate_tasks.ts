import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),

  has_registered_business: z.boolean().optional(),
  credit_report_uploaded: z.boolean().optional(),

  credit_score_est: z.number().int().min(300).max(900).optional(),
  has_major_derog: z.boolean().optional(),
  utilization_pct: z.number().int().min(0).max(100).optional(),
  months_reserves: z.number().int().min(0).max(120).optional(),
  docs_ready: z.boolean().optional(),

  wants_grants: z.boolean().optional(),
  wants_sba: z.boolean().optional(),
  wants_tier1: z.boolean().optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const tenant_id = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const profileRow = {
      tenant_id,
      has_registered_business: body.has_registered_business,
      credit_report_uploaded: body.credit_report_uploaded,
      credit_score_est: body.credit_score_est,
      has_major_derog: body.has_major_derog,
      utilization_pct: body.utilization_pct,
      months_reserves: body.months_reserves,
      docs_ready: body.docs_ready,
      wants_grants: body.wants_grants,
      wants_sba: body.wants_sba,
      wants_tier1: body.wants_tier1,
    };

    const { error: upErr } = await supabase.from('tenant_profiles').upsert(profileRow as any, { onConflict: 'tenant_id' });
    if (upErr) throw new Error(`Failed to upsert tenant_profiles: ${upErr.message}`);

    const { data, error: rpcErr } = await supabase.rpc('generate_tasks_for_tenant', {
      p_tenant_id: tenant_id,
    });
    if (rpcErr) throw new Error(`Failed to generate tasks: ${rpcErr.message}`);

    return json(200, { ok: true, tenant_id, result: data });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function json(statusCode: number, body: any) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
