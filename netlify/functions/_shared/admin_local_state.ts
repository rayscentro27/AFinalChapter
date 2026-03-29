export function asText(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

export function isMissingSchema(error: any) {
  const message = String(error?.message || '').toLowerCase();
  return (
    (message.includes('relation') && message.includes('does not exist'))
    || (message.includes('column') && message.includes('does not exist'))
    || (message.includes('could not find the table') && message.includes('schema cache'))
  );
}

export async function safeRows<T>(query: PromiseLike<{ data?: T[] | null; error?: any }>) {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { rows: [] as T[], missing: true, error: null };
    return { rows: [] as T[], missing: false, error };
  }
  return { rows: Array.isArray(data) ? data : ([] as T[]), missing: false, error: null };
}

export async function safeSingle<T>(query: PromiseLike<{ data?: T | null; error?: any }>) {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { row: null as T | null, missing: true, error: null };
    return { row: null as T | null, missing: false, error };
  }
  return { row: (data || null) as T | null, missing: false, error: null };
}

export function inferCommandType(command: string) {
  const normalized = asText(command).toLowerCase();
  if (normalized.includes('source')) return 'source_registry';
  if (normalized.includes('flag') || normalized.includes('mode') || normalized.includes('control')) return 'control_plane';
  if (normalized.includes('approve') || normalized.includes('review')) return 'approval';
  if (normalized.includes('simulation') || normalized.includes('readiness')) return 'readiness';
  return 'general';
}

export function inferCommandTarget(command: string) {
  const normalized = asText(command).toLowerCase();
  if (normalized.includes('source')) return 'Source Registry';
  if (normalized.includes('flag') || normalized.includes('mode') || normalized.includes('control')) return 'Control Plane';
  if (normalized.includes('simulation') || normalized.includes('readiness')) return 'Launch Readiness';
  return 'General Operations';
}

export function deriveCommandStatus(record: Record<string, unknown>) {
  const directStatus = asText(record.status || '').toLowerCase();
  if (directStatus) return directStatus;

  const validationStatus = asText(record.validation_status || 'pending');
  const approvalStatus = asText(record.approval_status || 'pending');
  const executionOutcome = asText(record.execution_outcome || 'pending');
  const queueHandoffState = asText(record.queue_handoff_state || 'not_queued');

  if (executionOutcome === 'failed' || queueHandoffState === 'failed') return 'failed';
  if (approvalStatus === 'rejected' || validationStatus === 'rejected') return 'rejected';
  if (executionOutcome === 'completed' || queueHandoffState === 'completed') return 'completed';
  if (queueHandoffState === 'running') return 'executing';
  if (queueHandoffState === 'queued') return 'queued';
  if (approvalStatus === 'approved') return 'approved';
  if (Boolean(record.requires_approval ?? record.approval_required ?? false)) return 'requires_approval';
  return 'pending';
}

export function commandResponseRow(record: Record<string, unknown>) {
  return {
    id: asText(record.id),
    tenant_id: asText(record.tenant_id) || null,
    raw_command: asText(record.command_text),
    command_type: asText(record.command_type || 'general'),
    status: deriveCommandStatus(record),
    risk_level: asText(record.risk_level || 'medium'),
    validation_status: asText(record.validation_status || 'pending'),
    queue_status: asText(record.queue_handoff_state || 'not_queued'),
    created_at: asText(record.created_at),
    updated_at: asText(record.updated_at),
    parsed_intent: (record.parsed_intent && typeof record.parsed_intent === 'object') ? record.parsed_intent : {},
    approval_required: Boolean(record.requires_approval ?? record.approval_required ?? true),
    approval_status: asText(record.approval_status || 'pending'),
    queue_handoff_state: asText(record.queue_handoff_state || 'not_queued'),
    execution_outcome: asText(record.execution_outcome || 'pending'),
    execution_summary: asText(record.result_summary || record.execution_summary),
    result_summary: asText(record.result_summary || record.execution_summary),
    error_message: asText(record.error_message) || null,
    approved_by: asText(record.approved_by) || null,
    approved_at: asText(record.approved_at) || null,
    executed_at: asText(record.executed_at) || null,
    completed_at: asText(record.completed_at) || null,
    related_source_id: asText(record.related_source_id) || null,
  };
}

export function sourceResponseRow(record: Record<string, unknown>, warnings: string[] = []) {
  return {
    id: asText(record.id),
    source_type: asText(record.source_type),
    url: asText(record.canonical_url),
    label: asText(record.label),
    domain: asText(record.domain),
    status: asText(record.status || 'unknown'),
    priority: Number(record.priority || 0),
    created_at: asText(record.created_at),
    warnings,
    active: Boolean(record.active ?? true),
    schedule_status: asText(record.schedule_status || 'scheduled'),
    last_run_at: asText(record.last_run_at),
    next_run_at: asText(record.next_run_at),
    last_run_status: asText(record.last_run_status || 'unknown'),
    paused: Boolean(record.paused ?? false),
    schedule_paused: Boolean(record.schedule_paused ?? false),
  };
}