import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import { decryptIntegrationCredentials, maskIntegrationCredentials } from './_shared/integration_credentials_crypto';

const ProviderSchema = z.enum(['facebook', 'mailerlite', 'stripe']);

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  provider: ProviderSchema,
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

    const { data: integration, error: integErr } = await supabase
      .from('tenant_integrations')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('provider', body.provider)
      .single();

    if (integErr || !integration) {
      return json(404, { error: `No saved integration found for provider=${body.provider}` });
    }

    const credentials = decryptIntegrationCredentials(integration.credentials || {}, { allowPlaintext: true });
    const testedAt = new Date().toISOString();

    const result = await runProviderTest(body.provider, credentials);

    const updatePayload = {
      status: result.ok ? 'connected' : 'error',
      connected_at: result.ok ? testedAt : integration.connected_at,
      last_tested_at: testedAt,
      last_test_result: result,
      last_error: result.ok ? null : result.error,
      updated_by_user_id: authData.user.id,
    };

    const { data: updated, error: updErr } = await supabase
      .from('tenant_integrations')
      .update(updatePayload)
      .eq('tenant_id', tenant_id)
      .eq('provider', body.provider)
      .select('*')
      .single();

    if (updErr) throw new Error(updErr.message);

    return json(result.ok ? 200 : 422, {
      ok: result.ok,
      tenant_id,
      provider: body.provider,
      test: result,
      integration: redactIntegration(updated),
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

type TestResult =
  | { ok: true; details: Record<string, any> }
  | { ok: false; error: string; details?: Record<string, any> };

async function runProviderTest(provider: z.infer<typeof ProviderSchema>, c: Record<string, any>): Promise<TestResult> {
  if (provider === 'facebook') {
    const token = String(c.access_token || '').trim();
    if (!token) return { ok: false, error: 'Missing facebook access_token' };

    const url = `https://graph.facebook.com/v20.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const res = await safeFetchJson(url);
    if (!res.ok) return { ok: false, error: `Facebook test failed: ${res.error}`, details: res.details };

    return {
      ok: true,
      details: {
        account_id: res.data?.id || null,
        name: res.data?.name || null,
      },
    };
  }
  if (provider === 'mailerlite') {
    const apiKey = String(c.api_key || '').trim();
    if (!apiKey) return { ok: false, error: 'Missing mailerlite api_key' };

    const res = await safeFetchJson('https://api.mailerlite.com/api/v2/groups', {
      headers: {
        'X-MailerLite-ApiKey': apiKey,
      },
    });

    if (!res.ok) return { ok: false, error: `MailerLite test failed: ${res.error}`, details: res.details };

    const groupCount = Array.isArray(res.data) ? res.data.length : 0;
    return {
      ok: true,
      details: {
        groups_detected: groupCount,
      },
    };
  }

  const secretKey = String(c.secret_key || '').trim();
  if (!secretKey) return { ok: false, error: 'Missing stripe secret_key' };

  const res = await safeFetchJson('https://api.stripe.com/v1/account', {
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });

  if (!res.ok) return { ok: false, error: `Stripe test failed: ${res.error}`, details: res.details };

  return {
    ok: true,
    details: {
      account_id: res.data?.id || null,
      country: res.data?.country || null,
      email: res.data?.email || null,
      charges_enabled: Boolean(res.data?.charges_enabled),
      payouts_enabled: Boolean(res.data?.payouts_enabled),
    },
  };
}

async function safeFetchJson(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, {
      ...init,
      method: init.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });

    const text = await resp.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!resp.ok) {
      return {
        ok: false as const,
        error: data?.error?.message || data?.message || text || `HTTP ${resp.status}`,
        details: data,
      };
    }

    return { ok: true as const, data };
  } catch (e: any) {
    return { ok: false as const, error: e?.message || 'Network error', details: null };
  } finally {
    clearTimeout(timeout);
  }
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
