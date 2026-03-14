import test from 'node:test';
import assert from 'node:assert/strict';

process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'test-internal-key';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';
process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'test-jwt-secret';
process.env.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
process.env.TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'twilio-auth-token';
process.env.TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '+15550001111';
process.env.META_APP_SECRET = process.env.META_APP_SECRET || 'meta-app-secret';
process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'meta-verify-token';
process.env.WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'wa-verify-token';
process.env.WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || 'wa-token';
process.env.META_PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || 'meta-page-token';

const { buildAlertRules, ALERT_RULES } = await import('../src/routes/admin_monitoring_v2.js');

function baseSnapshot(overrides = {}) {
  return {
    outbox: { queued: 0, sending: 0, failed: 0, oldest_due_minutes: 0 },
    webhooks: { accepted_15m: 10, ignored_15m: 0, failed_15m: 0, lag_p95_seconds: 10 },
    delivery: { pending: 0, delivered: 0, failed: 0 },
    queue: { pending: 0, retry_wait: 0, running: 0, dead_letter: 0, dead_letter_last_hour: 0 },
    workers: { stale_count: 0, fresh_count: 2, stale_cutoff_iso: new Date().toISOString() },
    providers: {},
    alerts_open: [],
    ...overrides,
  };
}

function baseContext(overrides = {}) {
  return {
    failedOutboxLastWindow: 0,
    totalOutboxLastWindow: 0,
    deliveryFailedLastWindow: 0,
    providersDownOverThreshold: 0,
    activeChannels: 1,
    queueEnabled: true,
    ...overrides,
  };
}

function findRule(rules, alertKey) {
  return rules.find((rule) => rule.alert_key === alertKey);
}

test('buildAlertRules triggers queue pending warning and critical severities', () => {
  const warningRules = buildAlertRules(
    baseSnapshot({ queue: { pending: ALERT_RULES.QUEUE_PENDING_WARN_MIN, retry_wait: 0, running: 0, dead_letter: 0, dead_letter_last_hour: 0 } }),
    baseContext(),
  );

  const warningRule = findRule(warningRules, 'QUEUE_PENDING_SPIKE');
  assert.equal(warningRule.triggered, true);
  assert.equal(warningRule.severity, 'warn');

  const criticalRules = buildAlertRules(
    baseSnapshot({ queue: { pending: ALERT_RULES.QUEUE_PENDING_CRITICAL_MIN, retry_wait: 0, running: 0, dead_letter: 0, dead_letter_last_hour: 0 } }),
    baseContext(),
  );

  const criticalRule = findRule(criticalRules, 'QUEUE_PENDING_SPIKE');
  assert.equal(criticalRule.triggered, true);
  assert.equal(criticalRule.severity, 'critical');
});

test('buildAlertRules triggers dead-letter growth and stale worker alerts when queue enabled', () => {
  const rules = buildAlertRules(
    baseSnapshot({
      queue: {
        pending: 0,
        retry_wait: 0,
        running: 2,
        dead_letter: 20,
        dead_letter_last_hour: ALERT_RULES.DEAD_LETTER_GROWTH_HOURLY_CRITICAL_MIN,
      },
      workers: {
        stale_count: ALERT_RULES.STALE_WORKERS_WHILE_QUEUE_ENABLED_MIN,
        fresh_count: 1,
        stale_cutoff_iso: new Date().toISOString(),
      },
    }),
    baseContext({ queueEnabled: true }),
  );

  const deadLetterRule = findRule(rules, 'QUEUE_DEAD_LETTER_GROWTH');
  assert.equal(deadLetterRule.triggered, true);
  assert.equal(deadLetterRule.severity, 'critical');

  const staleRule = findRule(rules, 'WORKERS_STALE_WHILE_QUEUE_ENABLED');
  assert.equal(staleRule.triggered, true);
  assert.equal(staleRule.severity, 'critical');
});

test('buildAlertRules does not trigger stale worker alert when queue disabled', () => {
  const rules = buildAlertRules(
    baseSnapshot({
      workers: {
        stale_count: 99,
        fresh_count: 0,
        stale_cutoff_iso: new Date().toISOString(),
      },
    }),
    baseContext({ queueEnabled: false }),
  );

  const staleRule = findRule(rules, 'WORKERS_STALE_WHILE_QUEUE_ENABLED');
  assert.equal(staleRule.triggered, false);
});
