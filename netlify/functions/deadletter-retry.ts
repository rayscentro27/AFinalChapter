import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { assertOracleProxyConfig } from './_shared/oracle_proxy';

const BodySchema = z.object({
  id: z.number().int().positive(),
});

const ALLOWED_REPLAY_ROLES = new Set(['owner', 'admin', 'supervisor']);

function asText(value: unknown): string {
  return String(value || '').trim();
}

function normalizeRole(value: unknown): string {
  return asText(value).toLowerCase();
}

function isMissingSchema(error: any): boolean {
  const message = asText(error?.message).toLowerCase();
  return (
    (message.includes('relation') && message.includes('does not exist'))
    || (message.includes('could not find the table') && message.includes('schema cache'))
  );
}

async function resolveMembershipRole(supabase: any, tenantId: string, userId: string): Promise<string | null> {
  const membership = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!membership.error) {
    return normalizeRole(membership.data?.role) || null;
  }

  if (!isMissingSchema(membership.error)) {
    throw new Error(`Failed to resolve tenant membership: ${membership.error.message}`);
  }

  const fallback = await supabase
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (fallback.error) {
    throw new Error(`Failed to resolve tenant membership: ${fallback.error.message}`);
  }

  return normalizeRole(fallback.data?.role) || null;
}

async function writeDeadletterReplayAudit(args: {
  tenantId: string;
  actorUserId: string;
  deadletterId: number;
  provider: string;
  endpoint: string;
  role: string;
  replayOk: boolean;
  responseStatus: number;
  attemptsBefore: number;
  attemptsAfter: number;
}): Promise<boolean> {
  const admin = getAdminSupabaseClient();
  const now = new Date().toISOString();

  const metadata = {
    replay_ok: args.replayOk,
    response_status: args.responseStatus,
    provider: args.provider || null,
    endpoint: args.endpoint,
    role: args.role,
    attempts_before: args.attemptsBefore,
    attempts_after: args.attemptsAfter,
  };

  const modern = await admin
    .from('audit_events')
    .insert({
      tenant_id: args.tenantId,
      actor_user_id: args.actorUserId,
      actor_type: 'user',
      action: 'deadletter_retry',
      entity_type: 'webhook_dead_letter',
      entity_id: String(args.deadletterId),
      metadata,
      occurred_at: now,
    });

  if (!modern.error) return true;

  if (!isMissingSchema(modern.error)) {
    // Try fallback shape used by older migrations before failing hard.
  }

  const fallback = await admin
    .from('audit_events')
    .insert({
      tenant_id: args.tenantId,
      actor_user_id: args.actorUserId,
      event_type: 'deadletter_retry',
      metadata: {
        entity_type: 'webhook_dead_letter',
        entity_id: String(args.deadletterId),
        ...metadata,
      },
      created_at: now,
    });

  return !fallback.error;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user?.id) return json(401, { error: 'Unauthorized' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const { data: row, error: rowError } = await supabase
      .from('webhook_dead_letters')
      .select('id,tenant_id,provider,endpoint,payload,error,attempts,next_retry_at,resolved_at')
      .eq('id', body.id)
      .single();

    if (rowError || !row) return json(404, { error: 'Dead-letter record not found' });

    const tenantId = asText(row.tenant_id);
    const actorUserId = asText(authData.user.id);
    if (!tenantId || !actorUserId) return json(400, { error: 'Invalid dead-letter tenant context' });

    const role = await resolveMembershipRole(supabase, tenantId, actorUserId);
    if (!role || !ALLOWED_REPLAY_ROLES.has(role)) {
      return json(403, { error: 'Forbidden: owner/admin/supervisor role required for dead-letter replay' });
    }

    if (row.resolved_at) return json(200, { ok: true, note: 'Already resolved' });

    const { baseUrl, apiKey } = assertOracleProxyConfig();
    const endpoint = String(row.endpoint || '').trim();
    if (!endpoint.startsWith('/')) {
      return json(400, { error: 'Stored endpoint is invalid for replay' });
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-replay': 'deadletter',
      },
      body: JSON.stringify(row.payload || {}),
    });

    const text = await response.text().catch(() => '');
    const ok = response.ok;

    const attempts = Number(row.attempts || 0) + 1;
    const nextRetryMinutes = Math.min(60, 5 * attempts);

    const patch = ok
      ? {
          attempts,
          error: null,
          next_retry_at: null,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : {
          attempts,
          error: `Replay failed: HTTP ${response.status} ${text}`.slice(0, 5000),
          next_retry_at: new Date(Date.now() + nextRetryMinutes * 60000).toISOString(),
          updated_at: new Date().toISOString(),
        };

    const { error: updateError } = await supabase
      .from('webhook_dead_letters')
      .update(patch)
      .eq('id', row.id);

    if (updateError) throw updateError;

    const auditLogged = await writeDeadletterReplayAudit({
      tenantId,
      actorUserId,
      deadletterId: Number(row.id),
      provider: asText(row.provider),
      endpoint,
      role,
      replayOk: ok,
      responseStatus: Number(response.status),
      attemptsBefore: Number(row.attempts || 0),
      attemptsAfter: attempts,
    });

    return json(ok ? 200 : 502, {
      ok,
      status: response.status,
      response: text || null,
      audit_logged: auditLogged,
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
