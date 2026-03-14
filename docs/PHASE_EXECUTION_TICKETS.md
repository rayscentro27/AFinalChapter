# Nexus Phase Execution Tickets

Status: implementation planning only. Additive, non-destructive.

Dependencies:
- PR #17: VideoContentWorker scaffold + OpenClaw operational rules
- PR #18: Monitoring system design + OpenRouter integration + control-plane design

Merge order before implementation:
1. PR #17
2. PR #18
3. This ticket PR

## Phase A — VideoContentWorker Enablement

### Ticket A1: Direct-Run Draft Generation (Mac Mini)
Goal:
- Produce draft video artifacts from tenant-scoped inputs.

Scope:
- Use `opt/nexus-services/video-content-worker/worker.js` in `--once --dry-run` mode first.
- Then run non-dry mode for test tenant only.

Acceptance Criteria:
- Draft artifacts created with `status=draft` metadata.
- No auto-publish behavior.
- No tenant cross-read.

Validation Commands:
```bash
cd /opt/nexus-services/video-content-worker
npm run check
node worker.js --once --tenant <TENANT_UUID> --dry-run
node worker.js --once --tenant <TENANT_UUID>
```

### Ticket A2: Queue-Mode Video Jobs
Goal:
- Enable queue-dispatched video job processing safely.

Scope:
- Use job types defined in design doc.
- Respect `VIDEO_WORKER_QUEUE_ENABLED` and lease/retry semantics.

Acceptance Criteria:
- Worker claims only pending/retry jobs.
- Failed jobs transition to retry/dead-letter by policy.

Validation Commands:
```bash
VIDEO_WORKER_QUEUE_ENABLED=true node worker.js --once --queue --dry-run
```

### Ticket A3: Review Workflow Integration
Goal:
- Ensure generated outputs are review-gated.

Scope:
- Store draft outputs in existing `research_artifacts` until dedicated review schema is approved.

Acceptance Criteria:
- Draft status explicit in metadata.
- Manual approval required before any publish handoff.

## Phase B — Monitoring Endpoint Expansion

### Ticket B1: `/api/system/usage` Endpoint
Goal:
- Return AI usage, token, cache, and cost telemetry.

Scope:
- Read-only endpoint in Fastify gateway.
- Use existing tables (`ai_cache`, `system_errors`, job telemetry).

Acceptance Criteria:
- Endpoint returns stable JSON for empty and populated states.
- No writes performed.

### Ticket B2: `/api/system/ingestion` Endpoint
Goal:
- Monitor transcript/research ingestion health.

Scope:
- Aggregate from transcript/research tables.

Acceptance Criteria:
- Includes counts, failures, recency timestamps.

### Ticket B3: `/api/system/opportunities` and `/api/system/video-worker`
Goal:
- Surface opportunity and video worker throughput.

Acceptance Criteria:
- Empty-safe responses.
- Tenant-safe read filters.

## Phase C — Alerting and Dashboard Operations

### Ticket C1: Alert Threshold Implementation
Goal:
- Encode warning/critical thresholds defined in monitoring design.

Scope:
- Start with log/Telegram alerting from existing worker framework.

Acceptance Criteria:
- Alerts generated for stale workers, dead-letter growth, queue spikes.

### Ticket C2: Ops Dashboard Panels
Goal:
- Add admin-facing panels for queue/workers/errors/usage.

Scope:
- Reuse existing admin pages; add read-only sections first.

Acceptance Criteria:
- Panels load without data assumptions.
- Uses system endpoints only.

## Phase D — OpenRouter Policy Integration

### Ticket D1: Router Policy Guardrails
Goal:
- Enforce backend-only OpenRouter eligibility checks.

Scope:
- Task allow/deny policy.
- Input size and retry caps.

Acceptance Criteria:
- Disallowed tasks are blocked with explicit reason.
- Eligible tasks route via OpenRouter fallback path.

### Ticket D2: Cache-First OpenRouter Flow
Goal:
- Reduce cost with cache-first behavior.

Scope:
- Check `ai_cache` before OpenRouter call.
- Persist safe cached responses on success.

Acceptance Criteria:
- Cache hit/miss metrics visible in system endpoints.

## Phase E — Control Plane Enforcement

### Ticket E1: Mode and Flag Write Endpoints (Admin)
Goal:
- Safely control system flags and mode transitions.

Scope:
- Add authenticated admin endpoints:
  - `POST /api/system/mode/set`
  - `POST /api/system/flags/update`
  - `POST /api/system/safe-pause`
  - `POST /api/system/safe-resume`

Acceptance Criteria:
- Audit log for every write action.
- Role/permission checks enforced.

### Ticket E2: Safe Pause/Resume Playbook Automation
Goal:
- Standardize incident containment steps.

Scope:
- Scripted operator command set for pause/resume.

Acceptance Criteria:
- Repeatable and reversible.
- Verified against `/api/system/*` diagnostics.

## Security and Compliance Checklist (All Phases)

- No OpenClaw on Oracle control plane.
- No live trading or broker execution.
- No client PII to external AI providers.
- Server-side tenant enforcement for all endpoints.
- AI outputs remain drafts until approved.

## Suggested PR Split

PR 1:
- Video worker runtime hardening (Phase A)

PR 2:
- Monitoring endpoint expansion (Phase B/C)

PR 3:
- OpenRouter policy + cache guardrails (Phase D)

PR 4:
- Control-plane write endpoints + audit logging (Phase E)

## Operator Run Sequence (After Each PR)

```bash
# gateway checks
cd /home/rayscentro/Projects/AFinalChapter_linux/gateway
npm run test
npm run start

curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/health | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/jobs | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/workers | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" "http://127.0.0.1:3000/api/system/errors?hours=24&limit=50" | jq
```
