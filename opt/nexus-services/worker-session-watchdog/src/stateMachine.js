const SESSION_STATES = [
  'healthy',
  'degraded',
  'login_required',
  'browser_crashed',
  'rate_limited',
  'stuck',
  'restarting',
  'paused',
  'quarantined',
];

const QUARANTINE_TRIGGER_STATES = new Set(['login_required', 'browser_crashed', 'stuck']);

function asText(value) {
  return String(value || '').trim();
}

function isUnhealthyState(state) {
  return asText(state).toLowerCase() !== 'healthy';
}

function deriveCandidateState(probe) {
  if (!probe.processRunning) return 'browser_crashed';
  if (!probe.browserRunning) return 'browser_crashed';

  if (probe.sessionStateProbe === 'login_required') return 'login_required';
  if (probe.sessionStateProbe === 'rate_limited') return 'rate_limited';
  if (probe.sessionStateProbe === 'browser_crashed') return 'browser_crashed';
  if (probe.sessionStateProbe === 'stuck') return 'stuck';

  if (probe.pageStuck) return 'stuck';
  if (probe.fakeHealthy || probe.leaseRisk) return 'degraded';

  return 'healthy';
}

function evaluateTransition({ previousState, probe, quarantineEnabled = true }) {
  const prev = asText(previousState || 'healthy').toLowerCase() || 'healthy';
  let next = deriveCandidateState(probe);

  const reasons = [];
  if (!probe.processRunning) reasons.push('process_not_running');
  if (!probe.browserRunning) reasons.push('browser_not_running');
  if (probe.sessionStateProbe === 'login_required') reasons.push('login_required_probe');
  if (probe.sessionStateProbe === 'rate_limited') reasons.push('rate_limited_probe');
  if (probe.pageStuck) reasons.push('repeated_page_signature');
  if (probe.fakeHealthy) reasons.push('fake_healthy_detected');
  if (probe.leaseRisk) reasons.push('stale_lease_risk');

  if (prev === 'quarantined' && next !== 'healthy') {
    next = 'quarantined';
  }

  if (quarantineEnabled && QUARANTINE_TRIGGER_STATES.has(next)) {
    next = 'quarantined';
    reasons.push('v1_quarantine_policy');
  }

  const changed = prev !== next;

  let eventType = 'session_probe_ok';
  let severity = 'info';

  if (next === 'quarantined') {
    eventType = 'worker_quarantined';
    severity = 'critical';
  } else if (next === 'degraded') {
    eventType = 'worker_degraded';
    severity = 'warning';
  } else if (next === 'rate_limited') {
    eventType = 'worker_rate_limited';
    severity = 'warning';
  } else if (changed && next === 'healthy') {
    eventType = 'worker_recovered';
    severity = 'info';
  } else if (changed) {
    eventType = `state_changed_${next}`;
    severity = isUnhealthyState(next) ? 'warning' : 'info';
  }

  return {
    previousState: prev,
    nextState: next,
    changed,
    eventType,
    severity,
    reasons,
  };
}

module.exports = {
  SESSION_STATES,
  QUARANTINE_TRIGGER_STATES,
  isUnhealthyState,
  deriveCandidateState,
  evaluateTransition,
};
