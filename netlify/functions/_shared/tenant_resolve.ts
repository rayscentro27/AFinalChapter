import type { SupabaseClient } from '@supabase/supabase-js';

export async function resolveTenantId(
  supabase: SupabaseClient,
  opts: { requestedTenantId?: string | null } = {}
): Promise<string> {
  const requested = (opts.requestedTenantId || '').trim();
  if (requested) return requested;

  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to resolve tenant_id: ${error.message}`);

  const ids = Array.from(new Set((data || []).map((r: any) => String(r.tenant_id)).filter(Boolean)));
  if (ids.length === 1) return ids[0];

  if (ids.length === 0) {
    const err: any = new Error('No tenant membership found for user');
    err.statusCode = 403;
    throw err;
  }

  const err: any = new Error('Multiple tenants found for user; provide tenant_id');
  err.statusCode = 400;
  throw err;
}
