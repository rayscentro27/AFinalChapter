function asText(value) {
  return String(value || '').trim();
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
