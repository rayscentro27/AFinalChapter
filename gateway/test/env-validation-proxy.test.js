import test from 'node:test';
import assert from 'node:assert/strict';

import { validateGatewayEnv } from '../src/config/envValidation.js';

function baseEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    SYSTEM_MODE: 'production',
    INTERNAL_API_KEY: 'test-internal-key',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    ALLOWED_ORIGINS: 'https://app.example.com',
    TWILIO_ACCOUNT_SID: 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    TWILIO_AUTH_TOKEN: 'twilio-auth-token',
    TWILIO_FROM_NUMBER: '+15550001111',
    META_APP_SECRET: 'meta-app-secret',
    META_VERIFY_TOKEN: 'meta-verify-token',
    WHATSAPP_VERIFY_TOKEN: 'wa-verify-token',
    WHATSAPP_TOKEN: 'wa-token',
    META_PAGE_ACCESS_TOKEN: 'meta-page-token',
    TRUST_PROXY: 'true',
    TRUST_PROXY_CIDRS: '',
    TRUST_PROXY_ALLOW_ALL: 'false',
    ...overrides,
  };
}

function loggerStub() {
  return {
    warn() {},
    error() {},
  };
}

test('validateGatewayEnv strict fails when TRUST_PROXY is enabled without CIDRs or allow-all', () => {
  const env = baseEnv();
  assert.throws(
    () => validateGatewayEnv({ env, strict: true, logger: loggerStub() }),
    /Invalid trust proxy configuration/
  );
});

test('validateGatewayEnv strict passes when TRUST_PROXY has CIDR allowlist', () => {
  const env = baseEnv({ TRUST_PROXY_CIDRS: '10.0.0.0/8,192.168.0.0/16' });
  const summary = validateGatewayEnv({ env, strict: true, logger: loggerStub() });

  assert.equal(summary.ok, true);
  assert.equal(summary.proxy_trust.ok, true);
  assert.equal(summary.proxy_trust.trust_proxy, true);
  assert.equal(summary.proxy_trust.allow_all, false);
});

test('validateGatewayEnv strict passes when TRUST_PROXY is disabled', () => {
  const env = baseEnv({ TRUST_PROXY: 'false' });
  const summary = validateGatewayEnv({ env, strict: true, logger: loggerStub() });

  assert.equal(summary.ok, true);
  assert.equal(summary.proxy_trust.ok, true);
  assert.equal(summary.proxy_trust.trust_proxy, false);
});
