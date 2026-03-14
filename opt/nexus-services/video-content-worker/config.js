const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: process.env.ENV_FILE || path.join(process.cwd(), '.env') });

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function asBool(value, fallback = false) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return fallback;
  return text === 'true' || text === '1' || text === 'yes' || text === 'on';
}

function asInt(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(num)));
}

function asList(value, fallback = []) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

const VIDEO_JOB_TYPES = [
  'video_topic_generation',
  'video_script_shortform',
  'video_script_longform',
  'video_outline_generation',
  'video_hook_generation',
  'video_caption_generation',
  'video_thumbnail_copy',
  'video_cta_generation',
  'video_repurpose_pack',
  'video_content_calendar',
];

const config = {
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  mode: String(process.env.VIDEO_WORKER_MODE || 'direct').trim().toLowerCase(),
  dryRun: asBool(process.env.VIDEO_WORKER_DRY_RUN, true),
  queueEnabled: asBool(process.env.VIDEO_WORKER_QUEUE_ENABLED, false),
  queueBatch: asInt(process.env.VIDEO_WORKER_QUEUE_BATCH, 5, 1, 100),
  leaseSeconds: asInt(process.env.VIDEO_WORKER_LEASE_SECONDS, 300, 30, 7200),
  queueRetryBaseDelaySeconds: asInt(process.env.VIDEO_WORKER_QUEUE_RETRY_BASE_DELAY_SECONDS, 15, 1, 3600),
  queueRetryMaxDelaySeconds: asInt(process.env.VIDEO_WORKER_QUEUE_RETRY_MAX_DELAY_SECONDS, 600, 5, 86400),
  queueMaxAttemptsDefault: asInt(process.env.VIDEO_WORKER_QUEUE_MAX_ATTEMPTS_DEFAULT, 5, 1, 100),
  maxTopics: asInt(process.env.VIDEO_WORKER_MAX_TOPICS, 10, 1, 100),
  maxTranscripts: asInt(process.env.VIDEO_WORKER_MAX_TRANSCRIPTS, 20, 1, 200),
  maxClaims: asInt(process.env.VIDEO_WORKER_MAX_CLAIMS, 10, 1, 200),
  maxClusters: asInt(process.env.VIDEO_WORKER_MAX_CLUSTERS, 10, 1, 200),
  maxOpportunities: asInt(process.env.VIDEO_WORKER_MAX_OPPORTUNITIES, 10, 1, 200),
  maxGaps: asInt(process.env.VIDEO_WORKER_MAX_GAPS, 10, 1, 200),
  outputLimit: asInt(process.env.VIDEO_WORKER_OUTPUT_LIMIT, 20, 1, 200),
  minEvidenceItems: asInt(process.env.VIDEO_WORKER_MIN_EVIDENCE_ITEMS, 1, 0, 2000),
  strictTenantScope: asBool(process.env.VIDEO_WORKER_STRICT_TENANT_SCOPE, true),
  requireEvidenceForWrite: asBool(process.env.VIDEO_WORKER_REQUIRE_EVIDENCE_FOR_WRITE, true),
  reviewPolicyVersion: String(process.env.VIDEO_WORKER_REVIEW_POLICY_VERSION || 'v1').trim(),
  platforms: asList(process.env.VIDEO_WORKER_PLATFORMS, ['youtube', 'instagram', 'tiktok']),
  defaultTone: String(process.env.VIDEO_WORKER_DEFAULT_TONE || 'educational_authority').trim(),
  defaultAudience: String(process.env.VIDEO_WORKER_DEFAULT_AUDIENCE || 'new_leads').trim(),
  telegramBotToken: String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
  telegramChatId: String(process.env.TELEGRAM_CHAT_ID || '').trim(),
};

module.exports = {
  config,
  VIDEO_JOB_TYPES,
};
