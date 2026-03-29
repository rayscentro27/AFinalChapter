import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import {
  resolveAuthedUserId,
  setBusinessPath,
  toHttpErrorBody,
} from './_shared/funding_foundation';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  business_path: z.enum(['new_business', 'existing_business_optimization']),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const supabase = getUserSupabaseClient(event);
    const userId = await resolveAuthedUserId(supabase as any);
    const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const business = await setBusinessPath(supabase as any, {
      tenantId,
      userId,
      businessPath: body.business_path,
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
