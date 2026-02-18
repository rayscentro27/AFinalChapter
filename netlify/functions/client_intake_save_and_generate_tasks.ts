import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';

const BodySchema = z.object({
  tenant_id: z.string().uuid(),

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

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const supabase = getUserSupabaseClient(event);

    // Upsert profile for this tenant.
    const { error: upErr } = await supabase.from('tenant_profiles').upsert(
      {
        tenant_id: body.tenant_id,
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
      } as any,
      { onConflict: 'tenant_id' }
    );

    if (upErr) throw new Error(`Failed to upsert tenant_profiles: ${upErr.message}`);

    // Generate/update tasks from templates + profile.
    const { data, error: rpcErr } = await supabase.rpc('generate_tasks_for_tenant', {
      p_tenant_id: body.tenant_id,
    });

    if (rpcErr) throw new Error(`Failed to generate tasks: ${rpcErr.message}`);

    return json(200, { ok: true, result: data });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function json(statusCode: number, body: any) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
