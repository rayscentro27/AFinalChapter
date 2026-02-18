import { supabase } from '../../lib/supabaseClient';
import { ClientTask } from '../../types';

export type ClientTaskRow = {
  tenant_id: string;
  task_id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'completed';
  due_date: string; // YYYY-MM-DD
  type: ClientTask['type'];
  link: string | null;
  meeting_time: string | null;
  linked_to_goal: boolean | null;
  meta: any;
  updated_at?: string;
};

export function rowToClientTask(r: ClientTaskRow): ClientTask {
  return {
    id: String(r.task_id),
    title: String(r.title),
    description: r.description ?? undefined,
    status: r.status,
    date: String(r.due_date),
    type: r.type,
    link: r.link ?? undefined,
    meetingTime: r.meeting_time ?? undefined,
    linkedToGoal: r.linked_to_goal ?? undefined,
  };
}

function toIsoOrNull(s?: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function clientTaskToRow(tenantId: string, t: ClientTask): Omit<ClientTaskRow, 'meta'> & { meta: any } {
  const meetingIso = toIsoOrNull(t.meetingTime);
  const meta: any = {};
  if (t.meetingTime && !meetingIso) meta.meetingTime = t.meetingTime;

  return {
    tenant_id: tenantId,
    task_id: t.id,
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    due_date: t.date,
    type: t.type,
    link: t.link ?? null,
    meeting_time: meetingIso,
    linked_to_goal: t.linkedToGoal ?? null,
    meta,
  };
}

export async function fetchTasksForTenants(tenantIds: string[]) {
  if (!tenantIds.length) return [] as ClientTaskRow[];

  const { data, error } = await supabase
    .from('client_tasks')
    .select('*')
    .in('tenant_id', tenantIds)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Supabase error fetching client_tasks:', error);
    return [];
  }

  return (data || []) as any as ClientTaskRow[];
}

export async function upsertTasksForTenant(tenantId: string, tasks: ClientTask[]) {
  if (!tenantId) return;
  if (!Array.isArray(tasks) || tasks.length === 0) return;

  const rows = tasks.map((t) => clientTaskToRow(tenantId, t));

  const { error } = await supabase
    .from('client_tasks')
    .upsert(rows as any, { onConflict: 'tenant_id,task_id' });

  if (error) console.error('Supabase error upserting client_tasks:', error);
}
