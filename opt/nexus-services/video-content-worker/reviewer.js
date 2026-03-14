function asText(value) {
  return String(value || '').trim();
}

function asBool(value) {
  if (typeof value === 'boolean') return value;
  const text = asText(value).toLowerCase();
  if (!text) return false;
  return text === 'true' || text === '1' || text === 'yes' || text === 'on';
}

function isPublishHandoffRequested(payload = {}) {
  if (!payload || typeof payload !== 'object') return false;

  if (asBool(payload.publish_handoff_requested)) return true;
  if (asBool(payload.publish_ready)) return true;

  const status = asText(payload.publish_status).toLowerCase();
  if (status && ['ready_for_production', 'scheduled', 'published'].includes(status)) return true;

  const handoff = payload.publish_handoff;
  if (handoff && typeof handoff === 'object') {
    if (asBool(handoff.requested)) return true;
    if (asText(handoff.status)) return true;
  }

  return false;
}

function enforcePublishHandoffPolicy(payload = {}) {
  if (!isPublishHandoffRequested(payload)) return { requested: false, allowed: false };

  const approvalRef = asText(payload.approval_reference || payload.manual_approval_ref);
  const approvedBy = asText(payload.approved_by || payload.manual_approved_by);

  if (!approvalRef || !approvedBy) {
    const error = new Error('publish_handoff_requires_manual_approval');
    error.code = 'publish_handoff_requires_manual_approval';
    throw error;
  }

  const unsupported = new Error('publish_handoff_not_supported_in_phase_a3');
  unsupported.code = 'publish_handoff_not_supported_in_phase_a3';
  throw unsupported;
}

function buildDraftReviewState(output, { policyVersion = 'v1' } = {}) {
  const reviewWorkflow = {
    policy_version: asText(policyVersion) || 'v1',
    review_status: 'pending_review',
    approval_required: true,
    manual_approval_required: true,
    publish_handoff_allowed: false,
    publish_handoff_blocked: true,
    publish_status: 'not_ready',
    approval_reference: null,
    approved_at: null,
    approved_by: null,
    rejected_at: null,
    rejected_by: null,
    review_notes: null,
  };

  return {
    ...output,
    status: 'draft',
    approval_required: true,
    approved_at: null,
    approved_by: null,
    rejected_at: null,
    rejected_by: null,
    review_notes: null,
    publish_status: 'not_ready',
    review_workflow: reviewWorkflow,
  };
}

function reviewMetadataMarkers(reviewedOutput = {}) {
  const workflow = reviewedOutput.review_workflow && typeof reviewedOutput.review_workflow === 'object'
    ? reviewedOutput.review_workflow
    : {};

  const keyPoints = [
    `review_status:${asText(workflow.review_status || 'pending_review')}`,
    `approval_required:${String(workflow.approval_required !== false)}`,
    `manual_approval_required:${String(workflow.manual_approval_required !== false)}`,
    `publish_handoff_allowed:${String(Boolean(workflow.publish_handoff_allowed))}`,
    `publish_status:${asText(workflow.publish_status || 'not_ready')}`,
    `review_policy:${asText(workflow.policy_version || 'v1')}`,
  ];

  const tags = [
    'pending_review',
    'manual_approval_required',
    'publish_blocked',
    'not_publish_ready',
  ];

  return { keyPoints, tags };
}

module.exports = {
  isPublishHandoffRequested,
  enforcePublishHandoffPolicy,
  buildDraftReviewState,
  reviewMetadataMarkers,
};
