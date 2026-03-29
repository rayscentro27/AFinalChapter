import { supabase } from './supabaseClient';

export type RunRoutingInput = {
  tenant_id?: string;
  conversation_id: string;
  dry_run?: boolean;
  force?: boolean;
};

export type RunRoutingResult = {
  ok: boolean;
  applied?: boolean;
  skipped?: boolean;
  reason?: string;
  matched_rule?: Record<string, unknown> | null;
  assigned?: {
    assignee_type?: string | null;
    assignee_user_id?: string | null;
    assignee_ai_key?: string | null;
  };
  error?: string;
  [key: string]: unknown;
};

export async function runInboxRouting(input: RunRoutingInput): Promise<RunRoutingResult> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in required to run routing');

  const res = await fetch('/.netlify/functions/routing-run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(json?.error || `routing-run failed (${res.status})`));
  }

  return json as RunRoutingResult;
}
