# Nexus Production Runbook (Phase 5)

## Scope
This runbook covers production-safe operations for the Fastify gateway control plane, queue workers, and system observability endpoints.

Constraints:
- Supabase remains source of truth.
- Fastify remains control plane.
- No automatic deployment from this runbook.
- Queue features remain flag-controlled.

## Runtime Modes and Safety Flags
Use these backend flags to control behavior:
- `SYSTEM_MODE=development|research|production|maintenance`
- `QUEUE_ENABLED`
- `AI_JOBS_ENABLED`
- `RESEARCH_JOBS_ENABLED`
- `NOTIFICATIONS_ENABLED`
- `WORKER_MAX_CONCURRENCY`
- `WORKER_HEARTBEAT_SECONDS`
- `JOB_MAX_RUNTIME_SECONDS`
- `TENANT_JOB_LIMIT_ACTIVE`

Recommended emergency profile:
- `SYSTEM_MODE=maintenance`
- `QUEUE_ENABLED=false`
- `AI_JOBS_ENABLED=false`
- `RESEARCH_JOBS_ENABLED=false`
- `NOTIFICATIONS_ENABLED=false`

## Startup and Smoke Validation
Gateway startup:
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux/gateway
set -a; source .env; set +a
npm run start
```

System checks:
```bash
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/health | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/workers | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/jobs | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/errors | jq
```

Queue worker smoke run:
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux/gateway
set -a; source .env; set +a
timeout 12 env QUEUE_ENABLED=true SYSTEM_MODE=development WORKER_MAX_CONCURRENCY=2 WORKER_HEARTBEAT_SECONDS=10 npm run queue:worker
```

## Operational Monitoring Plan
Monitor these metrics continuously:
- Queue depth (`pending`, `running`, `dead_letter`)
- Worker freshness (`fresh_count`, `stale_count`, `freshness_ratio`)
- Oldest pending job age
- Recent system error volume and top failing job types
- AI cache metrics (`cache_hit`, `cache_miss`, `cache_write`, `cache_error`)

Suggested alert thresholds:
- `dead_letter_count > 0`
- `oldest_pending_age > 15m` in production
- `stale_count > 0` while queue is enabled
- repeated `worker_tick_failed` or `worker_crash_*` errors in `/api/system/errors`

## Incident Response
1. Confirm mode and safety flags from `/api/system/health`.
2. If instability is active, switch to maintenance profile.
3. Triage `/api/system/errors` for dominant `error_type` and affected `job_type`.
4. Validate worker heartbeat freshness.
5. Re-enable features incrementally after root cause is isolated.

## Rollback Strategy
Use configuration rollback before code rollback:
1. Disable queue and AI jobs using flags.
2. Restart gateway.
3. Verify `/api/system/health` returns stable values.
4. If code rollback is required, revert only latest phase-specific files and retest endpoints.

## Audit and Billing Governance
For future membership override APIs:
- enforce server-side permission checks (`billing.manage` + superadmin guard)
- log every mutation using `logAudit` helper in `gateway/src/lib/audit/auditLog.js`
- ensure operations are reversible and time-bounded

## Safe Pause/Resume Automation (E2)
Use the scripted operator command set for incident containment:

```bash
cd /home/rayscentro/Projects/AFinalChapter_linux/gateway
export SYSTEM_API_BASE_URL="http://127.0.0.1:3000"
export INTERNAL_API_KEY="<INTERNAL_API_KEY>"
export TENANT_ID="<TENANT_UUID>"
export REAL_USER_BEARER_TOKEN="<REAL_USER_JWT>"

npm run system:diagnostics
npm run system:safe-pause
npm run system:diagnostics
npm run system:safe-resume
npm run system:diagnostics
```

Endpoint mapping used by the script:
- `POST /api/system/safe-pause`
- `POST /api/system/safe-resume`
- `POST /api/system/mode/set`
- `POST /api/system/flags/update`
- `GET /api/system/health`
- `GET /api/system/jobs`
- `GET /api/system/workers`
- `GET /api/system/errors`
