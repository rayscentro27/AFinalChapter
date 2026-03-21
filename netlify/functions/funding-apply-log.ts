import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import {
  logFundingApplyEvent,
  resolveAuthedUserId,
  toHttpErrorBody,
} from './_shared/funding_foundation';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  provider_name: z.string().min(1).max(180).optional(),
  product_name: z.string().min(1).max(180).optional(),
  bureau_used: z.string().max(80).optional(),
  submitted_at: z.string().datetime().optional(),
  decision_status: z.enum(['submitted', 'approved', 'denied', 'pending', 'cancelled']).optional(),
  approved_amount: z.number().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  inquiry_detected: z.boolean().nullable().optional(),
  related_strategy_step_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const supabase = getUserSupabaseClient(event);
    const userId = await resolveAuthedUserId(supabase as any);
    const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const result = await logFundingApplyEvent(supabase as any, {
      tenantId,
      userId,
      providerName: body.provider_name,
      productName: body.product_name,
      bureauUsed: body.bureau_used,
      submittedAt: body.submitted_at,
      decisionStatus: body.decision_status,
      approvedAmount: body.approved_amount,
      notes: body.notes,
      inquiryDetected: body.inquiry_detected,
      relatedStrategyStepId: body.related_strategy_step_id,
      metadata: body.metadata,
    });

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      apply_log: result,
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
