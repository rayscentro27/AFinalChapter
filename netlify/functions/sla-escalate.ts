import type { Handler } from '@netlify/functions';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';

export const config = {
  schedule: '*/10 * * * *',
};

const DEFAULTS = {
  breachMinutes: 240,
  priorityThreshold: 10,
  candidateLimit: 250,
  countStatusesAsLoad: ['open', 'pending'],
  noteTagGuards: ['sla_escalated'],
  tagsToAdd: ['sla_breach', 'sla_escalated', 'urgent'],
};

type ChannelProvider = 'twilio' | 'whatsapp' | 'meta' | 'matrix' | 'google_voice';

type TenantRow = { id: string };

type MembershipRow = {
  user_id: string;
  role: string | null;
};

type TenantOnCallRow = {
  user_id: string;
  is_on_call: boolean;
  channel: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

type TenantChannelPoolRow = {
  user_id: string;
  enabled: boolean;
};

type ConversationCandidate = {
  id: string;
  tenant_id: string;
  status: string | null;
  priority: number | null;
  tags: string[] | null;
  last_message_at: string | null;
  updated_at: string | null;
  assignee_type: string | null;
  assignee_user_id: string | null;
  assignee_ai_key?: string | null;
  channel_account_id?: string | null;
  provider?: string | null;
};

const KNOWN_PROVIDERS: ChannelProvider[] = ['twilio', 'whatsapp', 'meta', 'matrix', 'google_voice'];
const KNOWN_PROVIDER_SET = new Set<string>(KNOWN_PROVIDERS);

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function isScheduledInvocation(event: Parameters<Handler>[0]) {
  const header = Object.entries(event.headers || {}).find(([k]) => k.toLowerCase() === 'x-nf-event')?.[1];
  return String(header || '').toLowerCase() === 'schedule';
}

function isMissingRelationError(err: unknown, relation: string): boolean {
  const message = String((err as any)?.message || '').toLowerCase();
  return message.includes('does not exist') && message.includes(relation.toLowerCase());
}

function isMissingColumnError(err: unknown, column: string): boolean {
  const message = String((err as any)?.message || '').toLowerCase();
  return message.includes(column.toLowerCase()) && message.includes('column');
}

function norm(value: unknown): string {
  return String(value || '').toLowerCase().trim();
}

function normalizeProvider(value: unknown): ChannelProvider | null {
  const candidate = norm(value);
  if (!candidate) return null;
  if (candidate === 'sms') return 'twilio';
  if (KNOWN_PROVIDER_SET.has(candidate)) return candidate as ChannelProvider;
  return null;
}

function minutesSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.floor((Date.now() - ts) / 60000);
}

function hasTag(tags: string[] | null | undefined, tag: string): boolean {
  return Array.isArray(tags) && tags.includes(tag);
}

function addTags(tags: string[] | null | undefined, additions: string[]): string[] {
  const base = Array.isArray(tags) ? tags : [];
  return Array.from(new Set([...base, ...additions]));
}

function makeSystemMessageId(): string {
  return `sys:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function isWithinOnCallWindow(row: TenantOnCallRow): boolean {
  const now = Date.now();
  const startsAt = row.starts_at ? new Date(row.starts_at).getTime() : null;
  const endsAt = row.ends_at ? new Date(row.ends_at).getTime() : null;

  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;
  return true;
}

function sortCandidatesByAgeDesc(candidates: ConversationCandidate[]): ConversationCandidate[] {
  return [...candidates].sort((a, b) => {
    const aAge = minutesSince(a.last_message_at || a.updated_at) ?? -1;
    const bAge = minutesSince(b.last_message_at || b.updated_at) ?? -1;
    return bAge - aAge;
  });
}

async function getTenants(admin: ReturnType<typeof getAdminSupabaseClient>): Promise<TenantRow[]> {
  const { data, error } = await admin.from('tenants').select('id');
  if (error) throw new Error(`Failed loading tenants: ${error.message}`);
  return (data || []) as TenantRow[];
}

async function getMembershipAgents(admin: ReturnType<typeof getAdminSupabaseClient>, tenantId: string): Promise<string[]> {
  const preferred = await admin
    .from('tenant_memberships')
    .select('user_id, role')
    .eq('tenant_id', tenantId);

  let rows: MembershipRow[] = [];

  if (preferred.error) {
    if (!isMissingRelationError(preferred.error, 'tenant_memberships')) {
      throw new Error(`Failed loading tenant memberships: ${preferred.error.message}`);
    }

    const fallback = await admin
      .from('tenant_members')
      .select('user_id, role')
      .eq('tenant_id', tenantId);

    if (fallback.error) {
      throw new Error(`Failed loading tenant members fallback: ${fallback.error.message}`);
    }

    rows = (fallback.data || []) as MembershipRow[];
  } else {
    rows = (preferred.data || []) as MembershipRow[];
  }

  const ids = rows
    .filter((row) => ['owner', 'admin', 'agent'].includes(norm(row.role)))
    .map((row) => row.user_id)
    .filter(Boolean);

  return Array.from(new Set(ids));
}

async function getOnCallAgentsForProvider(
  admin: ReturnType<typeof getAdminSupabaseClient>,
  args: { tenantId: string; provider: ChannelProvider | null }
): Promise<string[]> {
  const { tenantId, provider } = args;

  const onCall = await admin
    .from('tenant_on_call')
    .select('user_id, is_on_call, channel, starts_at, ends_at')
    .eq('tenant_id', tenantId)
    .eq('is_on_call', true);

  if (!onCall.error && onCall.data?.length) {
    const eligible = (onCall.data as TenantOnCallRow[])
      .filter(isWithinOnCallWindow)
      .filter((row) => {
        const channel = norm(row.channel || 'all');
        if (channel === 'all') return true;
        if (!provider) return true;
        return channel === provider;
      })
      .map((row) => row.user_id)
      .filter(Boolean);

    if (eligible.length) return Array.from(new Set(eligible));
  }

  if (onCall.error && !isMissingRelationError(onCall.error, 'tenant_on_call')) {
    throw new Error(`Failed loading tenant_on_call: ${onCall.error.message}`);
  }

  return getMembershipAgents(admin, tenantId);
}

async function applyChannelPool(
  admin: ReturnType<typeof getAdminSupabaseClient>,
  args: { tenantId: string; provider: ChannelProvider | null; agentIds: string[] }
): Promise<string[]> {
  const { tenantId, provider, agentIds } = args;
  if (!provider || agentIds.length === 0) return agentIds;

  const { data, error } = await admin
    .from('tenant_channel_pools')
    .select('user_id, enabled')
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .eq('enabled', true);

  if (error) {
    if (isMissingRelationError(error, 'tenant_channel_pools')) return agentIds;
    return agentIds;
  }

  const rows = (data || []) as TenantChannelPoolRow[];
  if (rows.length === 0) return agentIds;

  const pool = new Set(rows.map((row) => row.user_id));
  return agentIds.filter((id) => pool.has(id));
}

async function getAgentLoadMap(
  admin: ReturnType<typeof getAdminSupabaseClient>,
  args: { tenantId: string; agentIds: string[] }
): Promise<Record<string, number>> {
  const { tenantId, agentIds } = args;
  if (agentIds.length === 0) return {};

  const { data, error } = await admin
    .from('conversations')
    .select('assignee_user_id, status')
    .eq('tenant_id', tenantId)
    .in('assignee_user_id', agentIds);

  if (error) throw new Error(`Failed loading agent load map: ${error.message}`);

  const allowedStatuses = new Set(DEFAULTS.countStatusesAsLoad.map(norm));
  const load = Object.fromEntries(agentIds.map((id) => [id, 0])) as Record<string, number>;

  for (const row of data || []) {
    const userId = String((row as any).assignee_user_id || '');
    const status = norm((row as any).status);
    if (!userId || !allowedStatuses.has(status)) continue;
    load[userId] = Number(load[userId] || 0) + 1;
  }

  return load;
}

function pickLeastLoadedAgent(loadMap: Record<string, number>): string | null {
  let bestId: string | null = null;
  let bestLoad = Number.POSITIVE_INFINITY;

  for (const [userId, value] of Object.entries(loadMap)) {
    const load = Number(value);
    if (load < bestLoad) {
      bestLoad = load;
      bestId = userId;
    }
  }

  return bestId;
}

async function getBreachCandidates(
  admin: ReturnType<typeof getAdminSupabaseClient>,
  tenantId: string
): Promise<ConversationCandidate[]> {
  let withProvider: any = await admin
    .from('conversations')
    .select(
      'id, tenant_id, status, priority, tags, last_message_at, updated_at, assignee_type, assignee_user_id, assignee_ai_key, channel_account_id, provider'
    )
    .eq('tenant_id', tenantId)
    .lte('priority', DEFAULTS.priorityThreshold)
    .limit(DEFAULTS.candidateLimit);

  if (withProvider.error && (isMissingColumnError(withProvider.error, 'provider') || isMissingColumnError(withProvider.error, 'assignee_ai_key'))) {
    withProvider = await admin
      .from('conversations')
      .select('id, tenant_id, status, priority, tags, last_message_at, updated_at, assignee_type, assignee_user_id, channel_account_id')
      .eq('tenant_id', tenantId)
      .lte('priority', DEFAULTS.priorityThreshold)
      .limit(DEFAULTS.candidateLimit);
  }

  if (withProvider.error) {
    throw new Error(`Failed loading SLA candidates: ${withProvider.error.message}`);
  }

  const rows = (withProvider.data || []) as ConversationCandidate[];

  return rows.filter((conversation) => {
    const age = minutesSince(conversation.last_message_at || conversation.updated_at);
    if (age == null || age < DEFAULTS.breachMinutes) return false;

    if (norm(conversation.status) === 'closed') return false;

    const assignedToAgent = norm(conversation.assignee_type) === 'agent' && !!conversation.assignee_user_id;
    if (assignedToAgent) return false;

    for (const tag of DEFAULTS.noteTagGuards) {
      if (hasTag(conversation.tags, tag)) return false;
    }

    return true;
  });
}

async function getConversationProviderMap(
  admin: ReturnType<typeof getAdminSupabaseClient>,
  args: { tenantId: string; candidates: ConversationCandidate[] }
): Promise<Record<string, ChannelProvider | null>> {
  const { tenantId, candidates } = args;
  const providerByConversation: Record<string, ChannelProvider | null> = {};

  const unresolvedChannelIds = new Set<string>();
  const unresolvedConversationIds: string[] = [];

  for (const candidate of candidates) {
    const direct = normalizeProvider(candidate.provider);
    if (direct) {
      providerByConversation[candidate.id] = direct;
      continue;
    }

    providerByConversation[candidate.id] = null;
    unresolvedConversationIds.push(candidate.id);
    if (candidate.channel_account_id) unresolvedChannelIds.add(candidate.channel_account_id);
  }

  if (unresolvedChannelIds.size > 0) {
    const ids = Array.from(unresolvedChannelIds);
    const { data, error } = await admin
      .from('channel_accounts')
      .select('id, provider')
      .eq('tenant_id', tenantId)
      .in('id', ids);

    if (!error && data) {
      const providerByChannel = new Map<string, ChannelProvider>();
      for (const row of data as Array<{ id: string; provider: string }>) {
        const provider = normalizeProvider(row.provider);
        if (!provider) continue;
        providerByChannel.set(row.id, provider);
      }

      for (const candidate of candidates) {
        if (providerByConversation[candidate.id]) continue;
        if (!candidate.channel_account_id) continue;
        const provider = providerByChannel.get(candidate.channel_account_id);
        if (provider) providerByConversation[candidate.id] = provider;
      }
    }
  }

  for (const conversationId of unresolvedConversationIds) {
    if (providerByConversation[conversationId]) continue;

    const { data, error } = await admin
      .from('messages')
      .select('provider')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) continue;

    const provider = normalizeProvider((data as any).provider);
    if (provider) providerByConversation[conversationId] = provider;
  }

  return providerByConversation;
}

async function updateConversationAssignment(
  admin: ReturnType<typeof getAdminSupabaseClient>,
  args: { tenantId: string; conversationId: string; agentUserId: string; nextTags: string[] }
) {
  const { tenantId, conversationId, agentUserId, nextTags } = args;

  const withAiKey = await admin
    .from('conversations')
    .update({
      assignee_type: 'agent',
      assignee_user_id: agentUserId,
      assignee_ai_key: null,
      status: 'open',
      tags: nextTags,
    })
    .eq('tenant_id', tenantId)
    .eq('id', conversationId);

  if (withAiKey.error) {
    if (!isMissingColumnError(withAiKey.error, 'assignee_ai_key')) {
      throw new Error(`Failed updating escalated conversation: ${withAiKey.error.message}`);
    }

    const fallback = await admin
      .from('conversations')
      .update({
        assignee_type: 'agent',
        assignee_user_id: agentUserId,
        status: 'open',
        tags: nextTags,
      })
      .eq('tenant_id', tenantId)
      .eq('id', conversationId);

    if (fallback.error) {
      throw new Error(`Failed updating escalated conversation fallback: ${fallback.error.message}`);
    }
  }
}

async function insertSystemNote(
  admin: ReturnType<typeof getAdminSupabaseClient>,
  args: {
    tenantId: string;
    conversationId: string;
    provider: ChannelProvider | null;
    minutesStale: number | null;
    priority: number | null;
    assignedAgentUserId: string;
  }
) {
  const { tenantId, conversationId, provider, minutesStale, priority, assignedAgentUserId } = args;
  if (!provider) return;

  const body = `SLA breach auto-escalation: no activity for ~${minutesStale ?? '?'} minutes (priority ${priority ?? '?'}). Assigned to agent ${assignedAgentUserId.slice(0, 8)}. Channel: ${provider}.`;

  const { error } = await admin
    .from('messages')
    .insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'in',
      provider,
      provider_message_id: makeSystemMessageId(),
      provider_message_id_real: null,
      from_id: 'system',
      to_id: 'system',
      body,
      content: {
        type: 'sla_escalation',
        system_note: true,
        provider,
        minutes_stale: minutesStale,
        priority,
        assigned_agent_user_id: assignedAgentUserId,
      },
      status: 'sent',
      received_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Failed inserting SLA system note: ${error.message}`);
  }
}

async function logRoutingRun(
  admin: ReturnType<typeof getAdminSupabaseClient>,
  args: { tenantId: string; conversationId: string; notes: string }
) {
  const { tenantId, conversationId, notes } = args;
  try {
    await admin.from('routing_runs').insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      rule_id: null,
      applied: true,
      notes,
    });
  } catch {
    // no-op
  }
}

export const handler: Handler = async (event) => {
  try {
    if (!['POST', 'GET'].includes(event.httpMethod || '')) {
      return json(405, { ok: false, error: 'Method not allowed' });
    }

    const scheduled = isScheduledInvocation(event);
    const expectedToken = process.env.CRON_SHARED_TOKEN || '';
    const gotToken = Object.entries(event.headers || {}).find(([k]) => k.toLowerCase() === 'x-cron-token')?.[1] || '';

    if (!scheduled && expectedToken && gotToken !== expectedToken) {
      return json(401, { ok: false, error: 'Unauthorized' });
    }

    const admin = getAdminSupabaseClient();
    const tenants = await getTenants(admin);

    let escalatedCount = 0;

    for (const tenant of tenants) {
      const tenantId = tenant.id;
      const candidates = await getBreachCandidates(admin, tenantId);
      if (candidates.length === 0) continue;

      const providerByConversation = await getConversationProviderMap(admin, { tenantId, candidates });

      const grouped = new Map<string, ConversationCandidate[]>();
      for (const candidate of candidates) {
        const providerKey = providerByConversation[candidate.id] || 'unknown';
        const list = grouped.get(providerKey) || [];
        list.push(candidate);
        grouped.set(providerKey, list);
      }

      for (const [providerKey, group] of grouped.entries()) {
        const provider = normalizeProvider(providerKey);

        let agentIds = await getOnCallAgentsForProvider(admin, { tenantId, provider });
        if (agentIds.length === 0) continue;

        agentIds = await applyChannelPool(admin, { tenantId, provider, agentIds });
        if (agentIds.length === 0) continue;

        const loadMap = await getAgentLoadMap(admin, { tenantId, agentIds });
        const ordered = sortCandidatesByAgeDesc(group);

        for (const candidate of ordered) {
          const chosen = pickLeastLoadedAgent(loadMap);
          if (!chosen) break;

          const nextTags = addTags(candidate.tags, DEFAULTS.tagsToAdd);

          await updateConversationAssignment(admin, {
            tenantId,
            conversationId: candidate.id,
            agentUserId: chosen,
            nextTags,
          });

          const staleMinutes = minutesSince(candidate.last_message_at || candidate.updated_at);

          await insertSystemNote(admin, {
            tenantId,
            conversationId: candidate.id,
            provider,
            minutesStale: staleMinutes,
            priority: candidate.priority,
            assignedAgentUserId: chosen,
          });

          await logRoutingRun(admin, {
            tenantId,
            conversationId: candidate.id,
            notes: `Auto-escalated SLA breach (least-loaded, on-call, channel-aware) -> agent:${chosen} provider:${provider || 'unknown'}`,
          });

          loadMap[chosen] = Number(loadMap[chosen] || 0) + 1;
          escalatedCount += 1;
        }
      }
    }

    return json(200, {
      ok: true,
      scheduled,
      escalatedCount,
      ran_at: new Date().toISOString(),
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      error: String(e?.message || e),
      ran_at: new Date().toISOString(),
    });
  }
};
