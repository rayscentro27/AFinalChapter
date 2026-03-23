import { supabase } from '../../lib/supabaseClient';

const INTERNAL_ROLES = new Set(['admin', 'supervisor']);

export async function resolveInternalAccess(userId?: string, role?: string) {
  if (!userId) return false;
  const accessRes = await supabase.rpc('nexus_is_master_admin_compat');
  if (accessRes.error) {
    return INTERNAL_ROLES.has(String(role || '').toLowerCase());
  }
  return Boolean(accessRes.data) || INTERNAL_ROLES.has(String(role || '').toLowerCase());
}

export async function authToken() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in required');
  return token;
}

type AuthFetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
};

export async function authFetchJson<T>(path: string, options: AuthFetchOptions = {}): Promise<T> {
  const token = await authToken();
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((body as { error?: string })?.error || `${path} failed (${response.status})`));
  }
  return body as T;
}