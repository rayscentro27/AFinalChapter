import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMembershipAccess } from '../src/lib/billing/membershipOverrideResolver.js';

test('active override takes precedence over subscription', () => {
  const now = new Date('2026-03-14T00:00:00Z');

  const result = resolveMembershipAccess({
    now,
    user_id: '00000000-0000-0000-0000-000000000001',
    subscription: {
      status: 'active',
      tier: 'premium',
      current_period_end: '2026-04-01T00:00:00Z',
    },
    overrides: [
      {
        active: true,
        user_id: null,
        override_type: 'waived',
        override_start: '2026-03-01T00:00:00Z',
        override_end: '2026-03-31T00:00:00Z',
        created_at: '2026-03-10T00:00:00Z',
      },
    ],
  });

  assert.equal(result.access_allowed, true);
  assert.equal(result.source, 'active_override');
});

test('active promo resolves as active_promotion', () => {
  const now = new Date('2026-03-14T00:00:00Z');

  const result = resolveMembershipAccess({
    now,
    subscription: {
      status: 'past_due',
      tier: 'growth',
    },
    overrides: [
      {
        active: true,
        user_id: null,
        override_type: 'promo',
        override_start: '2026-03-01T00:00:00Z',
        override_end: '2026-04-01T00:00:00Z',
        created_at: '2026-03-05T00:00:00Z',
      },
    ],
  });

  assert.equal(result.access_allowed, true);
  assert.equal(result.source, 'active_promotion');
});

test('falls back to active paid subscription when no active override', () => {
  const now = new Date('2026-03-14T00:00:00Z');

  const result = resolveMembershipAccess({
    now,
    subscription: {
      status: 'active',
      tier: 'growth',
      current_period_end: '2026-03-30T00:00:00Z',
    },
    overrides: [
      {
        active: true,
        user_id: null,
        override_type: 'promo',
        override_start: '2026-02-01T00:00:00Z',
        override_end: '2026-03-01T00:00:00Z',
        created_at: '2026-02-01T00:00:00Z',
      },
    ],
  });

  assert.equal(result.access_allowed, true);
  assert.equal(result.source, 'active_paid_subscription');
});

test('blocked when no active override and no active paid subscription', () => {
  const now = new Date('2026-03-14T00:00:00Z');

  const result = resolveMembershipAccess({
    now,
    subscription: {
      status: 'canceled',
      tier: 'premium',
      current_period_end: '2026-02-28T00:00:00Z',
    },
    overrides: [],
  });

  assert.equal(result.access_allowed, false);
  assert.equal(result.source, 'expired_subscription');
});
