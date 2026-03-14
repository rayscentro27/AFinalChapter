import 'dotenv/config';

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
  if (text === 'true' || text === '1' || text === 'yes') return true;
  if (text === 'false' || text === '0' || text === 'no') return false;
  return fallback;
}

function asCsv(value) {
  const text = asText(value);
  if (!text) return [];
  return text.split(',').map((item) => item.trim()).filter(Boolean);
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

  ALERTS_WEBHOOK_URL: process.env.ALERTS_WEBHOOK_URL || '',
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

  TWILIO_ACCOUNT_SID: required('TWILIO_ACCOUNT_SID'),
  TWILIO_AUTH_TOKEN: required('TWILIO_AUTH_TOKEN'),
  TWILIO_FROM_NUMBER: required('TWILIO_FROM_NUMBER'),

  META_APP_SECRET: required('META_APP_SECRET'),
  META_VERIFY_TOKEN: required('META_VERIFY_TOKEN'),
  WHATSAPP_VERIFY_TOKEN: required('WHATSAPP_VERIFY_TOKEN'),

  WHATSAPP_TOKEN: required('WHATSAPP_TOKEN'),
  WHATSAPP_GRAPH_VERSION: process.env.WHATSAPP_GRAPH_VERSION || 'v19.0',
  WHATSAPP_WEBHOOK_SECRET: process.env.WHATSAPP_WEBHOOK_SECRET || '',

  META_PAGE_ACCESS_TOKEN: required('META_PAGE_ACCESS_TOKEN'),
  META_GRAPH_VERSION: process.env.META_GRAPH_VERSION || 'v19.0',

  MATRIX_WEBHOOK_TOKEN: process.env.MATRIX_WEBHOOK_TOKEN || '',

  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  NVIDIA_NIM_API_KEY: process.env.NVIDIA_NIM_API_KEY || '',
  ENABLE_NIM_DEV: asBool(process.env.ENABLE_NIM_DEV, false),

  AI_PROVIDER: process.env.AI_PROVIDER || 'heuristic',
  AI_API_KEY: process.env.AI_API_KEY || '',
  AI_MASK_PII: asBool(process.env.AI_MASK_PII, true),
  SAFE_MODE: asBool(process.env.SAFE_MODE, false),

  SYSTEM_MODE: process.env.SYSTEM_MODE || 'development',
  QUEUE_ENABLED: asBool(process.env.QUEUE_ENABLED, false),
  AI_JOBS_ENABLED: asBool(process.env.AI_JOBS_ENABLED, true),
  RESEARCH_JOBS_ENABLED: asBool(process.env.RESEARCH_JOBS_ENABLED, true),
  NOTIFICATIONS_ENABLED: asBool(process.env.NOTIFICATIONS_ENABLED, true),
  JOB_MAX_RUNTIME_SECONDS: Number(process.env.JOB_MAX_RUNTIME_SECONDS || 300),
  WORKER_MAX_CONCURRENCY: Number(process.env.WORKER_MAX_CONCURRENCY || 4),
  TENANT_JOB_LIMIT_ACTIVE: Number(process.env.TENANT_JOB_LIMIT_ACTIVE || 20),
  WORKER_HEARTBEAT_SECONDS: Number(process.env.WORKER_HEARTBEAT_SECONDS || 60),

  ENV_VALIDATE_STRICT: asBool(process.env.ENV_VALIDATE_STRICT, defaultStrictValidation),
};
