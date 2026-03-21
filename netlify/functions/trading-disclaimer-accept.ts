import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import {
  resolveAuthedUserId,
  setTradingDisclaimerAccepted,
  toHttpErrorBody,
} from './_shared/trading_access';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  accepted: z.boolean().optional().default(true),
  disclaimer_version: z.string().min(1).optional(),
  reconcile: z.boolean().optional().default(true),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const userId = await resolveAuthedUserId(supabase as any);
    const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const access = await setTradingDisclaimerAccepted(supabase as any, {
      tenantId,
      userId,
      accepted: body.accepted,
      disclaimerVersion: body.disclaimer_version || undefined,
      reconcileTasks: body.reconcile,
    });

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      access,
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
