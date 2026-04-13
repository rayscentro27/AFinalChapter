import 'dotenv/config';

const VALID_SYSTEM_MODES = new Set(['development', 'research', 'production', 'maintenance', 'degraded', 'emergency_stop']);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function asText(value) {
  return String(value || '').trim();
}

function asBool(value, fallback = false) {
  const text = asText(value).toLowerCase();
  if (!text) return fallback;
  if (text === 'true' || text === '1' || text === 'yes' || text === 'on') return true;
  if (text === 'false' || text === '0' || text === 'no' || text === 'off') return false;
  return fallback;
}

function asCsv(value) {
  const text = asText(value);
  if (!text) return [];
  return text.split(',').map((item) => item.trim()).filter(Boolean);
}

function systemMode(value) {
  const mode = asText(value || 'development').toLowerCase();
  if (VALID_SYSTEM_MODES.has(mode)) return mode;
  return 'development';
}

const nodeEnv = asText(process.env.NODE_ENV) || 'development';
const defaultTrustProxy = nodeEnv !== 'production';
const defaultStrictValidation = nodeEnv === 'production';

export const ENV = {
  NODE_ENV: nodeEnv,
  PORT: Number(process.env.PORT || 3000),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  TRUST_PROXY: asBool(process.env.TRUST_PROXY, defaultTrustProxy),
  TRUST_PROXY_CIDRS: asCsv(process.env.TRUST_PROXY_CIDRS),
  TRUST_PROXY_ALLOW_ALL: asBool(process.env.TRUST_PROXY_ALLOW_ALL, false),
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'https://app.goclearonline.cc',

  INTERNAL_API_KEY: required('INTERNAL_API_KEY'),

  ORACLE_CRON_TOKEN: process.env.ORACLE_CRON_TOKEN || '',
  ORACLE_TENANT_IDS: process.env.ORACLE_TENANT_IDS || '',

  ALERTS_NOTIFY_ON_RESOLVE: asBool(process.env.ALERTS_NOTIFY_ON_RESOLVE, true),
  ALERT_NOTIFICATION_COOLDOWN_MINUTES: Number(process.env.ALERT_NOTIFICATION_COOLDOWN_MINUTES || 30),
  ALERT_OUTBOX_FAILED_THRESHOLD: Number(process.env.ALERT_OUTBOX_FAILED_THRESHOLD || 10),
  ALERT_OUTBOX_OLDEST_DUE_MINUTES_THRESHOLD: Number(process.env.ALERT_OUTBOX_OLDEST_DUE_MINUTES_THRESHOLD || 15),
  ALERT_WEBHOOK_FAILED_24H_THRESHOLD: Number(process.env.ALERT_WEBHOOK_FAILED_24H_THRESHOLD || 10),
  ALERT_DELIVERY_FAILED_THRESHOLD: Number(process.env.ALERT_DELIVERY_FAILED_THRESHOLD || 10),
  ALERT_CHANNELS_DOWN_THRESHOLD: Number(process.env.ALERT_CHANNELS_DOWN_THRESHOLD || 1),

  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET || '',

  GOOGLE_SERVICE_ACCOUNT_KEYFILE: process.env.GOOGLE_SERVICE_ACCOUNT_KEYFILE || '/opt/nexus-api/secrets/google-service-account.json',
  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI || 'https://api.goclearonline.cc/api/google/oauth/callback',
  GOOGLE_OAUTH_TOKEN_FILE: process.env.GOOGLE_OAUTH_TOKEN_FILE || '/opt/nexus-api/secrets/google-oauth-tokens.json',
  GOOGLE_OAUTH_STATE_FILE: process.env.GOOGLE_OAUTH_STATE_FILE || '/opt/nexus-api/secrets/google-oauth-state.json',

  TRADINGVIEW_WEBHOOK_SECRET: process.env.TRADINGVIEW_WEBHOOK_SECRET || '',

  OANDA_API_KEY: process.env.OANDA_API_KEY || '',
  OANDA_ACCOUNT_ID: process.env.OANDA_ACCOUNT_ID || '',
  OANDA_URL: process.env.OANDA_URL || 'https://api-fxpractice.oanda.com',

  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || '',


  META_APP_SECRET: required('META_APP_SECRET'),
  META_VERIFY_TOKEN: required('META_VERIFY_TOKEN'),


  META_PAGE_ACCESS_TOKEN: required('META_PAGE_ACCESS_TOKEN'),
  META_GRAPH_VERSION: process.env.META_GRAPH_VERSION || 'v19.0',

  MATRIX_WEBHOOK_TOKEN: process.env.MATRIX_WEBHOOK_TOKEN || '',

  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  NVIDIA_NIM_API_KEY: process.env.NVIDIA_NIM_API_KEY || '',
  ENABLE_NIM_DEV: asBool(process.env.ENABLE_NIM_DEV, false),

  AI_PROVIDER: process.env.AI_PROVIDER || 'heuristic',
  AI_API_KEY: process.env.AI_API_KEY || '',
  AI_OPENAI_MODEL: process.env.AI_OPENAI_MODEL || 'gpt-4.1-mini',
  AI_GEMINI_MODEL: process.env.AI_GEMINI_MODEL || 'gemini-1.5-flash',
  AI_MASK_PII: asBool(process.env.AI_MASK_PII, true),
  SAFE_MODE: asBool(process.env.SAFE_MODE, false),
  AI_MAX_INPUT_CHARS: Number(process.env.AI_MAX_INPUT_CHARS || 12000),
  AI_MAX_PROVIDER_RETRIES: Number(process.env.AI_MAX_PROVIDER_RETRIES || 2),
  OPENROUTER_ALLOWED_TASKS: asCsv(process.env.OPENROUTER_ALLOWED_TASKS),
  OPENROUTER_DENIED_TASKS: asCsv(process.env.OPENROUTER_DENIED_TASKS),

  SYSTEM_MODE: systemMode(process.env.SYSTEM_MODE),
  QUEUE_ENABLED: asBool(process.env.QUEUE_ENABLED, false),
  AI_JOBS_ENABLED: asBool(process.env.AI_JOBS_ENABLED, true),
  RESEARCH_JOBS_ENABLED: asBool(process.env.RESEARCH_JOBS_ENABLED, true),
  NOTIFICATIONS_ENABLED: asBool(process.env.NOTIFICATIONS_ENABLED, true),
  CONTROL_PLANE_WRITE_ENABLED: asBool(process.env.CONTROL_PLANE_WRITE_ENABLED, false),
  JOB_MAX_RUNTIME_SECONDS: Number(process.env.JOB_MAX_RUNTIME_SECONDS || 300),
  WORKER_MAX_CONCURRENCY: Number(process.env.WORKER_MAX_CONCURRENCY || 4),
  TENANT_JOB_LIMIT_ACTIVE: Number(process.env.TENANT_JOB_LIMIT_ACTIVE || 20),
  WORKER_HEARTBEAT_SECONDS: Number(process.env.WORKER_HEARTBEAT_SECONDS || 60),

  ENV_VALIDATE_STRICT: asBool(process.env.ENV_VALIDATE_STRICT, defaultStrictValidation),
};
