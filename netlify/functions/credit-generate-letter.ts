import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import { resolveAuthedUserId, toHttpErrorBody } from './_shared/funding_foundation';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  recommendation_id: z.string().uuid().optional(),
  title: z.string().min(3).max(180).optional(),
  summary: z.string().min(3).max(5000).optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const supabase = getUserSupabaseClient(event);
    const userId = await resolveAuthedUserId(supabase as any);
    const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const runInsert = await supabase
      .from('dispute_letter_runs')
      .insert({
        tenant_id: tenantId,
        requested_by_user_id: userId,
        status: 'completed',
        generation_prompt: 'Manual portal draft request',
        generated_draft: body.summary || 'Draft requested from portal.',
        merged_letter: body.summary || 'Draft requested from portal.',
        redacted_context: { source: 'portal_credit_generate_letter' },
      } as any)
      .select('id')
      .single();

    if (runInsert.error) {
      throw new Error(runInsert.error.message || 'Unable to create draft run');
    }

    const runId = String(runInsert.data?.id || '');

    const letterInsert = await supabase
      .from('dispute_letters')
      .insert({
        run_id: runId,
        tenant_id: tenantId,
        created_by_user_id: userId,
        user_id: userId,
        dispute_recommendation_id: body.recommendation_id || null,
        title: body.title || 'Dispute Letter Draft',
        letter_text:
          body.summary ||
          'This educational draft letter was generated from your recommendations. Review and finalize before sending.',
        output_format: 'text/plain',
        status: 'pending_review',
        letter_status: 'pending_review',
        metadata: {
          source: 'portal_credit_generate_letter',
        },
      } as any)
      .select('*')
      .single();

    if (letterInsert.error) {
      throw new Error(letterInsert.error.message || 'Unable to create letter draft');
    }

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      letter: letterInsert.data,
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
