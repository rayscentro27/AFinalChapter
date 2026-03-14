const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDraftReviewState,
  reviewMetadataMarkers,
  enforcePublishHandoffPolicy,
  isPublishHandoffRequested,
} = require('../reviewer');

test('buildDraftReviewState sets review workflow defaults', () => {
  const reviewed = buildDraftReviewState({ title: 'x' }, { policyVersion: 'v2' });
  assert.equal(reviewed.status, 'draft');
  assert.equal(reviewed.approval_required, true);
  assert.equal(reviewed.publish_status, 'not_ready');
  assert.equal(reviewed.review_workflow.review_status, 'pending_review');
  assert.equal(reviewed.review_workflow.publish_handoff_allowed, false);
  assert.equal(reviewed.review_workflow.policy_version, 'v2');
});

test('reviewMetadataMarkers returns explicit draft/approval markers', () => {
  const reviewed = buildDraftReviewState({ title: 'x' });
  const markers = reviewMetadataMarkers(reviewed);
  assert.ok(markers.keyPoints.includes('review_status:pending_review'));
  assert.ok(markers.keyPoints.includes('publish_handoff_allowed:false'));
  assert.ok(markers.tags.includes('manual_approval_required'));
  assert.ok(markers.tags.includes('publish_blocked'));
});

test('publish handoff policy rejects requests without approval metadata', () => {
  assert.equal(isPublishHandoffRequested({ publish_handoff_requested: true }), true);
  assert.throws(
    () => enforcePublishHandoffPolicy({ publish_handoff_requested: true }),
    /publish_handoff_requires_manual_approval/
  );
});

test('publish handoff policy remains blocked in phase A3 even with approval metadata', () => {
  assert.throws(
    () => enforcePublishHandoffPolicy({
      publish_handoff_requested: true,
      approval_reference: 'APR-123',
      approved_by: 'admin-user',
    }),
    /publish_handoff_not_supported_in_phase_a3/
  );
});
