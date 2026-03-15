const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: process.env.ENV_FILE || path.join(process.cwd(), '.env') });

function asText(value) {
  return String(value || '').trim();
}

function required(name) {
  const value = asText(process.env[name]);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function asBool(value, fallback = false) {
  const text = asText(value).toLowerCase();
  if (!text) return fallback;
  return text === '1' || text === 'true' || text === 'yes' || text === 'on';
}

function asInt(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function asList(value, fallback = []) {
  const text = asText(value);
  if (!text) return fallback;
  return text.split(',').map((part) => asText(part).toLowerCase()).filter(Boolean);
}

const config = {
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),

  enabled: asBool(process.env.WATCHDOG_ENABLED, true),
  pollSeconds: asInt(process.env.WATCHDOG_POLL_SECONDS, 15, 5, 300),
  batchLimit: asInt(process.env.WATCHDOG_BATCH_LIMIT, 100, 1, 1000),
  workerTypes: asList(process.env.WATCHDOG_WORKER_TYPES, ['openclaw_worker', 'comet_worker']),

  noProgressSeconds: asInt(process.env.WATCHDOG_NO_PROGRESS_SECONDS, 600, 60, 86400),
  maxJobMinutes: asInt(process.env.WATCHDOG_MAX_JOB_MINUTES, 20, 1, 1440),
  pageSignatureRepeatThreshold: asInt(process.env.WATCHDOG_PAGE_SIGNATURE_REPEAT_THRESHOLD, 5, 2, 100),
  heartbeatStaleSeconds: asInt(process.env.WATCHDOG_HEARTBEAT_STALE_SECONDS, 90, 15, 3600),

  quarantineEnabled: asBool(process.env.WATCHDOG_QUARANTINE_ENABLED, true),
  autoRecoveryEnabled: asBool(process.env.WATCHDOG_AUTO_RECOVERY_ENABLED, false),
  requireManualRelease: asBool(process.env.WATCHDOG_REQUIRE_MANUAL_RELEASE, true),

  tracePrefix: asText(process.env.WATCHDOG_TRACE_PREFIX) || 'watchdog',
  hostName: asText(process.env.WATCHDOG_HOST_NAME) || asText(process.env.HOSTNAME) || 'unknown_host',
  logLevel: asText(process.env.WATCHDOG_LOG_LEVEL).toLowerCase() || 'info',
};

module.exports = {
  config,
};
