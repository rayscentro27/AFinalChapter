import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';

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
  const credentials = row?.credentials || {};
  return {
    id: row?.id,
    provider,
    status: row?.status,
    connected_at: row?.connected_at,
    last_tested_at: row?.last_tested_at,
    last_error: row?.last_error,
    metadata: row?.metadata || {},
    credentials_masked: maskCredentials(provider, credentials),
  };
}

function maskCredentials(provider: string, credentials: Record<string, any>) {
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(credentials || {})) {
    if (typeof v !== 'string') continue;
    if (k.includes('token') || k.includes('key')) masked[k] = maskSecret(v);
    else masked[k] = v;
  }

  if (provider === 'stripe' && credentials?.secret_key && !masked.secret_key) {
    masked.secret_key = maskSecret(String(credentials.secret_key));
  }

  return masked;
}

function maskSecret(value: string) {
  const v = String(value || '');
  if (v.length <= 8) return '********';
  return `${v.slice(0, 4)}...${v.slice(-4)}`;
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
