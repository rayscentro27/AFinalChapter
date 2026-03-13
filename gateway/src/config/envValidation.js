function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asBool(value, fallback = false) {
  const text = asText(value).toLowerCase();
  if (!text) return fallback;
  if (text === 'true' || text === '1' || text === 'yes') return true;
  if (text === 'false' || text === '0' || text === 'no') return false;
  return fallback;
}

const REQUIRED = {
  gateway_core: [
    'INTERNAL_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ALLOWED_ORIGINS',
  ],
  channel_integrations: [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_FROM_NUMBER',
    'META_APP_SECRET',
    'META_VERIFY_TOKEN',
    'WHATSAPP_VERIFY_TOKEN',
    'WHATSAPP_TOKEN',
    'META_PAGE_ACCESS_TOKEN',
  ],
};

const RECOMMENDED = {
  system_mode: [
    'SYSTEM_MODE',
    'QUEUE_ENABLED',
    'AI_JOBS_ENABLED',
    'RESEARCH_JOBS_ENABLED',
    'NOTIFICATIONS_ENABLED',
  ],
  queue_runtime: [
    'JOB_MAX_RUNTIME_SECONDS',
    'WORKER_MAX_CONCURRENCY',
    'TENANT_JOB_LIMIT_ACTIVE',
    'WORKER_HEARTBEAT_SECONDS',
  ],
  observability: [
    'ALERTS_WEBHOOK_URL',
    'LOG_LEVEL',
  ],
};

function collectMissing(env, groups) {
  const missing = [];
  for (const [group, keys] of Object.entries(groups)) {
    for (const key of keys) {
      if (!asText(env[key])) {
        missing.push({ group, key });
      }
    }
  }
  return missing;
}

export function validateGatewayEnv({ env = process.env, strict = false, logger = console } = {}) {
  const missingRequired = collectMissing(env, REQUIRED);
  const missingRecommended = collectMissing(env, RECOMMENDED);

  const mode = asText(env.SYSTEM_MODE || 'development').toLowerCase() || 'development';
  const summary = {
    ok: missingRequired.length === 0,
    mode,
    missing_required: missingRequired,
    missing_recommended: missingRecommended,
    flags: {
      queue_enabled: asBool(env.QUEUE_ENABLED, false),
      ai_jobs_enabled: asBool(env.AI_JOBS_ENABLED, true),
      research_jobs_enabled: asBool(env.RESEARCH_JOBS_ENABLED, true),
      notifications_enabled: asBool(env.NOTIFICATIONS_ENABLED, true),
    },
  };

  if (missingRecommended.length > 0) {
    logger.warn({ missing_recommended: missingRecommended }, 'gateway_env_recommended_missing');
  }

  if (missingRequired.length > 0) {
    logger.error({ missing_required: missingRequired }, 'gateway_env_required_missing');
    if (strict) {
      throw new Error(`Missing required environment variables: ${missingRequired.map((x) => x.key).join(', ')}`);
    }
  }

  return summary;
}
