function asText(value) {
  return String(value || '').trim();
}

function asBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const text = asText(value).toLowerCase();
  if (!text) return fallback;
  return text === '1' || text === 'true' || text === 'yes' || text === 'on';
}

function parseIso(value) {
  const text = asText(value);
  if (!text) return null;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function ageSecondsFrom(value, now = new Date()) {
  const d = parseIso(value);
  if (!d) return null;
  return Math.max(0, Math.trunc((now.getTime() - d.getTime()) / 1000));
}

function metadataFromHeartbeat(row = {}) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const legacy = row.meta && typeof row.meta === 'object' ? row.meta : {};
  return {
    ...legacy,
    ...meta,
  };
}

function normalizeSessionProbe(raw) {
  const probe = asText(raw).toLowerCase();
  if (!probe) return 'healthy';
  if (probe.includes('login') || probe.includes('auth') || probe.includes('expired')) return 'login_required';
  if (probe.includes('rate') || probe.includes('blocked') || probe.includes('captcha')) return 'rate_limited';
  if (probe.includes('browser') && probe.includes('crash')) return 'browser_crashed';
  if (probe.includes('stuck') || probe.includes('unresponsive')) return 'stuck';
  return probe;
}

function buildProbeContext({ heartbeatRow, existingSession, staleLeaseCount = 0, config, now = new Date() }) {
  const meta = metadataFromHeartbeat(heartbeatRow);

  const processRunning = asBool(meta.process_running, true);
  const browserRunning = asBool(meta.browser_running, true);
  const sessionStateProbe = normalizeSessionProbe(meta.session_state_probe || meta.session_state || 'healthy');

  const lastHeartbeatAt = asText(heartbeatRow.last_heartbeat_at || heartbeatRow.last_seen_at || heartbeatRow.updated_at);
  const lastSuccessAt = asText(meta.last_success_at || existingSession?.last_success_at || '');
  const currentJobStartedAt = asText(meta.current_job_started_at || existingSession?.current_job_started_at || '');

  const lastPageSignature = asText(meta.page_signature || meta.dom_signature || existingSession?.last_page_signature || '');
  const previousSignature = asText(existingSession?.last_page_signature || '');
  const previousRepeatCount = Number(existingSession?.metadata?.page_signature_repeat_count || 0);
  const signatureRepeated = Boolean(lastPageSignature && previousSignature && lastPageSignature === previousSignature);
  const pageSignatureRepeatCount = signatureRepeated ? previousRepeatCount + 1 : (lastPageSignature ? 1 : 0);

  const heartbeatAgeSeconds = ageSecondsFrom(lastHeartbeatAt, now);
  const successAgeSeconds = ageSecondsFrom(lastSuccessAt, now);
  const jobAgeSeconds = ageSecondsFrom(currentJobStartedAt, now);

  const staleHeartbeat = heartbeatAgeSeconds != null && heartbeatAgeSeconds > Number(config.heartbeatStaleSeconds || 90);
  const noProgress = successAgeSeconds != null && successAgeSeconds > Number(config.noProgressSeconds || 600);
  const longRunningJob = jobAgeSeconds != null && jobAgeSeconds > (Number(config.maxJobMinutes || 20) * 60);
  const pageStuck = pageSignatureRepeatCount >= Number(config.pageSignatureRepeatThreshold || 5);

  const inFlightJobs = Number(meta.in_flight_jobs || meta.inflight_jobs || 0);
  const hasWorkInProgress = inFlightJobs > 0 || Boolean(heartbeatRow.current_job_id || meta.current_job_id);

  const fakeHealthy = Boolean(!staleHeartbeat && hasWorkInProgress && noProgress);
  const leaseRisk = Number(staleLeaseCount || 0) > 0 || longRunningJob;

  return {
    processRunning,
    browserRunning,
    sessionStateProbe,
    lastHeartbeatAt,
    lastSuccessAt,
    currentJobStartedAt,
    lastPageSignature,
    pageSignatureRepeatCount,
    heartbeatAgeSeconds,
    successAgeSeconds,
    jobAgeSeconds,
    staleHeartbeat,
    noProgress,
    longRunningJob,
    pageStuck,
    fakeHealthy,
    leaseRisk,
    staleLeaseCount: Number(staleLeaseCount || 0),
    hasWorkInProgress,
    inFlightJobs,
  };
}

module.exports = {
  asText,
  asBool,
  parseIso,
  ageSecondsFrom,
  metadataFromHeartbeat,
  normalizeSessionProbe,
  buildProbeContext,
};
