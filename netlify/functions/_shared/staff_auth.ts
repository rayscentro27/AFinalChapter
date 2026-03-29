import type { HandlerEvent } from '@netlify/functions';
import { getAdminSupabaseClient } from './supabase_admin_client';

const STAFF_ROLES = new Set(['admin', 'supervisor', 'sales', 'salesperson', 'superadmin', 'super_admin']);

export function isStaffRole(role: string | null | undefined) {
  const normalized = String(role || '').toLowerCase();
  // Accept both 'superadmin' and 'super_admin' as staff
  return STAFF_ROLES.has(normalized) || normalized === 'superadmin' || normalized === 'super_admin';
}

export function getBearerToken(event: Pick<HandlerEvent, 'headers'>): string | null {
  const auth = Object.entries(event.headers || {}).find(([k]) => k.toLowerCase() === 'authorization')?.[1] || '';
  const v = String(auth || '');
  if (!v.toLowerCase().startsWith('bearer ')) return null;
  return v.slice(7).trim() || null;
}

export async function requireStaffUser(event: Pick<HandlerEvent, 'headers'>): Promise<{ userId: string; roles: string[] }> {
  const jwt = getBearerToken(event);
  if (!jwt) {
    const err: any = new Error('Missing Authorization bearer token');
    err.statusCode = 401;
    throw err;
  }

  const admin = getAdminSupabaseClient();
  const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userRes?.user?.id) {
    const err: any = new Error('Invalid bearer token');
    err.statusCode = 401;
    throw err;
  }

  const userId = userRes.user.id;
  const { data: rows, error } = await admin
    .from('tenant_memberships')
    .select('role')
    .eq('user_id', userId);

  if (error) {
    const err: any = new Error(`Failed to resolve staff role: ${error.message}`);
    err.statusCode = 400;
    throw err;
  }

  const roles = Array.from(new Set((rows || []).map((r: any) => String(r?.role || '').toLowerCase()).filter(Boolean)));
  const staff = roles.some((r) => isStaffRole(r));

  if (!staff) {
    const err: any = new Error('Staff role required');
    err.statusCode = 403;
    throw err;
  }

  return { userId, roles };
}


export async function requireAuthenticatedUser(event: Pick<HandlerEvent, 'headers'>): Promise<{ userId: string }> {
  const jwt = getBearerToken(event);
  if (!jwt) {
    const err: any = new Error('Missing Authorization bearer token');
    err.statusCode = 401;
    throw err;
  }

  const admin = getAdminSupabaseClient();
  const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userRes?.user?.id) {
    const err: any = new Error('Invalid bearer token');
    err.statusCode = 401;
    throw err;
  }

  return { userId: userRes.user.id };
}
