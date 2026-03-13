# Production Hardening Audit (Nexus)

## A. Executive summary
Nexus already has a strong baseline (tenant auth/RLS, Fastify control plane, Supabase core, Mac research node separation). Primary launch risk is operational maturity: no standardized job queue foundation, incomplete env governance, and missing unified system health endpoints.

## B. Current risks
- Async pipelines rely on mixed ad-hoc workers instead of one queue lifecycle.
- Env validation exists but is fragmented and partially implicit.
- Limited global visibility for queue depth/worker freshness/error rates.
- AI cache layer is not centralized for cost control.
- Membership billing override/promo logic is not centralized + auditable.

## C. Recommended architecture additions
- Supabase-first queue tables + heartbeat + system_errors.
- Env matrix + startup validation policy.
- AI cache table with tenant/task scoped keys.
- `/api/system/*` observability endpoints.
- Controlled worker modes and kill switches.

## D. Production launch blockers
- No approved queue schema contract.
- No canonical worker liveness contract.
- No single health endpoint for launch readiness checks.
- No documented env matrix across Netlify/Oracle/Mac Mini.

## E. Ordered implementation roadmap
1. Queue + worker heartbeat schema approval.
2. Env validation strict mode rollout.
3. `/api/system/health` + workers/jobs/errors endpoints.
4. AI cache introduction in model router path.
5. Membership override + promo + audit trail.

## F. Quick wins (7 days)
- Land Phase 1 scaffolding (this pass).
- Add `/api/system/workers`, `/api/system/jobs`, `/api/system/errors` read-only routes.
- Add queue depth alerting thresholds.
- Add cache hit-rate telemetry fields.

## G. Proposed database schema changes
Planned (draft-only in Phase 1 docs):
- `job_queue`
- `worker_heartbeats`
- `system_errors`
Future:
- `ai_cache`
- `membership_overrides` (or extension of existing membership contract tables)

## H. Proposed API endpoint contracts
- `GET /api/system/health` (implemented scaffold)
- `GET /api/system/workers` (planned)
- `GET /api/system/jobs` (planned)
- `GET /api/system/errors` (planned)

## I. Proposed worker behavior rules
- Claim only `pending|retry_wait` jobs where `available_at <= now`.
- Lease jobs with explicit expiry and worker_id.
- Heartbeat every `WORKER_HEARTBEAT_SECONDS`.
- Retry exponential backoff; move to dead letter at `attempt_count >= max_attempts`.
- Enforce max runtime + tenant active-job caps.

## J. Suggested file/module structure
- `gateway/src/config/envValidation.js` (implemented)
- `gateway/src/queue/claimJobs.js` (implemented scaffold)
- `gateway/src/queue/processJob.js` (implemented scaffold)
- `gateway/src/queue/retryPolicy.js` (implemented)
- `gateway/src/queue/heartbeat.js` (implemented)
- `gateway/src/routes/system_health.js` (implemented)
- `docs/env-matrix.md` (implemented)
- `docs/ops-runbook.md` (implemented)

## K. Suggested phased tickets
1. Approve + migrate Phase 1 SQL drafts.
2. Add queue worker loop with feature flags off by default.
3. Add `system/workers|jobs|errors` endpoints.
4. AI cache schema + router lookup integration.
5. Membership fee waiver + promo APIs + audit controls.

## L. Code cleanup / stabilization checklist
- Remove duplicated tenant lookup patterns by shared helper.
- Consolidate repeated internal API key guards.
- Standardize missing-schema handling in route helpers.
- Normalize env docs with one matrix source.

## M. Membership billing override design
- Keep Stripe/subscription source intact; add override layer:
  - `fee_waived`, `waiver_reason`, `promo_code`, `promo_starts_at`, `promo_expires_at`, `restored_at`, `notes`.
- Require superadmin role and audit log for every override mutation.
- Make overrides reversible and time-bounded by default.
