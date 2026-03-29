const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isUuid,
  ensureDirectTenant,
  countEvidenceItems,
  hasTenantScopedSignal,
} = require('../validation');

test('isUuid validates standard UUIDs', () => {
  assert.equal(isUuid('ff88f4f5-1e15-4773-8093-ff0e95cfa9d6'), true);
  assert.equal(isUuid('not-a-uuid'), false);
});

test('ensureDirectTenant throws for invalid tenant values', () => {
  assert.throws(() => ensureDirectTenant(''), /missing_tenant_id_for_direct_mode/);
  assert.throws(() => ensureDirectTenant('abc'), /invalid_tenant_id_for_direct_mode/);
  assert.equal(ensureDirectTenant('ff88f4f5-1e15-4773-8093-ff0e95cfa9d6'), 'ff88f4f5-1e15-4773-8093-ff0e95cfa9d6');
});

test('countEvidenceItems and hasTenantScopedSignal summarize context', () => {
  const context = {
    transcripts: [{}, {}],
    claims: [{}],
    clusters: [{}],
    opportunities: [],
    gaps: [{}],
  };
  assert.equal(countEvidenceItems(context), 5);
  assert.equal(hasTenantScopedSignal(context), true);
  assert.equal(hasTenantScopedSignal({ transcripts: [{}], claims: [{}] }), false);
});
