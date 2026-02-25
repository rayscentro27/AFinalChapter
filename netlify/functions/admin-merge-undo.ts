import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { proxyToOracle } from './_shared/oracle_proxy';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  job_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  reason: z.string().max(500).optional(),
});

const ALLOWED_ROLES = new Set(['owner', 'admin', 'agent']);

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user?.id) return json(401, { error: 'Unauthorized' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const tenantId = await resolveUndoTenantForUser(
      supabase as any,
      authData.user.id,
      body.tenant_id
    );

    const jobId = typeof body.job_id === 'string' ? Number(body.job_id) : body.job_id;
    if (!Number.isInteger(jobId) || jobId <= 0) {
      return json(400, { error: 'job_id must be a positive integer' });
    }

    const proxyResponse = await proxyToOracle({
      path: '/admin/contacts/merge/undo',
      method: 'POST',
      body: {
        tenant_id: tenantId,
        job_id: jobId,
        requester_user_id: authData.user.id,
        reason: body.reason || null,
      },
    });

    const responseJson = proxyResponse.json || {};
    if (!proxyResponse.ok) {
      return json(proxyResponse.status, {
        ok: false,
        error: String(responseJson?.error || `Oracle contact merge undo failed (${proxyResponse.status})`),
        details: responseJson?.details || undefined,
      });
    }

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      result: responseJson?.result || null,
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

async function resolveUndoTenantForUser(supabase: any, userId: string, requestedTenantId?: string): Promise<string> {
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

  const allowedTenantIds = Array.from(
    new Set(
      memberships
        .filter((row: any) => ALLOWED_ROLES.has(row.role))
        .map((row: any) => row.tenant_id)
    )
  );

  if (!allowedTenantIds.length) {
    const err: any = new Error('Forbidden: owner/admin/agent role required');
    err.statusCode = 403;
    throw err;
  }

  if (requestedTenantId) {
    if (!allowedTenantIds.includes(requestedTenantId)) {
      const err: any = new Error('Requested tenant_id is not accessible with owner/admin/agent role');
      err.statusCode = 403;
      throw err;
    }
    return requestedTenantId;
  }

  if (allowedTenantIds.length > 1) {
    const err: any = new Error('Multiple accessible tenants found; provide tenant_id');
    err.statusCode = 400;
    throw err;
  }

  return String(allowedTenantIds[0]);
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
