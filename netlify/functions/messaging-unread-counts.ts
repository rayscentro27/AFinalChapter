import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  conversation_ids: z.array(z.string().uuid()).min(1).max(500),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    const supabase = getUserSupabaseClient(event);
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const tenant_id = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const { data, error } = await supabase.rpc('get_conversation_unread_counts', {
      p_tenant_id: tenant_id,
      p_conversation_ids: body.conversation_ids,
    });

    if (error) throw new Error(error.message || 'get_conversation_unread_counts_failed');

    const rows = Array.isArray(data) ? data : [];
    const byConversationId: Record<string, number> = {};
    for (const row of rows) {
      const key = String((row as any)?.conversation_id || '');
      if (!key) continue;
      byConversationId[key] = Number((row as any)?.unread_count || 0);
    }

    return json(200, {
      ok: true,
      tenant_id,
      unread_counts: byConversationId,
      rows,
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { ok: false, error: e?.message || 'bad_request' });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}
