import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import { maskIntegrationCredentials } from './_shared/integration_credentials_crypto';

const QuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const q = QuerySchema.parse(event.queryStringParameters || {});

    const tenant_id = await resolveTenantId(supabase as any, { requestedTenantId: q.tenant_id });

    const { data, error } = await supabase
      .from('tenant_integrations')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('provider', { ascending: true });

    if (error) throw new Error(error.message);

    return json(200, {
      ok: true,
      tenant_id,
      integrations: (data || []).map(redactIntegration),
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function redactIntegration(row: any) {
  const provider = String(row?.provider || '');
  return {
    id: row?.id,
    provider,
    status: row?.status,
    connected_at: row?.connected_at,
    last_tested_at: row?.last_tested_at,
    last_error: row?.last_error,
    metadata: row?.metadata || {},
    credentials_masked: maskIntegrationCredentials(provider, row?.credentials || {}),
  };
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
