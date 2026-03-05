import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireStaffUser } from './_shared/staff_auth';

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const BodySchema = z.object({
  patch_id: z.string().min(10),
  approved_by: z.string().optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const actor = await requireStaffUser(event);

    if (!process.env.SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

    const { patch_id, approved_by } = BodySchema.parse(JSON.parse(event.body || '{}'));

    const { data: patch, error: patchErr } = await supabase
      .from('prompt_patches')
      .select('id, agent_name, patch_title, approved')
      .eq('id', patch_id)
      .single();

    if (patchErr || !patch) return json(404, { error: 'Patch not found' });

    // This will fail with a helpful error if migration hasn't been applied.
    const { error: upErr } = await supabase
      .from('prompt_patches')
      .update({
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: approved_by || actor.userId,
        apply_error: null,
      })
      .eq('id', patch_id);

    if (upErr) throw upErr;

    return json(200, {
      ok: true,
      patch_id,
      agent_name: patch.agent_name,
      patch_title: patch.patch_title,
      previously_approved: Boolean(patch.approved),
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
