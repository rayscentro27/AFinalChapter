import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import {
  resolveAuthedUserId,
  setBusinessProgress,
  toHttpErrorBody,
} from './_shared/funding_foundation';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  step_key: z.string().min(2).max(120),
  step_status: z.enum(['not_started', 'in_progress', 'completed', 'blocked']),
  is_required: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const supabase = getUserSupabaseClient(event);
    const userId = await resolveAuthedUserId(supabase as any);
    const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const business = await setBusinessProgress(supabase as any, {
      tenantId,
      userId,
      stepKey: body.step_key,
      stepStatus: body.step_status,
      isRequired: body.is_required,
      notes: body.notes,
    });

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      profile: business.profile,
      progress: business.progress,
      readiness: business.readiness,
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
