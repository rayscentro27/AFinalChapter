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
    'META_APP_SECRET',
    'META_VERIFY_TOKEN',
    'META_PAGE_ACCESS_TOKEN',
  ],
};

const RECOMMENDED = {
  ai_integrations: [
    'GEMINI_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
    'TRADINGVIEW_WEBHOOK_SECRET',
  ],
  system_mode: [
    'SYSTEM_MODE',
    'QUEUE_ENABLED',
    'AI_JOBS_ENABLED',
    'RESEARCH_JOBS_ENABLED',
    'NOTIFICATIONS_ENABLED',
  ],
  control_plane: [
    'CONTROL_PLANE_WRITE_ENABLED',
  ],
  queue_runtime: [
    'JOB_MAX_RUNTIME_SECONDS',
    'WORKER_MAX_CONCURRENCY',
    'TENANT_JOB_LIMIT_ACTIVE',
    'WORKER_HEARTBEAT_SECONDS',
  ],
  observability: [
    'LOG_LEVEL',
  ],
  network_proxy: [
    'TRUST_PROXY',
    'TRUST_PROXY_CIDRS',
    'TRUST_PROXY_ALLOW_ALL',
  ],
};

const VALID_SYSTEM_MODES = new Set(['development', 'research', 'production', 'maintenance', 'degraded', 'emergency_stop']);

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

function shouldEnforceProductionRules(env, mode) {
  const nodeEnv = asText(env.NODE_ENV).toLowerCase();
  return mode === 'production' || nodeEnv === 'production';
}

function parseCidrs(value) {
  const text = asText(value);
  if (!text) return [];
  return text.split(',').map((part) => part.trim()).filter(Boolean);
}

function evaluateProxyTrustPosture(env) {
  const nodeEnv = asText(env.NODE_ENV).toLowerCase();
  const trustProxy = asBool(env.TRUST_PROXY, nodeEnv !== 'production');
  const trustProxyAllowAll = asBool(env.TRUST_PROXY_ALLOW_ALL, false);
  const trustProxyCidrs = parseCidrs(env.TRUST_PROXY_CIDRS);

  if (!trustProxy) {
    return {
      ok: true,
      trust_proxy: false,
      allow_all: false,
      cidrs: trustProxyCidrs,
      reason: 'disabled',
    };
  }

  const ok = trustProxyAllowAll || trustProxyCidrs.length > 0;
  return {
    ok,
    trust_proxy: true,
    allow_all: trustProxyAllowAll,
    cidrs: trustProxyCidrs,
    reason: ok ? 'configured' : 'missing_cidrs_or_allow_all',
  };
}

export function validateGatewayEnv({ env = process.env, strict = false, logger = console } = {}) {
  const missingRequired = collectMissing(env, REQUIRED);
  const missingRecommended = collectMissing(env, RECOMMENDED);

  const mode = asText(env.SYSTEM_MODE || 'development').toLowerCase() || 'development';
  const modeIsValid = VALID_SYSTEM_MODES.has(mode);
  const productionRules = shouldEnforceProductionRules(env, mode);

  const proxyTrust = evaluateProxyTrustPosture(env);

  const summary = {
    ok: missingRequired.length === 0 && modeIsValid && proxyTrust.ok,
    mode,
    mode_valid: modeIsValid,
    valid_modes: Array.from(VALID_SYSTEM_MODES),
    missing_required: missingRequired,
    missing_recommended: missingRecommended,
    proxy_trust: {
      ok: proxyTrust.ok,
      trust_proxy: proxyTrust.trust_proxy,
      allow_all: proxyTrust.allow_all,
      cidrs: proxyTrust.cidrs,
      reason: proxyTrust.reason,
    },
    flags: {
      queue_enabled: asBool(env.QUEUE_ENABLED, false),
      ai_jobs_enabled: asBool(env.AI_JOBS_ENABLED, true),
      research_jobs_enabled: asBool(env.RESEARCH_JOBS_ENABLED, true),
      notifications_enabled: asBool(env.NOTIFICATIONS_ENABLED, true),
      control_plane_write_enabled: asBool(env.CONTROL_PLANE_WRITE_ENABLED, false),
    },
  };

  if (missingRecommended.length > 0) {
    logger.warn({ missing_recommended: missingRecommended }, 'gateway_env_recommended_missing');
  }

  if (productionRules && !strict) {
    logger.warn({ mode, node_env: asText(env.NODE_ENV) || 'development' }, 'gateway_env_strict_disabled_in_production');
  }

  if (missingRequired.length > 0) {
    logger.error({ missing_required: missingRequired }, 'gateway_env_required_missing');
    if (strict) {
      const names = Array.from(new Set(missingRequired.map((x) => x.key)));
      throw new Error(`Missing required environment variables: ${names.join(', ')}`);
    }
  }

  if (!modeIsValid) {
    logger.error({ system_mode: mode, valid_modes: Array.from(VALID_SYSTEM_MODES) }, 'gateway_env_invalid_system_mode');
    if (strict) {
      throw new Error(`Invalid SYSTEM_MODE: ${mode}`);
    }
  }

  if (!proxyTrust.ok) {
    logger.error({
      trust_proxy: proxyTrust.trust_proxy,
      trust_proxy_allow_all: proxyTrust.allow_all,
      trust_proxy_cidrs: proxyTrust.cidrs,
    }, 'gateway_env_invalid_trust_proxy_configuration');

    if (strict) {
      throw new Error('Invalid trust proxy configuration: set TRUST_PROXY_CIDRS or TRUST_PROXY_ALLOW_ALL=true when TRUST_PROXY=true');
    }
  }

  if (proxyTrust.allow_all && productionRules) {
    logger.warn({ mode }, 'gateway_env_trust_proxy_allow_all_enabled');
  }

  return summary;
}
