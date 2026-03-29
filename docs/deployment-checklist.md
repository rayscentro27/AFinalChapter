# Nexus Deployment Checklist (Phase 5)

## 1) Code Cleanup Checklist
- [ ] Resolve untracked imports used by tracked code paths.
- [ ] Review untracked backend files and decide keep vs remove.
- [ ] Eliminate remaining noisy runtime `console.log` statements in worker/function paths.
- [ ] Remove or resolve stale TODO/FIXME items in production paths.
- [ ] Ensure no duplicate route ownership between old and v2 admin monitoring flows.

Current high-priority findings:
- `gateway/src/index.js` imports `./routes/tradingview.js`, but that file is currently untracked.
- Phase 2/3/4 modules are currently untracked and should be committed in scoped PRs:
  - `gateway/src/queue/workerLoop.js`
  - `gateway/src/system/logError.js`
  - `gateway/src/ai/cache.js`
  - `gateway/src/ai/router.js`
- Noisy logging to review:
  - `gateway/src/workers/tradingview_enricher.js` (`console.log` summary)
  - `netlify/functions/import_training_bundle.ts` (`console.log` summary)

## 2) Environment and Config Checklist
- [ ] Validate required backend env vars are present.
- [ ] Confirm `SYSTEM_MODE` is one of: `development|research|production|maintenance`.
- [ ] Confirm `QUEUE_ENABLED` defaults to `false` until queue schema is applied and approved.
- [ ] Confirm `ENV_VALIDATE_STRICT` behavior is understood before production enablement.

## 3) Database and Migration Checklist
- [ ] Review and approve SQL drafts before conversion into Supabase migrations.
- [ ] Apply migrations in non-production first.
- [ ] Confirm presence of:
  - `job_queue`
  - `worker_heartbeats`
  - `ai_cache`
  - `system_errors` (enhanced columns)
- [ ] Validate required indexes after migration apply.

## 4) API and Health Checklist
- [ ] `/api/system/health` returns queue/worker/error/ai sections.
- [ ] `/api/system/workers` shows freshness metrics.
- [ ] `/api/system/jobs` shows queue depth and dead-letter count.
- [ ] `/api/system/errors` returns normalized error rows and summary.
- [ ] `/api/ai/execute` returns cache metadata (`hit|miss|stored|bypassed`).

## 5) Worker Readiness Checklist
- [ ] `npm run queue:worker` starts and stops cleanly.
- [ ] Worker respects `QUEUE_ENABLED`, `SYSTEM_MODE`, `WORKER_MAX_CONCURRENCY`.
- [ ] Retry and dead-letter behavior verified with non-critical test jobs.
- [ ] Heartbeats update at 10–15s cadence.

## 6) Membership Billing Override Readiness
- [ ] Confirm superadmin authorization path.
- [ ] Confirm admin-only API design and audit logging design are approved.
- [ ] Confirm reversible override semantics and promo expiry handling.

## 7) Pre-Deploy Verification Commands
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux
node --check gateway/src/index.js
node --check gateway/src/routes/system_health.js
node --check gateway/src/routes/ai_gateway.js
node --check gateway/src/queue/workerLoop.js
node --check gateway/src/system/logError.js
node --check gateway/src/ai/cache.js
node --check gateway/src/ai/router.js

cd gateway
npm test
```

## 8) Launch Blocking Conditions
Do not proceed with production launch if any are true:
- unresolved untracked imports in active code paths
- queue schema missing while `QUEUE_ENABLED=true`
- persistent worker staleness or dead-letter growth
- system errors endpoint returning sustained critical failures
