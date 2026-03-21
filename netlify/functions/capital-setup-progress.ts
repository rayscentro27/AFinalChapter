import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import {
  buildCapitalDataPayload,
  resolveAuthedUserId,
  toHttpErrorBody,
  upsertCapitalProfile,
  upsertCapitalSetupProgress,
} from './_shared/capital_access';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  step_key: z.string().min(2).max(80).optional(),
  step_status: z.enum(['not_started', 'in_progress', 'completed', 'blocked']).optional(),
  is_required: z.boolean().optional(),
  notes: z.string().max(800).nullable().optional(),
  total_funding_received: z.number().nullable().optional(),
  estimated_monthly_payment: z.number().nullable().optional(),
  reserve_target_months: z.number().int().nullable().optional(),
  recommended_reserve_amount: z.number().nullable().optional(),
  reserve_confirmed: z.boolean().optional(),
  reserve_confirmed_at: z.string().nullable().optional(),
  capital_setup_status: z
    .enum(['not_started', 'in_progress', 'ready', 'completed', 'blocked'])
    .nullable()
    .optional(),
  metadata: z.record(z.unknown()).optional(),
  reconcile: z.boolean().optional().default(true),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const userId = await resolveAuthedUserId(supabase as any);
    const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const hasProfilePatch =
      body.total_funding_received !== undefined ||
      body.estimated_monthly_payment !== undefined ||
      body.reserve_target_months !== undefined ||
      body.recommended_reserve_amount !== undefined ||
      body.reserve_confirmed !== undefined ||
      body.capital_setup_status !== undefined ||
      body.metadata !== undefined;

    if (hasProfilePatch) {
      await upsertCapitalProfile(supabase as any, {
        tenantId,
        userId,
        totalFundingReceived: body.total_funding_received,
        estimatedMonthlyPayment: body.estimated_monthly_payment,
        reserveTargetMonths: body.reserve_target_months,
        recommendedReserveAmount: body.recommended_reserve_amount,
        reserveConfirmed: body.reserve_confirmed,
        reserveConfirmedAt: body.reserve_confirmed_at,
        capitalSetupStatus: body.capital_setup_status,
        metadata: body.metadata,
      });
    }

    let progress: Record<string, unknown> | null = null;
    if (body.step_key) {
      const updated = await upsertCapitalSetupProgress(supabase as any, {
        tenantId,
        userId,
        stepKey: body.step_key,
        stepStatus: body.step_status || 'in_progress',
        notes: body.notes,
        isRequired: body.is_required,
      });
      progress = updated;
    }

    if (!progress && !hasProfilePatch) {
      return json(400, { error: 'Provide step_key or profile fields to update.' });
    }

    const payload = await buildCapitalDataPayload(supabase as any, {
      tenantId,
      userId,
      reconcileTasks: body.reconcile,
    });

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      profile: payload.profile,
      progress,
      setup_progress: payload.setup_progress,
      readiness: payload.readiness,
      allocation: payload.allocation,
      eligibility: payload.eligibility,
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
