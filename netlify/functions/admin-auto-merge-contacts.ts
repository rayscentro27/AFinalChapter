import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { proxyToOracle } from './_shared/oracle_proxy';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  dry_run: z.boolean().default(true),
  max_merges: z.number().int().min(1).max(100).default(25),
});

type IdentityRow = {
  contact_id: string;
  identity_type: string;
  identity_value: string;
  verified: boolean;
};

type ContactRow = {
  id: string;
  merged_into_contact_id: string | null;
  updated_at: string | null;
};

type MergePlan = {
  from_contact_id: string;
  into_contact_id: string;
  reason: string;
  via_identity_type: string;
  via_identity_value: string;
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user?.id) return json(401, { error: 'Unauthorized' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const tenantId = await resolveOwnerTenantForUser(supabase as any, authData.user.id, body.tenant_id);

    const plan = await buildStrongMergePlan(supabase as any, tenantId, body.max_merges);

    if (body.dry_run) {
      return json(200, {
        ok: true,
        tenant_id: tenantId,
        dry_run: true,
        planned_count: plan.length,
        merges: plan,
      });
    }

    const results: Array<{ ok: boolean; merge: MergePlan; error?: string }> = [];
    for (const merge of plan) {
      const proxied = await proxyToOracle({
        path: '/admin/contacts/merge',
        method: 'POST',
        body: {
          tenant_id: tenantId,
          from_contact_id: merge.from_contact_id,
          into_contact_id: merge.into_contact_id,
          reason: merge.reason,
          },
        forwardAuth: true,
        event,
      });

      if (!proxied.ok) {
        results.push({
          ok: false,
          merge,
          error: String(proxied.json?.error || `merge failed (${proxied.status})`),
        });
        continue;
      }

      results.push({ ok: true, merge });
    }

    const merged_count = results.filter((r) => r.ok).length;
    return json(200, {
      ok: true,
      tenant_id: tenantId,
      dry_run: false,
      planned_count: plan.length,
      merged_count,
      failed_count: results.length - merged_count,
      results,
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

async function resolveOwnerTenantForUser(supabase: any, userId: string, requestedTenantId?: string): Promise<string> {
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('tenant_id, role, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to resolve tenant membership: ${error.message}`);

  const ownerTenantIds = Array.from(
    new Set(
      (data || [])
        .map((row: any) => ({
          tenant_id: String(row?.tenant_id || ''),
          role: String(row?.role || '').toLowerCase(),
        }))
        .filter((row: any) => row.tenant_id && row.role === 'owner')
        .map((row: any) => row.tenant_id)
    )
  );

  if (!ownerTenantIds.length) {
    const err: any = new Error('Forbidden: owner role required');
    err.statusCode = 403;
    throw err;
  }

  if (requestedTenantId) {
    if (!ownerTenantIds.includes(requestedTenantId)) {
      const err: any = new Error('Requested tenant_id is not accessible with owner role');
      err.statusCode = 403;
      throw err;
    }
    return requestedTenantId;
  }

  if (ownerTenantIds.length > 1) {
    const err: any = new Error('Multiple owner tenants found; provide tenant_id');
    err.statusCode = 400;
    throw err;
  }

  return String(ownerTenantIds[0]);
}

async function buildStrongMergePlan(supabase: any, tenantId: string, maxMerges: number): Promise<MergePlan[]> {
  const contactsRes = await supabase
    .from('contacts')
    .select('id, merged_into_contact_id, updated_at')
    .eq('tenant_id', tenantId)
    .is('merged_into_contact_id', null)
    .order('updated_at', { ascending: false })
    .limit(2000);

  if (contactsRes.error) throw new Error(`contacts fetch failed: ${contactsRes.error.message}`);

  const contacts = (contactsRes.data || []) as ContactRow[];
  const activeIds = new Set(contacts.map((c) => c.id));
  if (!activeIds.size) return [];

  const identityRes = await supabase
    .from('contact_identities')
    .select('contact_id, identity_type, identity_value, verified')
    .eq('tenant_id', tenantId)
    .in('identity_type', ['phone', 'email'])
    .order('verified', { ascending: false })
    .limit(5000);

  if (identityRes.error) throw new Error(`contact_identities fetch failed: ${identityRes.error.message}`);

  const identities = ((identityRes.data || []) as IdentityRow[])
    .filter((r) => activeIds.has(String(r.contact_id || '')))
    .map((r) => ({
      ...r,
      identity_type: String(r.identity_type || '').toLowerCase(),
      identity_value: String(r.identity_value || '').trim(),
    }))
    .filter((r) => r.identity_value && Boolean(r.verified));

  const byIdentity = new Map<string, Set<string>>();
  for (const row of identities) {
    const key = `${row.identity_type}::${row.identity_value}`;
    const set = byIdentity.get(key) || new Set<string>();
    set.add(row.contact_id);
    byIdentity.set(key, set);
  }

  const identityCount = new Map<string, number>();
  for (const row of identities) {
    identityCount.set(row.contact_id, (identityCount.get(row.contact_id) || 0) + 1);
  }

  const plans: MergePlan[] = [];
  const plannedFrom = new Set<string>();

  const groups = Array.from(byIdentity.entries())
    .map(([key, set]) => ({
      key,
      contactIds: Array.from(set),
    }))
    .filter((g) => g.contactIds.length >= 2)
    .sort((a, b) => b.contactIds.length - a.contactIds.length);

  for (const group of groups) {
    const [identity_type, identity_value] = group.key.split('::');

    const ranked = group.contactIds
      .map((id) => ({
        id,
        score: identityCount.get(id) || 0,
      }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

    const target = ranked[0]?.id;
    if (!target) continue;

    for (const candidate of ranked.slice(1)) {
      const from = candidate.id;
      if (from === target) continue;
      if (plannedFrom.has(from)) continue;

      plannedFrom.add(from);
      plans.push({
        from_contact_id: from,
        into_contact_id: target,
        reason: `auto-merge strong ${identity_type}: ${identity_value}`,
        via_identity_type: identity_type,
        via_identity_value: identity_value,
      });

      if (plans.length >= maxMerges) return plans;
    }
  }

  return plans;
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
