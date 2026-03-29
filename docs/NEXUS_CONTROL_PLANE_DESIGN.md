# Nexus Control Plane Design

## 1. Executive Summary
Nexus needs an operational command layer that can change runtime behavior without redeploying code. The Control Plane is a low-cost, Supabase-backed policy and safety layer that keeps Fastify as control plane, Supabase as source of truth, and Mac Mini workers as execution nodes.

Primary outcome:
- Operators can throttle, pause, isolate, and recover workers/queues safely.
- AI usage and fallback behavior can be constrained by policy.
- Incident handling becomes command-driven and auditable.

## 2. Control Plane Architecture
Current baseline used:
- Frontend: React admin/client portal on Netlify.
- Backend: Fastify gateway on Oracle VM.
- Data: Supabase Postgres + RLS + Storage.
- Workers: Mac Mini (OpenClaw, ChatGPT login workflows, Comet, optional OpenRouter fallback).

Control Plane pattern:
1. Admin writes control state in Supabase Control Plane tables.
2. Fastify admin routes validate role and write control changes.
3. `/api/system/*` and future `/api/control-plane/*` expose read models.
4. Workers poll control state and apply limits locally.
5. Every state change writes to control-plane audit log.

## 3. System Modes
Recommended modes:
- `development`: all test features available, non-prod defaults.
- `research`: research ingestion on, client-facing automation constrained.
- `production`: normal operations, conservative safeguards enabled.
- `maintenance`: queue intake paused, background jobs mostly off.
- `degraded`: reduced concurrency, expensive AI categories blocked.
- `emergency_stop`: AI and queue execution halted except health + audit.

Mode effects matrix:
- `development`: queue optional, wide feature access.
- `research`: research jobs on, outbound actions off by default.
- `production`: queue on by policy, retries bounded, alerts enabled.
- `maintenance`: queue intake off, read/write admin only.
- `degraded`: queue on with hard caps, fallback providers restricted.
- `emergency_stop`: queue frozen, workers stop claiming new jobs.

## 4. Control Functions
### Worker control
- Pause all workers.
- Pause by worker type.
- Disable job types.
- Lower concurrency ceilings.
- Quarantine unhealthy workers.
- Mark worker unhealthy with reason + expiry.

### Queue control
- Pause intake globally.
- Pause specific job types.
- Cap queue depth per job type.
- Override retry strategy (temporary).
- Auto-route repetitive failures to dead-letter.
- Manual requeue with audit trail.

### AI usage control
- Daily quotas by tenant and job type.
- Force cache-only mode.
- Disable OpenRouter fallback.
- Force OpenClaw-first routing.
- Restrict max transcript payload sizes.
- Disable expensive categories (long synthesis, batch generation).

### Feature flag control
- Toggle transcript ingestion.
- Toggle opportunity engine.
- Toggle VideoContentWorker.
- Toggle content generation/export.
- Toggle admin beta features.

### Incident controls
- Global AI kill switch.
- Disable outbound messaging actions.
- Disable new signups.
- Disable uploads.
- Force selected modules read-only.

## 5. Supabase Schema Design
Existing operational tables already aligned:
- `job_queue`
- `worker_heartbeats`
- `ai_cache`
- `system_errors`

New control-plane tables:

### `system_config`
Purpose: singleton-like runtime config by environment.
Columns:
- `id uuid pk`
- `scope text` (`global`, `tenant`, `worker_group`)
- `scope_id text null`
- `system_mode text`
- `queue_enabled boolean`
- `ai_jobs_enabled boolean`
- `research_jobs_enabled boolean`
- `notifications_enabled boolean`
- `updated_by uuid`
- `updated_at timestamptz`

### `feature_flags`
Purpose: dynamic feature toggles.
Columns:
- `id uuid pk`
- `flag_key text unique`
- `enabled boolean`
- `scope text`
- `scope_id text null`
- `rollout_pct int null`
- `expires_at timestamptz null`
- `updated_by uuid`
- `updated_at timestamptz`

### `worker_controls`
Purpose: per-worker policies.
Columns:
- `id uuid pk`
- `worker_type text`
- `worker_id text null`
- `paused boolean`
- `max_concurrency int`
- `job_types_disabled text[]`
- `quarantine_reason text null`
- `quarantine_until timestamptz null`
- `updated_by uuid`
- `updated_at timestamptz`

### `queue_controls`
Purpose: queue safety and throttles.
Columns:
- `id uuid pk`
- `job_type text`
- `intake_paused boolean`
- `queue_depth_cap int`
- `retry_multiplier numeric`
- `max_attempts_override int null`
- `dead_letter_on_error_rate numeric null`
- `updated_by uuid`
- `updated_at timestamptz`

### `ai_usage_limits`
Purpose: AI budget policy.
Columns:
- `id uuid pk`
- `scope text`
- `scope_id text null`
- `provider text`
- `task_type text`
- `daily_request_limit int`
- `daily_token_limit int`
- `force_cache_only boolean`
- `fallback_allowed boolean`
- `updated_by uuid`
- `updated_at timestamptz`

### `incident_events`
Purpose: incident state timeline.
Columns:
- `id uuid pk`
- `severity text`
- `status text`
- `title text`
- `details jsonb`
- `started_at timestamptz`
- `resolved_at timestamptz null`
- `owner_user_id uuid null`

### `control_plane_audit_log`
Purpose: immutable operational audit.
Columns:
- `id uuid pk`
- `actor_user_id uuid`
- `actor_role text`
- `action text`
- `target_type text`
- `target_id text`
- `before_state jsonb`
- `after_state jsonb`
- `reason text`
- `created_at timestamptz`

## 6. Worker Integration Model
Worker fetch cycle:
- Poll effective control state every 10-15s.
- Cache settings in memory for 30s.
- Refresh immediately after lease failures.

Fail-safe behavior:
- If control fetch fails: do not increase concurrency; keep last known safe policy.
- If policy is stale > 5m: auto-enter reduced mode (`concurrency=1`, no expensive tasks).
- If `emergency_stop`: finish current step safely, stop claiming new jobs.

## 7. Admin Dashboard Design
Sections:
- Mode & Safeguards: mode selector, global toggles.
- Worker Health: heartbeat freshness, quarantined workers.
- Queue Operations: queue depth, per job-type intake control.
- AI Controls: cache-only toggle, provider fallback policy, usage limits.
- Feature Flags: scoped toggles with expiration.
- Incident Panel: start/resolve incidents, kill switches.
- Audit Log: who changed what and why.
- Testing & Simulation: run user/load/chaos tests with stop controls.

Safety confirmations:
- Two-step confirmation for `maintenance`, `degraded`, `emergency_stop`.
- Reason required for dangerous operations.
- Automatic expiry for temporary overrides.

## 8. Safety and Permission Model
Role policy:
- `superadmin`: full control plane actions.
- `admin`: bounded actions (no emergency stop unless delegated).
- `analyst/operator`: read-only or simulation-only by policy.

Rules:
- Every write action is audit-logged.
- Production toggles require explicit confirmation text.
- Emergency actions must include expiry/review.
- Tenant-scoped actions cannot override global hard-stops.

## 9. Incident Response Controls
Standard actions:
1. Set `system_mode=degraded`.
2. Disable affected job types.
3. Cap worker concurrency.
4. Disable fallback providers if failures spike.
5. Freeze queue intake if dead-letter surges.
6. Set `system_mode=maintenance` or `emergency_stop` if blast radius increases.

## 10. Testing and Simulation Model
### User simulation
- Simulate signup/login/upload/AI flows with synthetic tenant data only.
- Parameters: simulated users, actions/user, duration, request rate.

### Load testing
- Burst queue jobs and API read requests.
- Validate queue depth controls, stale worker detection, and retry behavior.

### Chaos testing
- Simulate worker crash.
- Simulate OpenClaw session expiry.
- Simulate DB connectivity failures.
- Simulate API provider rate limits.

Safety for tests:
- Test data isolated from client production records.
- Every simulation tagged and logged.
- Immediate stop button in dashboard.

## 11. Phased Roadmap
Phase 1:
- Control tables + read models + audit log.
- Dashboard mode panel + worker/queue visibility.

Phase 2:
- Write controls (worker/queue/feature flags).
- AI usage policy enforcement.

Phase 3:
- Incident workflows + simulation tooling.
- Launch readiness widgets and runbook links.

## 12. Launch Priority Recommendations
Highest priority before broad launch:
1. `system_mode` + queue/worker controls + audit logging.
2. kill switch + degraded mode flow.
3. AI fallback/cost controls.
4. simulation controls (at least user/load v1).
