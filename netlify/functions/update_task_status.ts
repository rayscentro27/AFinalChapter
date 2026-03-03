import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  task_id: z.string().min(1),

  // Preferred: explicit fields
  status: z.enum(['pending', 'completed']).optional(),
  signal: z.enum(['red', 'yellow', 'green']).optional(),

  // Back-compat: some callers send red/yellow/green as `status`
  status_signal: z.enum(['red', 'yellow', 'green']).optional(),
});

type TaskRow = {
  tenant_id: string;
  task_id: string;
  title: string;
  status: string;
  signal: string | null;
  user_id: string | null;
  workflow_instance_id: string | null;
  workflow_step_number: number | null;
};

function getAuthHeader(headers?: Record<string, string | undefined>): string {
  const auth = Object.entries(headers || {}).find(([k]) => k.toLowerCase() === 'authorization')?.[1];
  return String(auth || '');
}

async function sendTaskUpdateEmailBestEffort(params: {
  authHeader: string;
  tenantId: string;
  task: TaskRow;
  actorUserId: string;
  actorName: string;
  profileEmail: string;
}) {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!supabaseUrl || !anonKey || !params.authHeader || !params.profileEmail) {
    return;
  }

  const statusLabel = String(params.task.status || 'updated').toLowerCase();
  const subject = `Task update: ${params.task.title}`;
  const html = `<p>Your task <strong>${params.task.title}</strong> was updated to <strong>${statusLabel}</strong>.</p><p>This is an educational workflow notification.</p>`;
  const text = `Your task "${params.task.title}" was updated to ${statusLabel}. This is an educational workflow notification.`;

  await fetch(`${supabaseUrl}/functions/v1/email-orchestrator/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: params.authHeader,
      apikey: anonKey,
    },
    body: JSON.stringify({
      tenant_id: params.tenantId,
      message_type: 'reminders',
      to: params.profileEmail,
      subject,
      html,
      text,
      template_key: 'task_status_updated',
      user_id: params.task.user_id,
      data: {
        task_id: params.task.task_id,
        task_title: params.task.title,
        status: params.task.status,
        signal: params.task.signal,
        actor_user_id: params.actorUserId,
        actor_name: params.actorName,
      },
    }),
  });
}

async function triggerWorkflowAdvanceOnTaskCompleteBestEffort(params: {
  authHeader: string;
  tenantId: string;
  task: TaskRow;
}) {
  const instanceId = String(params.task.workflow_instance_id || '').trim();
  const status = String(params.task.status || '').trim().toLowerCase();

  if (!instanceId || status !== 'completed') {
    return;
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!supabaseUrl || !anonKey || !params.authHeader) {
    return;
  }

  await fetch(`${supabaseUrl}/functions/v1/workflow-engine/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: params.authHeader,
      apikey: anonKey,
    },
    body: JSON.stringify({
      event_type: 'task.completed',
      payload: {
        instance_id: instanceId,
        task_id: params.task.task_id,
        tenant_id: params.tenantId,
        workflow_step_number: params.task.workflow_step_number,
      },
    }),
  });
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const tenant_id = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const payload: any = {};
    if (body.status) payload.status = body.status;
    if (body.signal) payload.signal = body.signal;
    if (!body.signal && body.status_signal) payload.signal = body.status_signal;

    if (Object.keys(payload).length === 0) {
      return json(400, { error: 'Provide status and/or signal' });
    }

    const { data, error } = await supabase
      .from('client_tasks')
      .update(payload)
      .eq('tenant_id', tenant_id)
      .eq('task_id', body.task_id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    const task = data as TaskRow;
    const authHeader = getAuthHeader(event.headers);

    // Best-effort transactional notification via email orchestrator.
    if (task?.user_id) {
      try {
        const authRes = await supabase.auth.getUser();
        const actorUserId = String(authRes.data.user?.id || '');
        const actorName = String(authRes.data.user?.user_metadata?.name || authRes.data.user?.email || 'System');

        const profileRes = await supabase
          .from('profiles')
          .select('email')
          .eq('user_id', task.user_id)
          .limit(1)
          .maybeSingle();

        const profileEmail = String((profileRes.data as any)?.email || '').trim().toLowerCase();
        await sendTaskUpdateEmailBestEffort({
          authHeader,
          tenantId: tenant_id,
          task,
          actorUserId,
          actorName,
          profileEmail,
        });
      } catch {
        // Non-fatal email path.
      }
    }

    // Workflow integration: completing a workflow-bound task triggers secure server-side advance validation.
    try {
      await triggerWorkflowAdvanceOnTaskCompleteBestEffort({
        authHeader,
        tenantId: tenant_id,
        task,
      });
    } catch {
      // Non-fatal workflow trigger path.
    }

    return json(200, { ok: true, tenant_id, task: data });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function json(statusCode: number, body: any) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
