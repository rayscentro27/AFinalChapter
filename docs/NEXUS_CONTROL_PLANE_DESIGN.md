# Nexus Control Plane Design

Status: architecture and operations design. No automatic deployment or schema execution.

## Objective
Define a safe control plane for:
- worker orchestration controls
- AI cost limits
- feature flags
- system modes
- incident containment

Keep current architecture:
- Fastify on Oracle = control plane
- Supabase = source of truth
- Mac Mini = worker/research execution node

## 1) Control Plane Responsibilities

- centralized feature-flag policy enforcement
- system mode transitions
- queue and worker gating
- AI routing and budget policy checks
- observability aggregation
- incident safe-mode controls

## 2) System Modes

Supported modes:
- `development`
- `research`
- `production`
- `maintenance`

Mode behavior matrix:
- `development`: relaxed limits, test-only tenants
- `research`: research jobs enabled, CRM-impacting automations constrained
- `production`: strict policy, full monitoring and guarded throughput
- `maintenance`: queue paused, async jobs disabled, diagnostics only

## 3) Feature Flags (Authoritative Set)

Core flags:
- `QUEUE_ENABLED`
- `AI_JOBS_ENABLED`
- `RESEARCH_JOBS_ENABLED`
- `NOTIFICATIONS_ENABLED`
- `TENANT_JOB_LIMIT_ACTIVE`

Runtime caps:
- `WORKER_MAX_CONCURRENCY`
- `JOB_MAX_RUNTIME_SECONDS`
- `WORKER_HEARTBEAT_SECONDS`

AI policy flags (recommended):
- `OPENROUTER_ENABLED`
- `AI_CACHE_ENABLED`
- `PREMIUM_MODEL_ENABLED`

## 4) Control Plane API Contracts (Read/Write)

Read-only:
- `GET /api/system/health`
- `GET /api/system/jobs`
- `GET /api/system/workers`
- `GET /api/system/errors`
- `GET /api/system/usage` (recommended)

Admin write endpoints (recommended):
- `POST /api/system/flags/update`
- `POST /api/system/mode/set`
- `POST /api/system/safe-pause`
- `POST /api/system/safe-resume`

All write endpoints must require:
- strong admin auth
- tenant/platform scope validation
- audit logging

## 5) Worker Lifecycle Governance

For every worker type:
- enforce lease claim semantics
- enforce heartbeat freshness
- enforce retry/dead-letter policy
- enforce max runtime
- enforce per-mode permissions

Control plane must be able to:
- pause only selected worker classes
- drain low-priority queues first
- resume in staged order

## 6) AI Cost Guardrail Policy

Per-tenant and global envelopes:
- requests/day
- tokens/day
- estimated cost/day

Actions on threshold breach:
1. move to cache-first strict mode
2. disable premium model tier
3. defer low-priority AI jobs
4. escalate alert and require admin acknowledgement

## 7) Safe Pause and Resume Protocol

Safe pause:
1. set `SYSTEM_MODE=maintenance`
2. set `QUEUE_ENABLED=false`
3. set `RESEARCH_JOBS_ENABLED=false`
4. keep health endpoints active
5. verify queue depth trend and worker stop state

Safe resume:
1. set target mode (`research` or `production`)
2. enable `QUEUE_ENABLED=true`
3. re-enable AI/research flags in order
4. verify worker freshness and dead-letter trend

## 8) Control Plane Data Model (Optional Additive)

Optional tables (drafts):
- `system_feature_flags`
  - current flag values and source of change
- `system_mode_history`
  - mode transitions with actor + reason
- `system_policy_events`
  - guardrail actions triggered by thresholds

If these tables are not added yet, persist changes via existing audit/event logs.

## 9) Security and Privacy Rules

- server-enforced tenant boundary checks only
- no client-side trust for control-plane actions
- redact secrets and PII in logs
- AI outputs remain draft unless approved
- never route sensitive credit PII to external model providers

## 10) Operational Dashboard Requirements

Essential control plane dashboard sections:
- Mode + Flag state
- Queue/Worker health
- Error and dead-letter trends
- AI usage + budget posture
- Incident controls (safe pause/resume)

## 11) Rollout Plan

Phase A:
- finalize policy docs and endpoint contracts
- keep flags env-driven

Phase B:
- add admin write endpoints with audit logging
- add UI controls for mode/flags

Phase C:
- add automated threshold triggers + policy events
- add weekly policy compliance report

## 12) Hard Boundaries

- Mac Mini does not become control plane.
- Supabase remains source of truth.
- No OpenClaw deployment into Oracle control plane.
- No live trading and no broker execution.
