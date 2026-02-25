import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { proxyToOracle } from './_shared/oracle_proxy';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  from_contact_id: z.string().uuid(),
  into_contact_id: z.string().uuid(),
});

const ADMIN_ROLES = new Set(['owner', 'admin']);

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user?.id) return json(401, { error: 'Unauthorized' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const tenantId = await resolveAdminTenantForUser(
      supabase as any,
      authData.user.id,
      body.tenant_id
    );

    if (body.from_contact_id === body.into_contact_id) {
      return json(400, { error: 'from_contact_id and into_contact_id must be different' });
    }

    const proxyResponse = await proxyToOracle({
      path: '/admin/contacts/merge/preview',
      method: 'POST',
      body: {
        tenant_id: tenantId,
        from_contact_id: body.from_contact_id,
        into_contact_id: body.into_contact_id,
      },
    });

    const responseJson = proxyResponse.json || {};
    if (!proxyResponse.ok) {
      return json(proxyResponse.status, {
        ok: false,
        error: String(responseJson?.error || `Oracle merge preview failed (${proxyResponse.status})`),
      });
    }

    return json(200, {
      ok: true,
      ...responseJson,
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

async function resolveAdminTenantForUser(supabase: any, userId: string, requestedTenantId?: string): Promise<string> {
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('tenant_id, role, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to resolve tenant membership: ${error.message}`);

  const memberships = (data || [])
    .map((row: any) => ({
      tenant_id: String(row?.tenant_id || ''),
      role: String(row?.role || '').toLowerCase(),
    }))
    .filter((row: any) => row.tenant_id);

  const adminTenantIds = Array.from(
    new Set(
      memberships
        .filter((row: any) => ADMIN_ROLES.has(row.role))
        .map((row: any) => row.tenant_id)
    )
  );

  if (!adminTenantIds.length) {
    const err: any = new Error('Forbidden: owner/admin role required');
    err.statusCode = 403;
    throw err;
  }

  if (requestedTenantId) {
    if (!adminTenantIds.includes(requestedTenantId)) {
      const err: any = new Error('Requested tenant_id is not accessible with owner/admin role');
      err.statusCode = 403;
      throw err;
    }
    return requestedTenantId;
  }

  if (adminTenantIds.length > 1) {
    const err: any = new Error('Multiple admin tenants found; provide tenant_id');
    err.statusCode = 400;
    throw err;
  }

  return String(adminTenantIds[0]);
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
