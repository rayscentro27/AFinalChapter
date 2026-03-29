import { supabaseAdmin } from '../supabase.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function severityFromType(errorType) {
  const t = asText(errorType).toLowerCase();
  if (t.includes('critical') || t.includes('crash')) return 'critical';
  if (t.includes('warn') || t.includes('retry')) return 'warn';
  return 'error';
}

function buildEnhancedPayload({ service, component, errorType, errorMessage, errorStack, metadata }) {
  return {
    service: asText(service) || 'gateway',
    component: asText(component) || 'unknown_component',
    error_type: asText(errorType) || 'runtime_error',
    error_message: asText(errorMessage) || 'unknown_error',
    error_stack: asText(errorStack) || null,
    metadata: (metadata && typeof metadata === 'object') ? metadata : {},
  };
}

function buildLegacyPayload({ service, component, errorType, errorMessage, errorStack, metadata, workerId, tenantId }) {
  return {
    source: `${asText(service) || 'gateway'}:${asText(component) || 'unknown_component'}`,
    worker_id: asText(workerId) || null,
    tenant_id: asText(tenantId) || null,
    severity: severityFromType(errorType),
    error_code: asText(errorType) || 'runtime_error',
    message: asText(errorMessage) || 'unknown_error',
    details: {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      service: asText(service) || 'gateway',
      component: asText(component) || 'unknown_component',
      error_type: asText(errorType) || 'runtime_error',
      error_stack: asText(errorStack) || null,
    },
  };
}

async function insertEnhanced(payload) {
  return supabaseAdmin
    .from('system_errors')
    .insert(payload)
    .select('id,created_at')
    .maybeSingle();
}

async function insertLegacy(payload) {
  return supabaseAdmin
    .from('system_errors')
    .insert(payload)
    .select('id,created_at')
    .maybeSingle();
}

export async function logSystemError({
  service = 'gateway',
  component = 'unknown_component',
  errorType = 'runtime_error',
  errorMessage = 'unknown_error',
  errorStack = null,
  metadata = {},
  workerId = null,
  tenantId = null,
  logger = console,
} = {}) {
  const enhancedPayload = buildEnhancedPayload({
    service,
    component,
    errorType,
    errorMessage,
    errorStack,
    metadata,
  });

  const enhanced = await insertEnhanced(enhancedPayload);
  if (!enhanced.error) {
    return { ok: true, row: enhanced.data || null, schema: 'enhanced' };
  }

  if (isMissingSchema(enhanced.error)) {
    return { ok: false, schemaMissing: true, error: null };
  }

  const legacyPayload = buildLegacyPayload({
    service,
    component,
    errorType,
    errorMessage,
    errorStack,
    metadata,
    workerId,
    tenantId,
  });

  const legacy = await insertLegacy(legacyPayload);
  if (!legacy.error) {
    return { ok: true, row: legacy.data || null, schema: 'legacy' };
  }

  if (isMissingSchema(legacy.error)) {
    return { ok: false, schemaMissing: true, error: null };
  }

  logger.error({
    event: 'system_error_insert_failed',
    component: asText(component),
    error_type: asText(errorType),
    db_error: String(legacy.error.message || enhanced.error.message || 'insert_failed'),
  }, 'system_error_insert_failed');

  return {
    ok: false,
    schemaMissing: false,
    error: legacy.error,
  };
}
