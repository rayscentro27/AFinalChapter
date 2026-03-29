import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { requireStaffUser } from './_shared/staff_auth';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';

const QuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  hours: z.coerce.number().int().min(1).max(720).optional().default(72),
  limit: z.coerce.number().int().min(10).max(500).optional().default(50),
  agent_name: z.string().trim().min(1).optional(),
  active_stage: z.string().trim().min(1).optional(),
  failure_source: z.enum(['all', 'event', 'action', 'message']).optional().default('all'),
});

type JsonRecord = Record<string, unknown>;

type AgentContextRow = {
  id: string;
  created_at: string;
  updated_at: string;
  client_id: string | null;
  tenant_id: string | null;
  active_stage: string | null;
  recent_events: unknown;
  last_actions: unknown;
  cooldown_state: unknown;
  meta: unknown;
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function toLower(value: unknown): string {
  return asText(value).toLowerCase();
}

function truncate(value: unknown, max = 220): string {
  const text = asText(value);
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

function stringifyPayload(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  try {
    return truncate(JSON.stringify(value), 220);
  } catch {
    return '';
  }
}

function matchesAny(value: string, tokens: string[]) {
  return tokens.some((token) => value.includes(token));
}

function actionHaystack(row: any): string {
  const meta = row?.meta && typeof row.meta === 'object' ? row.meta : {};
  return [
    toLower(row?.agent_name),
    toLower(row?.event_type),
    toLower(row?.action_taken),
    toLower(row?.decision_reason),
    toLower((meta as JsonRecord)?.skip_reason),
    toLower((meta as JsonRecord)?.failure_reason),
    toLower((meta as JsonRecord)?.status),
    toLower((meta as JsonRecord)?.result),
  ].join(' ');
}

function isSkippedAction(row: any): boolean {
  return matchesAny(actionHaystack(row), ['skip', 'cooldown', 'duplicate', 'noop', 'suppressed', 'defer']);
}

function isFailedAction(row: any): boolean {
  return matchesAny(actionHaystack(row), ['fail', 'error', 'abort', 'rejected', 'timeout']);
}

function isTaskCreatedAction(row: any): boolean {
  return matchesAny(actionHaystack(row), ['task_created', 'create task', 'created task', 'assignment', 'assigned']);
}

function normalizeStatus(value: unknown, fallback: string): string {
  const text = asText(value);
  return text || fallback;
}

function mapEvent(row: any) {
  return {
    id: asText(row?.id),
    created_at: asText(row?.created_at),
    processed_at: asText(row?.processed_at) || null,
    event_type: asText(row?.event_type) || 'unknown_event',
    client_id: asText(row?.client_id) || null,
    tenant_id: asText(row?.tenant_id) || null,
    status: normalizeStatus(row?.status, 'pending'),
    processed_by: asText(row?.processed_by) || null,
    error_msg: asText(row?.error_msg) || null,
    payload_preview: stringifyPayload(row?.payload),
  };
}

function mapHandoff(row: any) {
  return {
    id: asText(row?.id),
    created_at: asText(row?.created_at),
    from_agent: asText(row?.from_agent) || 'unknown_agent',
    to_agent: asText(row?.to_agent) || 'broadcast',
    client_id: asText(row?.client_id) || null,
    tenant_id: asText(row?.tenant_id) || null,
    message_type: normalizeStatus(row?.message_type, 'notification'),
    status: normalizeStatus(row?.status, 'pending'),
    content_preview: truncate(row?.content, 180),
    thread_id: asText(row?.thread_id) || null,
  };
}

function countJsonEntries(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value as JsonRecord).length;
  return 0;
}

function mapContext(row: AgentContextRow) {
  const meta = row?.meta && typeof row.meta === 'object' ? (row.meta as JsonRecord) : {};
  return {
    id: asText(row?.id),
    client_id: asText(row?.client_id) || null,
    tenant_id: asText(row?.tenant_id) || null,
    active_stage: normalizeStatus(row?.active_stage, 'discovery'),
    updated_at: asText(row?.updated_at),
    created_at: asText(row?.created_at),
    recent_event_count: countJsonEntries(row?.recent_events),
    action_count: countJsonEntries(row?.last_actions),
    cooldown_count: countJsonEntries(row?.cooldown_state),
    owner_agent: asText(meta.owner_agent) || asText(meta.agent_name) || null,
    status: normalizeStatus(meta.status, 'active'),
  };
}

function contextOwnerAgent(row: AgentContextRow): string {
  const meta = row?.meta && typeof row.meta === 'object' ? (row.meta as JsonRecord) : {};
  return asText(meta.owner_agent) || asText(meta.agent_name) || '';
}

function mapFailure(row: any, source: 'event' | 'action' | 'message') {
  if (source === 'event') {
    return {
      id: `event:${asText(row?.id)}`,
      created_at: asText(row?.created_at),
      source,
      actor: asText(row?.processed_by) || 'system',
      type: asText(row?.event_type) || 'event_failure',
      reason: asText(row?.error_msg) || normalizeStatus(row?.status, 'failed'),
      client_id: asText(row?.client_id) || null,
      tenant_id: asText(row?.tenant_id) || null,
    };
  }

  if (source === 'message') {
    return {
      id: `message:${asText(row?.id)}`,
      created_at: asText(row?.created_at),
      source,
      actor: asText(row?.from_agent) || 'unknown_agent',
      type: asText(row?.message_type) || 'message_failure',
      reason: asText(row?.status) || 'failed',
      client_id: asText(row?.client_id) || null,
      tenant_id: asText(row?.tenant_id) || null,
    };
  }

  return {
    id: `action:${asText(row?.id)}`,
    created_at: asText(row?.created_at),
    source,
    actor: asText(row?.agent_name) || 'unknown_agent',
    type: asText(row?.action_taken) || 'action_failure',
    reason: asText(row?.decision_reason) || 'failed_decision',
    client_id: asText(row?.client_id) || null,
    tenant_id: asText(row?.tenant_id) || null,
  };
}

function sortByCreatedDesc<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => asText(b.created_at).localeCompare(asText(a.created_at)));
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });

    await requireStaffUser(event);

    const parsed = QuerySchema.parse(event.queryStringParameters || {});
    const tenantId = parsed.tenant_id || '';
    const hours = Number(parsed.hours || 72);
    const limit = Number(parsed.limit || 50);
    const agentName = asText(parsed.agent_name);
    const activeStage = asText(parsed.active_stage);
    const failureSource = asText(parsed.failure_source || 'all');
    const sinceIso = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();
    const supabase = getAdminSupabaseClient();

    const applyTenant = <T,>(query: T & { eq: (column: string, value: string) => T }) => {
      if (!tenantId) return query;
      return query.eq('tenant_id', tenantId);
    };

    const [eventsRes, actionsRes, messagesRes, contextRes, eventsProcessedRes, eventsTotalRes, messagesTotalRes] = await Promise.all([
      applyTenant(
        supabase
          .from('system_events')
          .select('id,created_at,processed_at,event_type,client_id,tenant_id,payload,status,processed_by,error_msg')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
      applyTenant(
        supabase
          .from('agent_action_history')
          .select('id,created_at,agent_name,client_id,tenant_id,event_id,event_type,action_taken,output_id,decision_reason,meta')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(Math.max(limit * 4, 200)),
      ),
      applyTenant(
        supabase
          .from('internal_messages')
          .select('id,created_at,from_agent,to_agent,client_id,tenant_id,message_type,content,payload,status,thread_id')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(Math.max(limit * 4, 200)),
      ),
      applyTenant(
        supabase
          .from('agent_context')
          .select('id,created_at,updated_at,client_id,tenant_id,active_stage,recent_events,last_actions,cooldown_state,meta')
          .order('updated_at', { ascending: false })
          .limit(limit),
      ),
      applyTenant(
        supabase
          .from('system_events')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', sinceIso)
          .not('processed_at', 'is', null),
      ),
      applyTenant(
        supabase
          .from('system_events')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', sinceIso),
      ),
      applyTenant(
        supabase
          .from('internal_messages')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', sinceIso),
      ),
    ]);

    if (eventsRes.error) throw new Error(eventsRes.error.message);
    if (actionsRes.error) throw new Error(actionsRes.error.message);
    if (messagesRes.error) throw new Error(messagesRes.error.message);
    if (contextRes.error) throw new Error(contextRes.error.message);
    if (eventsProcessedRes.error) throw new Error(eventsProcessedRes.error.message);
    if (eventsTotalRes.error) throw new Error(eventsTotalRes.error.message);
    if (messagesTotalRes.error) throw new Error(messagesTotalRes.error.message);

    const events = Array.isArray(eventsRes.data) ? eventsRes.data : [];
    const actions = Array.isArray(actionsRes.data) ? actionsRes.data : [];
    const messages = Array.isArray(messagesRes.data) ? messagesRes.data : [];
    const contexts = Array.isArray(contextRes.data) ? (contextRes.data as AgentContextRow[]) : [];

    let filteredActions = actions;
    let filteredMessages = messages;
    let filteredContexts = contexts;
    let filteredEvents = events;

    if (agentName) {
      filteredActions = filteredActions.filter((row) => asText(row?.agent_name) === agentName);
      filteredMessages = filteredMessages.filter((row) => asText(row?.from_agent) === agentName || asText(row?.to_agent) === agentName);
      filteredContexts = filteredContexts.filter((row) => contextOwnerAgent(row) === agentName);
      const actionEventIds = new Set(filteredActions.map((row) => asText(row?.event_id)).filter(Boolean));
      filteredEvents = filteredEvents.filter((row) => asText(row?.processed_by) === agentName || actionEventIds.has(asText(row?.id)));
    }

    if (activeStage) {
      filteredContexts = filteredContexts.filter((row) => asText(row?.active_stage) === activeStage);
      const stageClientIds = new Set(filteredContexts.map((row) => asText(row.client_id)).filter(Boolean));
      if (stageClientIds.size > 0) {
        filteredActions = filteredActions.filter((row) => stageClientIds.has(asText(row?.client_id)));
        filteredMessages = filteredMessages.filter((row) => stageClientIds.has(asText(row?.client_id)));
        filteredEvents = filteredEvents.filter((row) => stageClientIds.has(asText(row?.client_id)));
      } else {
        filteredActions = [];
        filteredMessages = [];
        filteredEvents = [];
      }
    }

    const handoffs = sortByCreatedDesc(filteredMessages.filter((row) => asText(row?.to_agent))).slice(0, limit).map(mapHandoff);
    const skippedActions = sortByCreatedDesc(filteredActions.filter(isSkippedAction)).slice(0, limit).map((row) => ({
      id: asText(row?.id),
      created_at: asText(row?.created_at),
      agent_name: asText(row?.agent_name) || 'unknown_agent',
      action_taken: asText(row?.action_taken) || 'skipped_action',
      event_type: asText(row?.event_type) || null,
      reason: asText(row?.decision_reason) || truncate((row?.meta as JsonRecord)?.skip_reason, 180) || 'skipped',
      client_id: asText(row?.client_id) || null,
    }));

    let failures = sortByCreatedDesc([
      ...filteredEvents.filter((row) => asText(row?.error_msg) || ['failed', 'error'].includes(toLower(row?.status))).map((row) => mapFailure(row, 'event')),
      ...filteredActions.filter(isFailedAction).map((row) => mapFailure(row, 'action')),
      ...filteredMessages.filter((row) => ['failed', 'error'].includes(toLower(row?.status))).map((row) => mapFailure(row, 'message')),
    ]);
    if (failureSource && failureSource !== 'all') {
      failures = failures.filter((row) => row.source === failureSource);
    }
    failures = failures.slice(0, limit);

    const handoffsByAgent = new Map<string, number>();
    for (const row of handoffs) {
      handoffsByAgent.set(row.from_agent, Number(handoffsByAgent.get(row.from_agent) || 0) + 1);
    }

    const agentActivity = Array.from(filteredActions.reduce((map, row) => {
      const agentName = asText(row?.agent_name) || 'unknown_agent';
      const existing = map.get(agentName) || {
        agent_name: agentName,
        total_actions: 0,
        skipped_actions: 0,
        failures: 0,
        tasks_created: 0,
        last_action_at: asText(row?.created_at) || null,
        action_counts: {} as Record<string, number>,
      };

      existing.total_actions += 1;
      if (isSkippedAction(row)) existing.skipped_actions += 1;
      if (isFailedAction(row)) existing.failures += 1;
      if (isTaskCreatedAction(row)) existing.tasks_created += 1;

      const actionKey = asText(row?.action_taken) || 'unknown_action';
      existing.action_counts[actionKey] = Number(existing.action_counts[actionKey] || 0) + 1;
      if (asText(row?.created_at) > asText(existing.last_action_at)) existing.last_action_at = asText(row?.created_at);

      map.set(agentName, existing);
      return map;
    }, new Map<string, any>()).values())
      .map((row) => {
        const topAction = Object.entries(row.action_counts)
          .sort((left, right) => Number(right[1]) - Number(left[1]))[0]?.[0] || 'unknown_action';
        return {
          agent_name: row.agent_name,
          total_actions: row.total_actions,
          skipped_actions: row.skipped_actions,
          failures: row.failures,
          tasks_created: row.tasks_created,
          handoffs_triggered: Number(handoffsByAgent.get(row.agent_name) || 0),
          last_action_at: row.last_action_at,
          top_action: topAction,
        };
      })
      .sort((left, right) => right.total_actions - left.total_actions);

    const taskCreatedCount = filteredActions.filter(isTaskCreatedAction).length;
    const contextItems = filteredContexts.map(mapContext).slice(0, limit);
    const activeContexts = contextItems.filter((row) => !['paused', 'inactive', 'disabled'].includes(toLower(row.status)));

    return json(200, {
      ok: true,
      tenant_id: tenantId || null,
      hours,
      filters: {
        agent_name: agentName || null,
        active_stage: activeStage || null,
        failure_source: failureSource || 'all',
        limit,
      },
      summary: {
        events_total: filteredEvents.length,
        events_processed: filteredEvents.filter((row) => asText(row?.processed_at)).length,
        tasks_created: taskCreatedCount,
        messages_generated: filteredMessages.length,
        active_agents: agentActivity.length,
        active_contexts: activeContexts.length,
        handoffs_triggered: handoffs.length,
        skipped_actions: skippedActions.length,
        failures: failures.length,
      },
      events: filteredEvents.slice(0, limit).map(mapEvent),
      agent_context: contextItems,
      agent_activity: agentActivity,
      handoff_log: handoffs,
      skipped_actions: skippedActions,
      failures,
      empty_state: filteredEvents.length === 0 && filteredActions.length === 0 && filteredMessages.length === 0 && contextItems.length === 0,
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 400;
    return json(statusCode, { ok: false, error: String(error?.message || 'bad_request') });
  }
};