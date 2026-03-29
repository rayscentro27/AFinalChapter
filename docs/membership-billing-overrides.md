# Membership Billing Overrides (Phase 5 Design)

## Purpose
Provide reversible, auditable billing exceptions for superadmin operators without mutating Stripe source-of-truth events.

## Current insertion points (existing)
- Billing/plan enforcement: `gateway/src/lib/billing/planEnforcer.js`
- Permission model (`billing.read`, `billing.manage`): `gateway/src/lib/auth/permissionConstants.js`
- Permission guard middleware: `gateway/src/lib/auth/requireTenantPermission.js`
- Audit helper: `gateway/src/lib/audit/auditLog.js`

## Proposed schema (design only)
Table: `membership_overrides`
- `id uuid primary key`
- `tenant_id uuid not null`
- `user_id uuid null`
- `plan text null`
- `billing_status text not null default 'active'`
- `fee_waived boolean not null default false`
- `waiver_reason text null`
- `promo_code text null`
- `promo_starts_at timestamptz null`
- `promo_expires_at timestamptz null`
- `restored_at timestamptz null`
- `notes text null`
- `created_by uuid not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:
- `(tenant_id, user_id, created_at desc)`
- partial active-override index where `restored_at is null`

## Admin API Contract (design only)
- `POST /api/admin/membership/waive`
- `POST /api/admin/membership/restore`
- `POST /api/admin/membership/promo`

### RBAC and auth requirements
- Require authenticated backend request.
- Require tenant resolution and server-side permission check.
- Require `billing.manage` permission plus superadmin/owner role gate.
- Deny all direct client-side DB override writes.

## Operation semantics
### Waive
- Set `fee_waived=true` with mandatory `waiver_reason`.
- Preserve existing subscription event history.

### Restore
- Set `fee_waived=false`, stamp `restored_at`.
- Do not delete historical override row.

### Promo
- Set `promo_code`, `promo_starts_at`, `promo_expires_at`.
- Promos are time-bounded and auto-expire by time window.

## Audit logging requirements
Every write operation must emit audit event via `logAudit` with:
- actor user id
- tenant id
- operation (`waive|restore|promo`)
- before/after payload snapshot
- reason and notes
- timestamp

## Rollback and safety
- Overrides are additive and reversible.
- Restore endpoint reverts waiver without deleting audit history.
- If override system is disabled, base subscription enforcement remains intact.

## Out of scope for Phase 5
- No automatic migration apply.
- No production API implementation in this phase.
- No Stripe event replay changes.
