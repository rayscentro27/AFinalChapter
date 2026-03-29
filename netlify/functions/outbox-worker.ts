import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { proxyToOracle } from './_shared/oracle_proxy';

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user?.id) return json(401, { error: 'Unauthorized' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const { data: membership, error: membershipError } = await supabase
      .from('tenant_memberships')
      .select('tenant_id, role')
      .eq('tenant_id', body.tenant_id)
      .eq('user_id', authData.user.id)
      .in('role', ['owner', 'admin', 'supervisor'])
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) return json(403, { error: 'Forbidden: admin role required for tenant outbox worker' });

    const proxyResponse = await proxyToOracle({
      path: '/outbox/worker',
      method: 'POST',
      body: {
        tenant_id: body.tenant_id,
        limit: body.limit || 25,
      },
    });

    if (!proxyResponse.ok) {
      return json(proxyResponse.status, {
        ok: false,
        error: String(proxyResponse.json?.error || `Gateway outbox worker failed (${proxyResponse.status})`),
      });
    }

    return json(200, {
      ok: true,
      ...proxyResponse.json,
      tenant_id: body.tenant_id,
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
