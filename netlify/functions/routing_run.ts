import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { proxyToOracle } from './_shared/oracle_proxy';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  conversation_id: z.string().uuid(),
  dry_run: z.boolean().optional(),
  force: z.boolean().optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user?.id) return json(401, { error: 'Unauthorized' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const tenantId = await resolveTenantForUser(supabase as any, authData.user.id, body.tenant_id);
    await assertConversationAccess(supabase as any, tenantId, body.conversation_id);

    const proxyResponse = await proxyToOracle({
      path: '/routing/run',
      method: 'POST',
      body: {
        tenant_id: tenantId,
        conversation_id: body.conversation_id,
        dry_run: Boolean(body.dry_run),
        force: Boolean(body.force),
      },
    });

    const responseJson = proxyResponse.json || {};
    if (!proxyResponse.ok) {
      return json(proxyResponse.status, {
        ok: false,
        error: String(responseJson?.error || `Gateway routing failed (${proxyResponse.status})`),
        details: responseJson?.details || null,
      });
    }

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      conversation_id: body.conversation_id,
      ...responseJson,
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

async function resolveTenantForUser(
  supabase: any,
  userId: string,
  requestedTenantId?: string
): Promise<string> {
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('tenant_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to resolve tenant membership: ${error.message}`);

  const tenantIds: string[] = Array.from(new Set((data || []).map((r: any) => String(r.tenant_id)).filter(Boolean)));
  if (!tenantIds.length) throw statusError(403, 'No tenant membership found for user');

  if (requestedTenantId) {
    if (!tenantIds.includes(requestedTenantId)) {
      throw statusError(403, 'Requested tenant_id is not accessible by current user');
    }
    return requestedTenantId;
  }

  if (tenantIds.length > 1) {
    throw statusError(400, 'Multiple tenants found for user; provide tenant_id');
  }

  return tenantIds[0];
}

async function assertConversationAccess(supabase: any, tenantId: string, conversationId: string) {
  const { data, error } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', conversationId)
    .single();

  if (error || !data) throw statusError(404, 'Conversation not found for tenant');
}

function statusError(statusCode: number, message: string) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
