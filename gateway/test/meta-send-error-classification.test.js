import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyMetaSendError,
  computeMetaOutboxRetryPlan,
  parseMetaSendError,
} from '../src/util/meta-send-error.js';

test('parseMetaSendError extracts Meta HTTP status and provider code', () => {
  const parsed = parseMetaSendError('Meta send failed (400): (#3) Application does not have the capability to make this API call.');

  assert.deepEqual(parsed, {
    provider: 'meta',
    httpStatus: 400,
    providerCode: 3,
    providerMessage: '(#3) Application does not have the capability to make this API call.',
    rawMessage: 'Meta send failed (400): (#3) Application does not have the capability to make this API call.',
  });
});

test('classifyMetaSendError treats Meta code 3 as a permanent capability failure', () => {
  const classified = classifyMetaSendError('Meta send failed (400): (#3) Application does not have the capability to make this API call.');

  assert.equal(classified?.category, 'capability_missing');
  assert.equal(classified?.retryable, false);
  assert.equal(classified?.providerCode, 3);
  assert.match(classified?.summary || '', /capability missing/i);
  assert.match(classified?.recommendation || '', /Messenger API for Instagram/i);
});

test('computeMetaOutboxRetryPlan keeps server-side Meta errors retryable', () => {
  const plan = computeMetaOutboxRetryPlan('Meta send failed (500): Internal Server Error', 2, new Date('2026-04-01T12:00:00Z'));

  assert.equal(plan.classification?.category, 'meta_server_error');
  assert.equal(plan.retryable, true);
  assert.equal(plan.nextRetryMinutes, 5);
  assert.equal(plan.nextRetryAt, '2026-04-01T12:05:00.000Z');
});
