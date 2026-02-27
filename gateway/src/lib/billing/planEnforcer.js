import { supabaseAdmin as defaultSupabaseAdmin } from '../../supabase.js';

const DEFAULT_LIMITS = {
  free: {
    messages_sent_per_month: 500,
    attachments_mb_per_month: 250,
    channels_max: 2,
  },
  pro: {
    messages_sent_per_month: 10000,
    attachments_mb_per_month: 2048,
    channels_max: 10,
  },
  agency: {
    messages_sent_per_month: 100000,
    attachments_mb_per_month: 10240,
    channels_max: 40,
  },
  enterprise: {
    messages_sent_per_month: 1000000,
    attachments_mb_per_month: 102400,
    channels_max: 250,
  },
};

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function monthStartIso(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function clampLimit(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const out = {};
  for (const [k, v] of Object.entries(input)) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) continue;
    out[k] = n;
  }
  return out;
}

export async function getPlan({ supabaseAdmin = defaultSupabaseAdmin, tenant_id }) {
  const tenantId = asText(tenant_id);
  if (!tenantId) throw new Error('missing_tenant_id');

  const { data, error } = await supabaseAdmin
    .from('tenant_plans')
    .select('tenant_id,plan_key,limits,created_at,updated_at')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error && !isMissingSchema(error)) {
    throw new Error(`tenant plan lookup failed: ${error.message}`);
  }

  const planKey = asText(data?.plan_key).toLowerCase() || 'pro';
  const base = DEFAULT_LIMITS[planKey] || DEFAULT_LIMITS.pro;
  const mergedLimits = {
    ...base,
    ...clampLimit(data?.limits || {}),
  };

  return {
    tenant_id: tenantId,
    plan_key: planKey,
    limits: mergedLimits,
    row_exists: Boolean(data?.tenant_id),
  };
}

async function usageMessagesSentMonth({ supabaseAdmin, tenantId }) {
  const since = monthStartIso();

  const { count, error } = await supabaseAdmin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('direction', 'out')
    .gte('received_at', since);

  if (error) {
    if (isMissingSchema(error)) return 0;
    throw new Error(`messages usage lookup failed: ${error.message}`);
  }

  return Number(count || 0);
}

async function usageAttachmentsMbMonth({ supabaseAdmin, tenantId }) {
  const since = monthStartIso();

  const { data, error } = await supabaseAdmin
    .from('attachments')
    .select('size_bytes,created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', since)
    .limit(200000);

  if (error) {
    if (isMissingSchema(error)) return 0;
    throw new Error(`attachments usage lookup failed: ${error.message}`);
  }

  let bytes = 0;
  for (const row of data || []) {
    bytes += Math.max(0, Number(row?.size_bytes || 0));
  }

  return bytes / (1024 * 1024);
}

async function usageActiveChannels({ supabaseAdmin, tenantId }) {
  const { count, error } = await supabaseAdmin
    .from('channel_accounts')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (error) {
    if (isMissingSchema(error)) return 0;
    throw new Error(`channel usage lookup failed: ${error.message}`);
  }

  return Number(count || 0);
}

export async function getUsageForMetric({ supabaseAdmin = defaultSupabaseAdmin, tenant_id, metric }) {
  const tenantId = asText(tenant_id);
  const m = asText(metric);
  if (!tenantId || !m) throw new Error('invalid_usage_metric_request');

  if (m === 'messages_sent_per_month') {
    return usageMessagesSentMonth({ supabaseAdmin, tenantId });
  }
  if (m === 'attachments_mb_per_month') {
    return usageAttachmentsMbMonth({ supabaseAdmin, tenantId });
  }
  if (m === 'channels_max') {
    return usageActiveChannels({ supabaseAdmin, tenantId });
  }

  throw new Error(`unsupported_metric:${m}`);
}

export async function checkLimit({
  supabaseAdmin = defaultSupabaseAdmin,
  tenant_id,
  metric,
  projected_increment = 1,
}) {
  const tenantId = asText(tenant_id);
  const metricName = asText(metric);
  if (!tenantId || !metricName) throw new Error('invalid_limit_request');

  const plan = await getPlan({ supabaseAdmin, tenant_id: tenantId });
  const limit = asNumber(plan?.limits?.[metricName], 0);
  const used = await getUsageForMetric({ supabaseAdmin, tenant_id: tenantId, metric: metricName });
  const projected = used + Math.max(0, asNumber(projected_increment, 0));

  const allowed = limit <= 0 ? false : projected <= limit;
  const remaining = Math.max(0, limit - used);
  const usageRatio = limit > 0 ? used / limit : 1;

  return {
    tenant_id: tenantId,
    plan_key: plan.plan_key,
    metric: metricName,
    used,
    limit,
    projected,
    remaining,
    allowed,
    warning: usageRatio >= 0.8 && usageRatio < 1,
    warning_message: usageRatio >= 0.8 && usageRatio < 1
      ? `${metricName} is at ${(usageRatio * 100).toFixed(1)}% of plan limit`
      : null,
  };
}
