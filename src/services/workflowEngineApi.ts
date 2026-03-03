import { supabase } from '../../lib/supabaseClient';

export type WorkflowStartResponse = {
  success: boolean;
  instance?: any;
  current_step?: any;
  task_id?: string;
  error?: string;
};

export async function workflowStart(templateKey: string, context: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('workflow-engine', {
    body: {
      action: 'start',
      template_key: templateKey,
      context,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to start workflow.');
  }

  const payload = (data || {}) as WorkflowStartResponse;
  if (!payload.success) {
    throw new Error(payload.error || 'Workflow start failed.');
  }

  return payload;
}

export async function workflowAdvance(instanceId: string, force = false) {
  const { data, error } = await supabase.functions.invoke('workflow-engine', {
    body: {
      action: 'advance',
      instance_id: instanceId,
      force,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to advance workflow.');
  }

  const payload = (data || {}) as Record<string, any>;
  if (!payload.success) {
    throw new Error(String(payload.error || 'Workflow advance failed.'));
  }

  return payload;
}

export async function workflowTrigger(eventType: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('workflow-engine', {
    body: {
      action: 'trigger',
      event_type: eventType,
      payload,
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to trigger workflow event.');
  }

  const result = (data || {}) as Record<string, any>;
  if (!result.success) {
    throw new Error(String(result.error || 'Workflow trigger failed.'));
  }

  return result;
}
