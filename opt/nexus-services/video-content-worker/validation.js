function asText(value) {
  return String(value || '').trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(asText(value));
}

function countEvidenceItems(context = {}) {
  const transcripts = Array.isArray(context.transcripts) ? context.transcripts.length : 0;
  const claims = Array.isArray(context.claims) ? context.claims.length : 0;
  const clusters = Array.isArray(context.clusters) ? context.clusters.length : 0;
  const opportunities = Array.isArray(context.opportunities) ? context.opportunities.length : 0;
  const gaps = Array.isArray(context.gaps) ? context.gaps.length : 0;
  return transcripts + claims + clusters + opportunities + gaps;
}

function hasTenantScopedSignal(context = {}) {
  const clusters = Array.isArray(context.clusters) ? context.clusters.length : 0;
  const opportunities = Array.isArray(context.opportunities) ? context.opportunities.length : 0;
  const gaps = Array.isArray(context.gaps) ? context.gaps.length : 0;
  return (clusters + opportunities + gaps) > 0;
}

function ensureDirectTenant(tenantId) {
  const value = asText(tenantId);
  if (!value) throw new Error('missing_tenant_id_for_direct_mode (use --tenant <TENANT_UUID>)');
  if (!isUuid(value)) throw new Error('invalid_tenant_id_for_direct_mode');
  return value;
}

module.exports = {
  asText,
  isUuid,
  countEvidenceItems,
  hasTenantScopedSignal,
  ensureDirectTenant,
};
