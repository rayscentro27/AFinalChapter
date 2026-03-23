import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export type AutonomySummary = {
  events_total: number;
  events_processed: number;
  tasks_created: number;
  messages_generated: number;
  active_agents: number;
  active_contexts: number;
  handoffs_triggered: number;
  skipped_actions: number;
  failures: number;
};

export type AgentContextItem = {
  id: string;
  client_id: string | null;
  tenant_id: string | null;
  active_stage: string;
  updated_at: string;
  created_at: string;
  recent_event_count: number;
  action_count: number;
  cooldown_count: number;
  owner_agent: string | null;
  status: string;
};

export type AutonomyEvent = {
  id: string;
  created_at: string;
  processed_at: string | null;
  event_type: string;
  client_id: string | null;
  tenant_id: string | null;
  status: string;
  processed_by: string | null;
  error_msg: string | null;
  payload_preview: string;
};

export type AgentActivity = {
  agent_name: string;
  total_actions: number;
  skipped_actions: number;
  failures: number;
  tasks_created: number;
  handoffs_triggered: number;
  last_action_at: string | null;
  top_action: string;
};

export type HandoffLogItem = {
  id: string;
  created_at: string;
  from_agent: string;
  to_agent: string;
  client_id: string | null;
  tenant_id: string | null;
  message_type: string;
  status: string;
  content_preview: string;
  thread_id: string | null;
};

export type SkippedActionItem = {
  id: string;
  created_at: string;
  agent_name: string;
  action_taken: string;
  event_type: string | null;
  reason: string;
  client_id: string | null;
};

export type FailureItem = {
  id: string;
  created_at: string;
  source: 'event' | 'action' | 'message';
  actor: string;
  type: string;
  reason: string;
  client_id: string | null;
  tenant_id: string | null;
};

export type AutonomyDashboardPayload = {
  ok: boolean;
  tenant_id: string | null;
  hours: number;
  filters?: {
    agent_name: string | null;
    active_stage: string | null;
    failure_source: 'all' | 'event' | 'action' | 'message';
    limit: number;
  };
  summary: AutonomySummary;
  events: AutonomyEvent[];
  agent_context: AgentContextItem[];
  agent_activity: AgentActivity[];
  handoff_log: HandoffLogItem[];
  skipped_actions: SkippedActionItem[];
  failures: FailureItem[];
  empty_state: boolean;
};

type Options = {
  tenantId?: string;
  hours?: number;
  limit?: number;
  agentName?: string;
  activeStage?: string;
  failureSource?: 'all' | 'event' | 'action' | 'message';
};

const EMPTY_PAYLOAD: AutonomyDashboardPayload = {
  ok: true,
  tenant_id: null,
  hours: 72,
  summary: {
    events_total: 0,
    events_processed: 0,
    tasks_created: 0,
    messages_generated: 0,
    active_agents: 0,
    active_contexts: 0,
    handoffs_triggered: 0,
    skipped_actions: 0,
    failures: 0,
  },
  events: [],
  agent_context: [],
  agent_activity: [],
  handoff_log: [],
  skipped_actions: [],
  failures: [],
  empty_state: true,
};

export default function useAutonomyDashboard({
  tenantId = '',
  hours = 72,
  limit = 50,
  agentName = '',
  activeStage = '',
  failureSource = 'all',
}: Options) {
  const [payload, setPayload] = useState<AutonomyDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function authToken() {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error('Sign in required');
    return token;
  }

  async function refresh() {
    try {
      setRefreshing(true);
      setError('');

      const token = await authToken();
      const params = new URLSearchParams();
      if (tenantId) params.set('tenant_id', tenantId);
      params.set('hours', String(hours));
      params.set('limit', String(limit));
      if (agentName) params.set('agent_name', agentName);
      if (activeStage) params.set('active_stage', activeStage);
      if (failureSource) params.set('failure_source', failureSource);

      const response = await fetch(`/.netlify/functions/admin-autonomy-dashboard?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      const body = (await response.json().catch(() => ({}))) as AutonomyDashboardPayload & { error?: string };
      if (!response.ok) throw new Error(String(body?.error || `Autonomy dashboard failed (${response.status})`));

      setPayload(body);
    } catch (refreshError: any) {
      setPayload(EMPTY_PAYLOAD);
      setError(String(refreshError?.message || refreshError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [tenantId, hours, limit, agentName, activeStage, failureSource]);

  return {
    payload: payload || EMPTY_PAYLOAD,
    loading,
    refreshing,
    error,
    refresh,
  };
}