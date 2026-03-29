# Membership Override System

## Purpose
The membership override system provides admin-controlled exceptions without deleting or rewriting subscription billing history.

Supported actions:
- waive membership access
- apply temporary promo access
- restore normal billing-based access
- query resolved membership status

## Data Model
Primary table:
- `public.membership_overrides`

Audit table:
- `public.membership_override_audit`

Overrides are additive records. Historical rows remain after restore.

## Override Types
- `waived`
- `promo`
- `manual_override`
- `vip_access`

## Access Resolution Order
1. active override (`waived`, `manual_override`, `vip_access`)
2. active promotion (`promo` not expired)
3. active paid subscription (`subscriptions.status in active/trialing` and tier/plan not free)
4. blocked (`expired_subscription`)

## API Endpoints
All endpoints require:
- `x-api-key: INTERNAL_API_KEY`
- tenant auth JWT
- tenant role in `owner|admin|super_admin`
- `billing.manage` permission

### GET `/api/admin/membership/status`
Query:
- `tenant_id` (required)
- `user_id` (optional)

Returns:
- resolved access status
- active override (if any)
- latest subscription snapshot

### POST `/api/admin/membership/waive`
Body:
- `tenant_id` (required)
- `user_id` (optional)
- `override_reason` (required)
- `override_end` (optional ISO timestamp)
- `metadata` (optional object)

Creates an active `waived` override.

### POST `/api/admin/membership/promo`
Body:
- `tenant_id` (required)
- `user_id` (optional)
- `override_reason` (optional)
- `promo_code` (optional)
- `promo_duration_days` (optional, default `30`)
- `metadata` (optional object)

Creates an active `promo` override with automatic expiration.

### POST `/api/admin/membership/restore`
Body:
- `tenant_id` (required)
- `user_id` (optional)
- `override_reason` (optional)

Marks active overrides inactive and records restore audit events.

## Safety Notes
- No billing history deletion.
- No subscription row deletion.
- Restore only changes override state.
- Actions are logged in both `membership_override_audit` and `audit_events`.

## Local Verification
```bash
cd gateway
npm run test -- --test-name-pattern membership

# status
curl -s -H "x-api-key: $INTERNAL_API_KEY" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "http://localhost:3000/api/admin/membership/status?tenant_id=<TENANT_UUID>" | jq

# waive
curl -s -X POST -H "Content-Type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -d '{"tenant_id":"<TENANT_UUID>","override_reason":"support_comp"}' \
  "http://localhost:3000/api/admin/membership/waive" | jq

# promo
curl -s -X POST -H "Content-Type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -d '{"tenant_id":"<TENANT_UUID>","promo_code":"WELCOME30","promo_duration_days":30}' \
  "http://localhost:3000/api/admin/membership/promo" | jq

# restore
curl -s -X POST -H "Content-Type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -d '{"tenant_id":"<TENANT_UUID>","override_reason":"manual_restore"}' \
  "http://localhost:3000/api/admin/membership/restore" | jq
```
