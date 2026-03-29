import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import {
  buildCapitalDataPayload,
  resolveAuthedUserId,
  toHttpErrorBody,
  upsertCapitalProfile,
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
  total_funding_received: z.number().nullable().optional(),
  estimated_monthly_payment: z.number().nullable().optional(),
  reserve_target_months: z.number().int().nullable().optional(),
  recommended_reserve_amount: z.number().nullable().optional(),
  reserve_confirmed: z.boolean().optional(),
  reserve_confirmed_at: z.string().nullable().optional(),
  business_growth_positioned: z.boolean().optional(),
  capital_setup_status: z
    .enum(['not_started', 'in_progress', 'ready', 'completed', 'blocked'])
    .nullable()
    .optional(),
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
        profile: payload.profile,
        setup_progress: payload.setup_progress,
        readiness: payload.readiness,
        allocation: payload.allocation,
        eligibility: payload.eligibility,
      });
    }

    if (event.httpMethod === 'POST') {
      const body = BodySchema.parse(JSON.parse(event.body || '{}'));
      const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

      await upsertCapitalProfile(supabase as any, {
        tenantId,
        userId,
        totalFundingReceived: body.total_funding_received,
        estimatedMonthlyPayment: body.estimated_monthly_payment,
        reserveTargetMonths: body.reserve_target_months,
        recommendedReserveAmount: body.recommended_reserve_amount,
        reserveConfirmed: body.reserve_confirmed,
        reserveConfirmedAt: body.reserve_confirmed_at,
        businessGrowthPositioned: body.business_growth_positioned,
        capitalSetupStatus: body.capital_setup_status,
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
        profile: payload.profile,
        setup_progress: payload.setup_progress,
        readiness: payload.readiness,
        allocation: payload.allocation,
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
