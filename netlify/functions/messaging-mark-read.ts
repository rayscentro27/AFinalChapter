import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  conversation_id: z.string().uuid(),
  last_read_message_id: z.string().uuid().optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    const supabase = getUserSupabaseClient(event);
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const tenant_id = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const { data, error } = await supabase.rpc('mark_conversation_read', {
      p_tenant_id: tenant_id,
      p_conversation_id: body.conversation_id,
      p_last_read_message_id: body.last_read_message_id || null,
    });

    if (error) throw new Error(error.message || 'mark_conversation_read_failed');

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.ok) {
      return json(403, {
        ok: false,
        error: String(row?.reason || 'not_authorized'),
      });
    }

    return json(200, {
      ok: true,
      tenant_id,
      conversation_id: row?.conversation_id || body.conversation_id,
      last_read_message_id: row?.last_read_message_id || body.last_read_message_id || null,
      last_read_at: row?.last_read_at || null,
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
