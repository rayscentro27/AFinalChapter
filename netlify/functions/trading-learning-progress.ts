import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import {
  resolveAuthedUserId,
  setTradingLearningProgress,
  toHttpErrorBody,
} from './_shared/trading_access';

const BodySchema = z
  .object({
    tenant_id: z.string().uuid().optional(),
    started_paper_trading: z.boolean().optional(),
    selected_tool: z.string().max(120).nullable().optional(),
    first_simulation_completed: z.boolean().optional(),
    reconcile: z.boolean().optional().default(true),
  })
  .refine(
    (value) =>
      value.started_paper_trading !== undefined ||
      value.selected_tool !== undefined ||
      value.first_simulation_completed !== undefined,
    {
      message: 'At least one learning progress field is required.',
      path: ['started_paper_trading'],
    }
  );

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const userId = await resolveAuthedUserId(supabase as any);
    const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const access = await setTradingLearningProgress(supabase as any, {
      tenantId,
      userId,
      startedPaperTrading: body.started_paper_trading,
      selectedTool: body.selected_tool,
      firstSimulationCompleted: body.first_simulation_completed,
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
