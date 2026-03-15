const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateTransition } = require('../src/stateMachine');

test('healthy moves to degraded on fake-healthy detection', () => {
  const probe = {
    processRunning: true,
    browserRunning: true,
    sessionStateProbe: 'healthy',
    pageStuck: false,
    fakeHealthy: true,
    leaseRisk: false,
  };

  const out = evaluateTransition({ previousState: 'healthy', probe, quarantineEnabled: true });
  assert.equal(out.nextState, 'degraded');
  assert.equal(out.severity, 'warning');
});

test('login required transitions to quarantined under v1 policy', () => {
  const probe = {
    processRunning: true,
    browserRunning: true,
    sessionStateProbe: 'login_required',
    pageStuck: false,
    fakeHealthy: false,
    leaseRisk: false,
  };

  const out = evaluateTransition({ previousState: 'degraded', probe, quarantineEnabled: true });
  assert.equal(out.nextState, 'quarantined');
  assert.equal(out.eventType, 'worker_quarantined');
  assert.equal(out.severity, 'critical');
});

test('healthy remains healthy when all probes are good', () => {
  const probe = {
    processRunning: true,
    browserRunning: true,
    sessionStateProbe: 'healthy',
    pageStuck: false,
    fakeHealthy: false,
    leaseRisk: false,
  };

  const out = evaluateTransition({ previousState: 'healthy', probe, quarantineEnabled: true });
  assert.equal(out.nextState, 'healthy');
  assert.equal(out.changed, false);
});
