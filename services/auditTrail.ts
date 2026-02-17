import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

export async function writeAuditLog(input: {
  tenant_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  meta?: Record<string, any>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!isSupabaseConfigured) return { ok: false, error: 'Supabase not configured.' };

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) return { ok: false, error: userErr.message };

    const user_id = userData?.user?.id;

    const { error } = await supabase.from('audit_logs').insert({
      tenant_id: input.tenant_id,
      user_id,
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      meta: input.meta ?? {},
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Unknown error' };
  }
}
