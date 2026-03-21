import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import { getCreditDomainData, resolveAuthedUserId, toHttpErrorBody } from './_shared/funding_foundation';

const QuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const query = QuerySchema.parse(event.queryStringParameters || {});
    const userId = await resolveAuthedUserId(supabase as any);
    const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: query.tenant_id });

    const credit = await getCreditDomainData(supabase as any, {
      tenantId,
      userId,
    });

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      letters: credit.letters,
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
