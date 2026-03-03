import { supabase } from '../lib/supabaseClient';

type TenantMembershipRow = { tenant_id: string };

export async function resolveTenantIdForUser(userId: string): Promise<string | null> {
  const preferred = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!preferred.error && preferred.data?.tenant_id) {
    return String((preferred.data as TenantMembershipRow).tenant_id);
  }

  const fallback = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!fallback.error && (fallback.data as any)?.tenant_id) {
    return String((fallback.data as any).tenant_id);
  }

  return null;
}

export async function sha256Marker(input: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((i) => i.toString(16).padStart(2, '0')).join('');
}
