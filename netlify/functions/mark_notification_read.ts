import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  id: z.string().uuid(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const { data, error } = await supabase
      .from('tenant_notifications')
      .update({ read: true } as any)
      .eq('tenant_id', body.tenant_id)
      .eq('id', body.id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    return json(200, { ok: true, notification: data });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function json(statusCode: number, body: any) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
