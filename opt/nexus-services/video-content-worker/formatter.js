function asText(value) {
  return String(value || '').trim();
}

function asBool(value) {
  if (typeof value === 'boolean') return value;
  const text = asText(value).toLowerCase();
  if (!text) return false;
  return text === 'true' || text === '1' || text === 'yes' || text === 'on';
}

function normalizePayload(raw = {}, defaults = {}) {
  const platform = asText(raw.platform || defaults.platform || 'youtube').toLowerCase();
  const format = asText(raw.format || defaults.format || (platform === 'youtube' ? 'long_form' : 'faceless_short')).toLowerCase();

  return {
    tenant_id: asText(raw.tenant_id || defaults.tenant_id),
    topic: asText(raw.topic || defaults.topic || 'general_topic').toLowerCase().replace(/\s+/g, '_'),
    title: asText(raw.title || defaults.title || 'Nexus educational content draft'),
    platform,
    format,
    tone: asText(raw.tone || defaults.tone || 'educational_authority'),
    audience: asText(raw.audience || defaults.audience || 'new_leads'),
    trace_id: asText(raw.trace_id || defaults.trace_id),
    source_refs: raw.source_refs && typeof raw.source_refs === 'object' ? raw.source_refs : {},
    publish_handoff_requested: asBool(raw.publish_handoff_requested || raw.publish_ready),
    publish_status: asText(raw.publish_status),
    approval_reference: asText(raw.approval_reference || raw.manual_approval_ref),
    approved_by: asText(raw.approved_by || raw.manual_approved_by),
    publish_handoff: raw.publish_handoff && typeof raw.publish_handoff === 'object' ? raw.publish_handoff : null,
  };
}

function toArtifactInput(output) {
  return {
    title: asText(output.title),
    platform: asText(output.platform),
    format: asText(output.format),
    summary: asText(output.summary),
    key_points: Array.isArray(output.key_points) ? output.key_points : [],
    tags: Array.isArray(output.tags) ? output.tags : [],
    confidence: Number.isFinite(Number(output.confidence)) ? Number(output.confidence) : null,
    source_url: asText(output.source_url),
  };
}

module.exports = {
  normalizePayload,
  toArtifactInput,
};
