# Ops Runbook (Phase 1 Scaffolding)

## Scope
Phase 1 adds scaffolding only:
- Queue module skeletons
- Worker heartbeat module skeleton
- `/api/system/health` endpoint scaffold
- SQL drafts under `docs/sql_drafts/`

No migrations are auto-applied in this phase.

## Startup checks
1. Validate env:
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux/gateway
npm run start
```
2. Confirm env validation warnings/errors are visible at startup logs.

## Health endpoint check
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux/gateway
set -a; source .env; set +a
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/health | jq
```

Expected:
- `ok: true`
- queue/worker/error sections present
- `missing_tables` may list draft tables until schema is approved and applied.

## Safety controls
Runtime flags:
- `SYSTEM_MODE`
- `QUEUE_ENABLED`
- `AI_JOBS_ENABLED`
- `RESEARCH_JOBS_ENABLED`
- `NOTIFICATIONS_ENABLED`
- `JOB_MAX_RUNTIME_SECONDS`
- `WORKER_MAX_CONCURRENCY`
- `TENANT_JOB_LIMIT_ACTIVE`

## Next step after approval
1. Approve SQL drafts.
2. Convert drafts into Supabase migrations.
3. Enable queue worker polling in controlled mode (`QUEUE_ENABLED=true`) for one tenant.
4. Observe `/api/system/health` and error trends.

## Watchdog v1 checks
Once watchdog migration is applied, verify:
```bash
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/worker-sessions | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/worker-session-events | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/control-plane/state | jq '.summary_metrics'
```

Manual operator controls:
```bash
curl -s -X POST -H "content-type: application/json" -H "x-api-key: $INTERNAL_API_KEY" \
  -d '{"reason":"manual quarantine","worker_type":"openclaw_worker"}' \
  http://127.0.0.1:3000/api/control-plane/workers/<WORKER_ID>/quarantine | jq

curl -s -X POST -H "content-type: application/json" -H "x-api-key: $INTERNAL_API_KEY" \
  -d '{"reason":"probe healthy","fresh_probe_passed":true}' \
  http://127.0.0.1:3000/api/control-plane/workers/<WORKER_ID>/release | jq
```
