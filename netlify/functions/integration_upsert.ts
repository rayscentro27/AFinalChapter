import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import { encryptIntegrationCredentials, maskIntegrationCredentials } from './_shared/integration_credentials_crypto';

const ProviderSchema = z.enum(['facebook', 'whatsapp', 'mailerlite', 'stripe']);

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  provider: ProviderSchema,
  credentials: z.record(z.string(), z.any()),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user?.id) {
      return json(401, { error: 'Unauthorized' });
    }

    const tenant_id = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });
    const normalizedCredentials = normalizeCredentials(body.provider, body.credentials);
    const encryptedCredentials = encryptIntegrationCredentials(normalizedCredentials);

    const payload = {
      tenant_id,
      provider: body.provider,
      credentials: encryptedCredentials,
      metadata: body.metadata || {},
      status: 'disconnected',
      last_error: null,
      updated_by_user_id: authData.user.id,
      created_by_user_id: authData.user.id,
    };

    const { data, error } = await supabase
      .from('tenant_integrations')
      .upsert(payload, { onConflict: 'tenant_id,provider' })
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    return json(200, {
      ok: true,
      integration: redactIntegration(data),
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function normalizeCredentials(provider: z.infer<typeof ProviderSchema>, credentials: Record<string, any>) {
  const c = trimObject(credentials);

  if (provider === 'facebook') {
    if (!c.access_token) throw new Error('facebook credentials require access_token');
    return {
      access_token: String(c.access_token),
      page_id: c.page_id ? String(c.page_id) : '',
    };
  }

  if (provider === 'whatsapp') {
    if (!c.access_token) throw new Error('whatsapp credentials require access_token');
    if (!c.phone_number_id) throw new Error('whatsapp credentials require phone_number_id');
    return {
      access_token: String(c.access_token),
      phone_number_id: String(c.phone_number_id),
      business_account_id: c.business_account_id ? String(c.business_account_id) : '',
    };
  }

  if (provider === 'mailerlite') {
    if (!c.api_key) throw new Error('mailerlite credentials require api_key');
    return {
      api_key: String(c.api_key),
      group_id: c.group_id ? String(c.group_id) : '',
    };
  }

  if (!c.secret_key) throw new Error('stripe credentials require secret_key');
  return {
    secret_key: String(c.secret_key),
    publishable_key: c.publishable_key ? String(c.publishable_key) : '',
  };
}

function trimObject(input: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(input || {})) {
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

function redactIntegration(row: any) {
  const provider = String(row?.provider || '');
  return {
    id: row?.id,
    tenant_id: row?.tenant_id,
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
