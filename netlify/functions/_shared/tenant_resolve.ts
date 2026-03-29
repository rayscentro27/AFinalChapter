import type { SupabaseClient } from '@supabase/supabase-js';

function isMissingSchema(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return (
    (message.includes('relation') && message.includes('does not exist'))
    || (message.includes('could not find the table') && message.includes('schema cache'))
  );
}

async function listTenantIdsForUser(supabase: SupabaseClient): Promise<string[]> {
  const membershipRes = await supabase
    .from('tenant_memberships')
    .select('tenant_id');

  if (membershipRes.error && !isMissingSchema(membershipRes.error)) {
    throw new Error(`Failed to resolve tenant_id: ${membershipRes.error.message}`);
  }

  let rows = membershipRes.data || [];

  if (membershipRes.error && isMissingSchema(membershipRes.error)) {
    const fallbackRes = await supabase
      .from('tenant_members')
      .select('tenant_id');

    if (fallbackRes.error) {
      throw new Error(`Failed to resolve tenant_id: ${fallbackRes.error.message}`);
    }

    rows = fallbackRes.data || [];
  }

  return Array.from(new Set(rows.map((r: any) => String(r?.tenant_id || '')).filter(Boolean)));
}

export async function resolveTenantId(
  supabase: SupabaseClient,
  opts: { requestedTenantId?: string | null } = {}
): Promise<string> {
  const requested = (opts.requestedTenantId || '').trim();
  const ids = await listTenantIdsForUser(supabase);

  if (requested) {
    if (!ids.includes(requested)) {
      const err: any = new Error('Requested tenant_id is not accessible by current user');
      err.statusCode = 403;
      throw err;
    }
    return requested;
  }

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
