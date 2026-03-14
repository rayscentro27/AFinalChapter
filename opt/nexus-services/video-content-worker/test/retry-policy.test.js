const test = require('node:test');
const assert = require('node:assert/strict');

const {
  backoffDelaySeconds,
  nextRetryAt,
  shouldMoveToDeadLetter,
} = require('../retryPolicy');

test('backoffDelaySeconds stays within configured bounds', () => {
  const value = backoffDelaySeconds({ attemptCount: 2, baseDelaySeconds: 10, maxDelaySeconds: 60 });
  assert.ok(value >= 40);
  assert.ok(value <= 60);
});

test('nextRetryAt returns future timestamp', () => {
  const now = Date.now();
  const retryIso = nextRetryAt({ attemptCount: 1, baseDelaySeconds: 5, maxDelaySeconds: 20 });
  const retryMs = Date.parse(retryIso);
  assert.ok(Number.isFinite(retryMs));
  assert.ok(retryMs > now);
});

test('shouldMoveToDeadLetter triggers when attempts exceed max', () => {
  assert.equal(shouldMoveToDeadLetter({ attemptCount: 4, maxAttempts: 5 }), false);
  assert.equal(shouldMoveToDeadLetter({ attemptCount: 5, maxAttempts: 5 }), true);
  assert.equal(shouldMoveToDeadLetter({ attemptCount: 6, maxAttempts: 5 }), true);
});
