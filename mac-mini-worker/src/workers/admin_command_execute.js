import { supabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('admin_command_execute');

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function buildSafeExecutionResult(command, job, workerId) {
  const commandType = asText(command.command_type || 'general');
  const targetLabel = asText(command.parsed_intent?.target_label || commandType || 'General Operations');
  const summary = `Safe execution completed for ${targetLabel}. No direct side effects were performed outside the control-plane contract.`;

  return {
    ok: true,
    command_id: asText(command.id),
    job_id: asText(job.id),
    worker_id: asText(workerId),
    execution_mode: 'safe_noop',
    command_type: commandType,
    target_label: targetLabel,
    summary,
    completed_at: new Date().toISOString(),
  };
}

async function loadCommand(commandId) {
  const { data, error } = await supabaseAdmin
    .from('admin_commands')
    .select('*')
    .eq('id', commandId)
    .single();

  if (error) throw new Error(`admin_commands lookup failed: ${error.message}`);
  return data || null;
}

async function updateCommand(commandId, patch) {
  const { data, error } = await supabaseAdmin
    .from('admin_commands')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', commandId)
    .select('*')
    .single();

  if (error) throw new Error(`admin_commands update failed: ${error.message}`);
  return data || {};
}

export async function handleAdminCommandExecute(job, context = {}) {
  const payload = asObject(job?.payload);
  const commandId = asText(payload.command_id);
  if (!commandId) {
    throw new Error('missing_command_id');
  }

  const workerId = asText(context.worker_id || context.workerId || 'mac-mini-worker');
  const command = await loadCommand(commandId);
  if (!command) {
    throw new Error('command_not_found');
  }

  try {
    const executing = await updateCommand(commandId, {
      status: 'executing',
      executed_at: new Date().toISOString(),
      result_summary: 'Command execution started on worker.',
      error_message: null,
      metadata: {
        ...asObject(command.metadata),
        queue_job_id: asText(job.id),
        last_worker_id: workerId,
        execution_mode: 'safe_noop',
      },
    });

    const result = buildSafeExecutionResult(executing, job, workerId);

    await updateCommand(commandId, {
      status: 'completed',
      completed_at: result.completed_at,
      result_summary: result.summary,
      error_message: null,
      metadata: {
        ...asObject(executing.metadata),
        execution_result: result,
      },
    });

    logger.info({ command_id: commandId, job_id: job.id, worker_id: workerId }, 'admin_command_execute_completed');
    return result;
  } catch (error) {
    const errorMessage = asText(error?.message || error || 'admin_command_execute_failed');
    await updateCommand(commandId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      result_summary: 'Command execution failed on worker.',
      error_message: errorMessage,
      metadata: {
        ...asObject(command.metadata),
        queue_job_id: asText(job.id),
        last_worker_id: workerId,
        execution_mode: 'safe_noop',
      },
    }).catch(() => {});

    logger.error({ command_id: commandId, job_id: job.id, error: errorMessage }, 'admin_command_execute_failed');
    return {
      ok: false,
      command_id: commandId,
      job_id: asText(job.id),
      worker_id: workerId,
      execution_mode: 'safe_noop',
      summary: 'Command execution failed on worker.',
      error: errorMessage,
      completed_at: new Date().toISOString(),
    };
  }
}

export default handleAdminCommandExecute;