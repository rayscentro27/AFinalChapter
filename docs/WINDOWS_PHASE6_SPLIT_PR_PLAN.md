# Windows Phase 6 Split PR Plan

## Goal
Land queue/runtime hardening safely in small, reviewable PRs while avoiding unrelated dirty files.

## PR 1: Queue Activation Core
Scope:
- `gateway/src/queue/claimJobs.js`
- `gateway/src/queue/processJob.js`
- `gateway/src/queue/retryPolicy.js`
- `gateway/src/queue/heartbeat.js`
- `gateway/src/queue/workerLoop.js`
- `gateway/src/queue/index.js`
- `gateway/src/workers/queue_worker.js`
- `gateway/package.json`

Suggested commands:
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux
git add gateway/src/queue/claimJobs.js gateway/src/queue/processJob.js gateway/src/queue/retryPolicy.js gateway/src/queue/heartbeat.js gateway/src/queue/workerLoop.js gateway/src/queue/index.js gateway/src/workers/queue_worker.js gateway/package.json
git commit -m "Phase 2 queue activation: worker loop, leasing, retries, heartbeat"
```

## PR 2: Observability + Error Tracking
Scope:
- `gateway/src/system/logError.js`
- `gateway/src/routes/system_health.js`
- `docs/sql_drafts/phase3_system_errors_schema.sql`

Suggested commands:
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux
git add gateway/src/system/logError.js gateway/src/routes/system_health.js docs/sql_drafts/phase3_system_errors_schema.sql
git commit -m "Phase 3 observability: system error logging and diagnostics endpoints"
```

## PR 3: AI Cache Integration
Scope:
- `gateway/src/ai/cache.js`
- `gateway/src/ai/router.js`
- `gateway/src/routes/ai_gateway.js`

Suggested commands:
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux
git add gateway/src/ai/cache.js gateway/src/ai/router.js gateway/src/routes/ai_gateway.js
git commit -m "Phase 4 AI cache: cache module and router integration"
```

## PR 4: Real Supabase Migrations from Approved Drafts
Scope:
- `supabase/migrations/20260313010100_phase6_job_queue.sql`
- `supabase/migrations/20260313010200_phase6_worker_heartbeats_and_system_errors_legacy.sql`
- `supabase/migrations/20260313010300_phase6_ai_cache.sql`
- `supabase/migrations/20260313010400_phase6_system_errors_enhanced.sql`

Suggested commands:
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux
git add supabase/migrations/20260313010100_phase6_job_queue.sql supabase/migrations/20260313010200_phase6_worker_heartbeats_and_system_errors_legacy.sql supabase/migrations/20260313010300_phase6_ai_cache.sql supabase/migrations/20260313010400_phase6_system_errors_enhanced.sql
git commit -m "Phase 6 migrations: queue, heartbeats, ai_cache, enhanced system_errors"
```

## Verification Gate for Each PR
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux
node --check gateway/src/routes/system_health.js || true
node --check gateway/src/routes/ai_gateway.js || true
node --check gateway/src/queue/workerLoop.js || true
node --check gateway/src/system/logError.js || true
node --check gateway/src/ai/cache.js || true
node --check gateway/src/ai/router.js || true

cd gateway
npm test
```

## Do Not Stage
Keep these out of Phase 6 PRs unless explicitly requested:
- frontend/app changes (`App.tsx`, `components/*`, `types.ts`, etc.)
- Netlify/Oracle unrelated edits
- large untracked service directories (`opt/nexus-services/*`, `lead_intelligence/*`, etc.)
