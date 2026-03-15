# Nexus Database Permission Leak Audit

## Scope
Tenant isolation, service-role usage, and query pathways touching multi-tenant data.

## Findings Summary
No confirmed cross-tenant leak observed in this audit pass, but several controls require disciplined enforcement and verification evidence.

## High-Risk Areas to Validate Continuously
1. Service-role query scope
- Service-role access must always include explicit tenant filtering in backend logic.

2. Admin endpoint tenant checks
- Every admin route should bind to `tenant_id` with role/permission guards.

3. Storage object access
- Validate bucket/object policies for tenant scoping and signed URL usage.

4. RLS drift
- RLS policy changes must be migration-reviewed and tested in a preflight check.

## Required Verification Steps
- Run RLS smoke tests for read/write across two test tenants.
- Confirm denied access for cross-tenant token.
- Confirm backend rejects missing `tenant_id` in protected routes.

## Recommended Controls
- Add automated tenant-isolation regression test suite.
- Add policy diff checks in CI for Supabase schema changes.
- Keep service-role use centralized in backend only.
