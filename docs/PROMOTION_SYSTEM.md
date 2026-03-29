# Promotion System

## Goal
Enable controlled, auditable promotional access for Nexus tenants without breaking Stripe or subscription lifecycle records.

## Implementation
Promotions are implemented as `membership_overrides` rows with:
- `override_type = 'promo'`
- `promo_duration_days`
- `promo_applied_at`
- `promo_expires_at`
- `override_start` and `override_end`
- `active = true` until manually restored or naturally expired

## Promo Scenarios
- first 30 days free
- campaign promo with code
- temporary access for support/retention

## Behavior
- Promo overrides take precedence over subscription status while active.
- Expired promo rows remain for audit and no longer grant access.
- Restore action can terminate promos early by setting `active = false`.

## Example Payload
```json
{
  "tenant_id": "<TENANT_UUID>",
  "user_id": "<OPTIONAL_USER_UUID>",
  "promo_code": "WELCOME30",
  "promo_duration_days": 30,
  "override_reason": "launch_campaign"
}
```

## Operational Checks
- Verify `membership_overrides` contains promo row.
- Verify `membership_override_audit` has `promo_created` action.
- Verify `/api/admin/membership/status` resolves source `active_promotion`.

## Safety Constraints
- Admin-only management (`billing.manage`).
- No client self-service mutation.
- No deletion of subscriptions or subscription events.
- Full audit log retained.
