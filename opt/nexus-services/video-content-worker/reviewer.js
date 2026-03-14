function buildDraftReviewState(output) {
  return {
    ...output,
    status: 'draft',
    approval_required: true,
    approved_at: null,
    approved_by: null,
    rejected_at: null,
    rejected_by: null,
    review_notes: null,
  };
}

module.exports = {
  buildDraftReviewState,
};
