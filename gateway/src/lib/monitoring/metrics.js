import { supabaseAdmin } from '../../supabase.js';
import { redactSecrets, redactText } from '../../util/redact.js';

const MAX_TEXT = 500;

function safeTenantId(value) {
  const text = String(value || '').trim();
  return text || null;
}

function clampText(value) {
  return redactText(String(value || '')).slice(0, MAX_TEXT);
}

export function sanitizeDetails(details) {
  return redactSecrets(details || {});
}

export async function recordMetric({ tenant_id = null, metric, value_num, tags = null }) {
  const tenantId = safeTenantId(tenant_id);
  const metricName = String(metric || '').trim();
  const valueNum = Number(value_num);

  if (!metricName || !Number.isFinite(valueNum)) {
    throw new Error('invalid_metric_payload');
  }

  const { error } = await supabaseAdmin
    .from('service_metrics')
    .insert({
      tenant_id: tenantId,
      metric: metricName,
      value_num: valueNum,
      tags: sanitizeDetails(tags),
      occurred_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`service_metrics insert failed: ${error.message}`);
  }
}

export async function getActiveChannels({ tenant_id }) {
  const tenantId = safeTenantId(tenant_id);
  if (!tenantId) throw new Error('missing_tenant_id');

  const { data, error } = await supabaseAdmin
    .from('notification_channels')
    .select('id,tenant_id,kind,destination,is_active,created_at')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`notification_channels query failed: ${error.message}`);
  return data || [];
}

async function latestOpenAlert({ tenantId, alertKey }) {
  const { data, error } = await supabaseAdmin
    .from('alert_events')
    .select('id,tenant_id,alert_key,severity,message,details,status,opened_at,resolved_at')
    .eq('tenant_id', tenantId)
    .eq('alert_key', alertKey)
    .in('status', ['open', 'ack'])
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`alert_events open lookup failed: ${error.message}`);
  return data || null;
}

export async function openAlert({ tenant_id, alert_key, severity, message, details = null, debounceMinutes = 10 }) {
  const tenantId = safeTenantId(tenant_id);
  const alertKey = String(alert_key || '').trim();
  const level = String(severity || 'warn').trim().toLowerCase();
  const msg = clampText(message);

  if (!tenantId || !alertKey || !msg) throw new Error('invalid_open_alert_payload');

  const existingOpen = await latestOpenAlert({ tenantId, alertKey });
  if (existingOpen) return { action: 'already_open', alert: existingOpen };

  const sinceIso = new Date(Date.now() - Math.max(0, Number(debounceMinutes || 10)) * 60_000).toISOString();
  const { data: recentResolved, error: resolvedError } = await supabaseAdmin
    .from('alert_events')
    .select('id,resolved_at')
    .eq('tenant_id', tenantId)
    .eq('alert_key', alertKey)
    .eq('status', 'resolved')
    .gte('resolved_at', sinceIso)
    .order('resolved_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (resolvedError) throw new Error(`alert_events debounce lookup failed: ${resolvedError.message}`);
  if (recentResolved?.id) return { action: 'debounced', alert: recentResolved };

  const { data, error } = await supabaseAdmin
    .from('alert_events')
    .insert({
      tenant_id: tenantId,
      alert_key: alertKey,
      severity: level,
      message: msg,
      details: sanitizeDetails(details),
      status: 'open',
      opened_at: new Date().toISOString(),
      resolved_at: null,
    })
    .select('id,tenant_id,alert_key,severity,message,details,status,opened_at,resolved_at')
    .single();

  if (error) throw new Error(`alert_events open insert failed: ${error.message}`);
  return { action: 'opened', alert: data };
}

export async function resolveAlert({ tenant_id, alert_key, message = '', details = null }) {
  const tenantId = safeTenantId(tenant_id);
  const alertKey = String(alert_key || '').trim();

  if (!tenantId || !alertKey) throw new Error('invalid_resolve_alert_payload');

  const existingOpen = await latestOpenAlert({ tenantId, alertKey });
  if (!existingOpen) return { action: 'noop', alert: null };

  const patch = {
    status: 'resolved',
    resolved_at: new Date().toISOString(),
  };

  const safeMessage = clampText(message);
  if (safeMessage) patch.message = safeMessage;
  if (details) patch.details = sanitizeDetails(details);

  const { data, error } = await supabaseAdmin
    .from('alert_events')
    .update(patch)
    .eq('id', existingOpen.id)
    .select('id,tenant_id,alert_key,severity,message,details,status,opened_at,resolved_at')
    .single();

  if (error) throw new Error(`alert_events resolve failed: ${error.message}`);
  return { action: 'resolved', alert: data };
}
