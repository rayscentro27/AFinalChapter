import { createHash } from 'node:crypto';
import { supabaseAdmin } from '../supabase.js';

const METRICS = {
  cache_hit: 0,
  cache_miss: 0,
  cache_write: 0,
  cache_invalidate: 0,
  cache_error: 0,
};

const TTL_SECONDS = Object.freeze({
  research_summary: 24 * 60 * 60,
  transcript_summary: 24 * 60 * 60,
  structured_extraction: 6 * 60 * 60,
  opportunity_detection: 6 * 60 * 60,
  assistant_conversation: 15 * 60,
  default: 10 * 60,
});

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function isUniqueViolation(error) {
  const code = asText(error?.code);
  const msg = String(error?.message || '').toLowerCase();
  return code === '23505' || msg.includes('duplicate key value') || msg.includes('unique constraint');
}

function hashText(value) {
  return createHash('sha256').update(asText(value)).digest('hex');
}

function normalizePromptText(value) {
  return asText(value)
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeValue(value) {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = normalizeValue(value[key]);
        return acc;
      }, {});
  }
  if (typeof value === 'string') return normalizePromptText(value);
  return value;
}

export function ttlSecondsForTask(taskType) {
  const task = asText(taskType).toLowerCase();
  return TTL_SECONDS[task] || TTL_SECONDS.default;
}

export function normalizePromptForHash({ prompt, messages, input, context, taskType }) {
  const shape = normalizeValue({
    task_type: asText(taskType).toLowerCase() || 'assistant_conversation',
    prompt: normalizePromptText(prompt),
    messages: Array.isArray(messages) ? messages : [],
    input: asObject(input),
    context: asObject(context),
  });
  return JSON.stringify(shape);
}

export function buildRequestFingerprint({ tenantId, provider, model, taskType, promptHash, sourceVersion = 'v1' }) {
  const payload = JSON.stringify({
    tenant_id: asText(tenantId) || 'public',
    provider: asText(provider).toLowerCase(),
    model: asText(model).toLowerCase(),
    task_type: asText(taskType).toLowerCase(),
    prompt_hash: asText(promptHash),
    source_version: asText(sourceVersion) || 'v1',
  });
  return hashText(payload);
}

export function getAiCacheMetrics() {
  return { ...METRICS };
}

export async function getCachedResponse({
  provider,
  model,
  taskType,
  requestFingerprint,
  now = new Date(),
  logger = console,
} = {}) {
  const p = asText(provider).toLowerCase();
  const m = asText(model).toLowerCase();
  const t = asText(taskType).toLowerCase();
  const fp = asText(requestFingerprint);

  if (!p || !m || !t || !fp) {
    METRICS.cache_miss += 1;
    return { hit: false, reason: 'invalid_lookup_input' };
  }

  const nowIso = now.toISOString();
  const { data, error } = await supabaseAdmin
    .from('ai_cache')
    .select('id,cache_key,provider,model,task_type,prompt_hash,request_fingerprint,response_payload,token_usage,cost_estimate,hit_count,source_version,created_at,last_hit_at,expires_at,invalidated_at')
    .eq('provider', p)
    .eq('model', m)
    .eq('task_type', t)
    .eq('request_fingerprint', fp)
    .is('invalidated_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) {
      METRICS.cache_miss += 1;
      return { hit: false, reason: 'schema_missing' };
    }

    METRICS.cache_error += 1;
    logger.warn({ event: 'ai_cache_lookup_failed', error: String(error.message || error) }, 'ai_cache_lookup_failed');
    return { hit: false, reason: 'lookup_failed' };
  }

  if (!data) {
    METRICS.cache_miss += 1;
    return { hit: false, reason: 'not_found' };
  }

  if (data.expires_at && String(data.expires_at) <= nowIso) {
    METRICS.cache_miss += 1;
    return { hit: false, reason: 'expired', cache_key: data.cache_key };
  }

  const hitCount = Number(data.hit_count || 0) + 1;
  const { error: updateError } = await supabaseAdmin
    .from('ai_cache')
    .update({
      hit_count: hitCount,
      last_hit_at: nowIso,
    })
    .eq('id', data.id);

  if (updateError && !isMissingSchema(updateError)) {
    METRICS.cache_error += 1;
    logger.warn({ event: 'ai_cache_hit_update_failed', cache_key: data.cache_key, error: String(updateError.message || updateError) }, 'ai_cache_hit_update_failed');
  }

  METRICS.cache_hit += 1;
  return {
    hit: true,
    cache_key: data.cache_key,
    response_payload: asObject(data.response_payload),
    token_usage: asObject(data.token_usage),
    cost_estimate: Number(data.cost_estimate || 0),
    expires_at: data.expires_at || null,
  };
}

export async function storeCachedResponse({
  cacheKey,
  provider,
  model,
  taskType,
  promptHash,
  requestFingerprint,
  responsePayload,
  tokenUsage,
  costEstimate = 0,
  sourceVersion = 'v1',
  expiresAt,
  logger = console,
} = {}) {
  const nowIso = new Date().toISOString();
  const row = {
    cache_key: asText(cacheKey),
    provider: asText(provider).toLowerCase(),
    model: asText(model).toLowerCase(),
    task_type: asText(taskType).toLowerCase(),
    prompt_hash: asText(promptHash),
    request_fingerprint: asText(requestFingerprint),
    response_payload: asObject(responsePayload),
    token_usage: asObject(tokenUsage),
    cost_estimate: Number(costEstimate || 0),
    hit_count: 0,
    source_version: asText(sourceVersion) || 'v1',
    last_hit_at: nowIso,
    expires_at: expiresAt || null,
    invalidated_at: null,
  };

  if (!row.cache_key || !row.provider || !row.model || !row.task_type || !row.prompt_hash || !row.request_fingerprint) {
    return { ok: false, reason: 'invalid_store_input' };
  }

  const findActiveRow = async () => supabaseAdmin
    .from('ai_cache')
    .select('id,cache_key,created_at,expires_at')
    .eq('provider', row.provider)
    .eq('model', row.model)
    .eq('task_type', row.task_type)
    .eq('request_fingerprint', row.request_fingerprint)
    .is('invalidated_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const existing = await findActiveRow();
  if (existing.error) {
    if (isMissingSchema(existing.error)) return { ok: false, schemaMissing: true };
    METRICS.cache_error += 1;
    logger.warn({ event: 'ai_cache_lookup_before_write_failed', error: String(existing.error.message || existing.error) }, 'ai_cache_lookup_before_write_failed');
    return { ok: false, error: existing.error };
  }

  if (existing.data?.id) {
    const updatePayload = { ...row };
    delete updatePayload.hit_count;

    const { data, error } = await supabaseAdmin
      .from('ai_cache')
      .update(updatePayload)
      .eq('id', existing.data.id)
      .select('id,cache_key,created_at,expires_at')
      .maybeSingle();

    if (error) {
      if (isMissingSchema(error)) return { ok: false, schemaMissing: true };
      METRICS.cache_error += 1;
      logger.warn({ event: 'ai_cache_write_failed', error: String(error.message || error) }, 'ai_cache_write_failed');
      return { ok: false, error };
    }

    METRICS.cache_write += 1;
    return { ok: true, row: data || null };
  }

  const inserted = await supabaseAdmin
    .from('ai_cache')
    .insert(row)
    .select('id,cache_key,created_at,expires_at')
    .maybeSingle();

  if (inserted.error) {
    if (isMissingSchema(inserted.error)) return { ok: false, schemaMissing: true };

    if (isUniqueViolation(inserted.error)) {
      const raced = await findActiveRow();
      if (raced.error) {
        METRICS.cache_error += 1;
        logger.warn({ event: 'ai_cache_race_recovery_lookup_failed', error: String(raced.error.message || raced.error) }, 'ai_cache_race_recovery_lookup_failed');
        return { ok: false, error: raced.error };
      }

      if (raced.data?.id) {
        const updatePayload = { ...row };
        delete updatePayload.hit_count;

        const recovered = await supabaseAdmin
          .from('ai_cache')
          .update(updatePayload)
          .eq('id', raced.data.id)
          .select('id,cache_key,created_at,expires_at')
          .maybeSingle();

        if (recovered.error) {
          METRICS.cache_error += 1;
          logger.warn({ event: 'ai_cache_race_recovery_update_failed', error: String(recovered.error.message || recovered.error) }, 'ai_cache_race_recovery_update_failed');
          return { ok: false, error: recovered.error };
        }

        METRICS.cache_write += 1;
        return { ok: true, row: recovered.data || null };
      }
    }

    METRICS.cache_error += 1;
    logger.warn({ event: 'ai_cache_write_failed', error: String(inserted.error.message || inserted.error) }, 'ai_cache_write_failed');
    return { ok: false, error: inserted.error };
  }

  METRICS.cache_write += 1;
  return { ok: true, row: inserted.data || null };
}

export async function invalidateCache({ cacheKey, logger = console } = {}) {
  const key = asText(cacheKey);
  if (!key) return { ok: false, reason: 'missing_cache_key' };

  const { error } = await supabaseAdmin
    .from('ai_cache')
    .update({ invalidated_at: new Date().toISOString() })
    .eq('cache_key', key)
    .is('invalidated_at', null);

  if (error) {
    if (isMissingSchema(error)) return { ok: false, schemaMissing: true };
    METRICS.cache_error += 1;
    logger.warn({ event: 'ai_cache_invalidate_failed', cache_key: key, error: String(error.message || error) }, 'ai_cache_invalidate_failed');
    return { ok: false, error };
  }

  METRICS.cache_invalidate += 1;
  return { ok: true };
}

export function hashPrompt(normalizedPrompt) {
  return hashText(normalizedPrompt);
}
