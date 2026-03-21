import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import {
  buildCapitalDataPayload,
  resolveAuthedUserId,
  setCapitalAllocationPath,
  toHttpErrorBody,
} from './_shared/capital_access';

const QuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  reconcile: z
    .string()
    .optional()
    .transform((value) => {
      const normalized = String(value || '').trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes';
    }),
});

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  selected_path: z.enum(['business_growth', 'trading_education', 'grant_funding']),
  metadata: z.record(z.unknown()).optional(),
  reconcile: z.boolean().optional().default(true),
});

export const handler: Handler = async (event) => {
  try {
    const supabase = getUserSupabaseClient(event);
    const userId = await resolveAuthedUserId(supabase as any);

    if (event.httpMethod === 'GET') {
      const query = QuerySchema.parse(event.queryStringParameters || {});
      const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: query.tenant_id });
      const payload = await buildCapitalDataPayload(supabase as any, {
        tenantId,
        userId,
        reconcileTasks: query.reconcile,
      });

      return json(200, {
        ok: true,
        tenant_id: tenantId,
        allocation: payload.allocation,
        readiness: payload.readiness,
        profile: payload.profile,
        eligibility: payload.eligibility,
      });
    }

    if (event.httpMethod === 'POST') {
      const body = BodySchema.parse(JSON.parse(event.body || '{}'));
      const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

      const result = await setCapitalAllocationPath(supabase as any, {
        tenantId,
        userId,
        selectedPath: body.selected_path,
        metadata: body.metadata,
      });

      const payload = await buildCapitalDataPayload(supabase as any, {
        tenantId,
        userId,
        reconcileTasks: body.reconcile,
      });

      return json(200, {
        ok: true,
        tenant_id: tenantId,
        selected_path: payload.allocation.selected_path,
        gating_note: result.gating_note,
        allocation: payload.allocation,
        readiness: payload.readiness,
        profile: payload.profile,
        eligibility: payload.eligibility,
      });
    }

    return json(405, { error: 'Method not allowed' });
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
