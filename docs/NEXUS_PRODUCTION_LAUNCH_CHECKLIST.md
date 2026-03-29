# NEXUS_PRODUCTION_LAUNCH_CHECKLIST

Date: 2026-03-13
Scope: Netlify frontend, Oracle Fastify backend, Supabase, Mac Mini workers, queue, monitoring, credit privacy workflow, research engine, AI cost controls.

Hard constraints:
- No live trading.
- No broker execution.
- No OpenClaw on Oracle control plane.

## Current Readiness Snapshot
Validated during this phase:
- Frontend build: `npm run build` passes.
- Gateway tests: `npm --prefix gateway run test` passes.
- Security hardening commits landed (`321afaf`, `54eb10a`).
- AI cost routing/caching commit landed (`593bfb0`).
- Cleanup audit delivered (`0aa4596`).

Open readiness gap:
- Global `npx tsc --noEmit` still fails due mixed runtime TS targets; must be scoped/split before strict CI gate.

## 1) Required Tasks Before Launch (Blocking)
1. Release branch hygiene
- Create a clean release branch from latest known-good commit.
- Do not deploy from a dirty worktree with unrelated untracked directories.

2. Supabase migration parity
- Confirm linked project migration state includes Phase 6 objects (`job_queue`, `worker_heartbeats`, `ai_cache`, `system_errors`).
- Command:
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux
supabase migration list --linked
```

3. Environment validation (Oracle + Netlify + Mac Mini)
- Validate required envs from `gateway/.env.example` and `docs/env-matrix.md`.
- Confirm production flags:
  - `SYSTEM_MODE=production`
  - `QUEUE_ENABLED` intentional (default false until worker go-live window)
  - `MATRIX_WEBHOOK_TOKEN` set
  - provider keys for selected AI tiers set

4. Backend startup and health gate (Oracle)
- Required checks:
```bash
curl -s http://127.0.0.1:3000/healthz | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/health | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/jobs | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/workers | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" "http://127.0.0.1:3000/api/system/errors?hours=24&limit=50" | jq
```
- Must pass with `ok=true` and no sustained dead-letter growth.

5. Queue worker controlled activation
- Smoke test before production enablement:
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux/gateway
timeout 12 env QUEUE_ENABLED=true SYSTEM_MODE=development WORKER_MAX_CONCURRENCY=2 WORKER_HEARTBEAT_SECONDS=10 npm run queue:worker
```
- In production, enable queue only after health/system checks are green.

6. Research engine read path validation
- Verify tenant-scoped research endpoints:
```bash
base=http://127.0.0.1:3000
tenant_id=<TENANT_UUID>
curl -s -H "x-api-key: $INTERNAL_API_KEY" "$base/api/research/summary?tenant_id=$tenant_id" | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" "$base/api/research/strategy-rankings?tenant_id=$tenant_id&limit=5" | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" "$base/api/research/agent-leaderboard?tenant_id=$tenant_id" | jq
```

7. Credit privacy workflow validation
- Verify credit-related functions and sanitization flow are operational and non-PII-leaking:
  - `supabase/functions/credit-extract-sanitize`
  - `supabase/functions/dispute-letter-generate`
  - `netlify/functions/dispute_letter_pipeline.ts`
- Confirm generated outputs remain educational/draft and approval-mediated.

8. AI cost-control validation
- Confirm `/api/ai/execute` supports retrieval short-circuit, cache hits, and provider fallback.
- Smoke test:
```bash
curl -s -X POST http://127.0.0.1:3000/api/ai/execute \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -d '{"tenant_id":"demo-tenant","task_type":"research_summary","provider":"gemini","prompt":"summarize latest insights","allow_fallback":true}' | jq
```

## 2) Recommended Tasks (Non-Blocking but High Value)
1. Split TS validation by runtime target (web/gateway/supabase-functions) and gate CI per target.
2. Remove tracked placeholder files (`[full_path_of_file_1]`, `[full_path_of_file_2]`) in dedicated cleanup PR.
3. Formalize legacy Netlify endpoint deprecation plan (`send_message`, send aliases, routing wrapper).
4. Add dedicated systemd unit for queue worker on Oracle.
5. Expand `supabase/MIGRATION_INDEX.md` into full project-wide migration map.

## 3) Post-Launch Monitoring Plan

### First 2 Hours
- Every 10 minutes:
  - `/api/system/health`
  - `/api/system/jobs`
  - `/api/system/workers`
  - `/api/system/errors`
- Watch for:
  - `dead_letter_count > 0`
  - stale workers > 0 while queue enabled
  - oldest pending job age increasing continuously

### First 24 Hours
- Hourly:
  - queue depth trend
  - provider failure trend
  - AI cache hit/miss trend
  - research endpoint latency/error rates
- Verify Mac Mini workers are producing artifacts without control-plane coupling.

### Incident Trigger Response
- If instability appears:
  - set maintenance safety profile:
    - `SYSTEM_MODE=maintenance`
    - `QUEUE_ENABLED=false`
    - `AI_JOBS_ENABLED=false`
    - `RESEARCH_JOBS_ENABLED=false`
    - `NOTIFICATIONS_ENABLED=false`
  - restart gateway
  - triage `/api/system/errors`

## 4) Ongoing Maintenance Schedule

### Daily
- Check health/jobs/workers/errors endpoints.
- Review queue backlog and dead-letter counts.
- Confirm key integrations (Twilio/Meta/WhatsApp) are healthy.

### Weekly
- Review retry/dead-letter root causes.
- Verify tenant-scoped research API behavior against sample tenants.
- Run `npm run data:validate` and `npm run data:integrity`.

### Monthly
- Rotate secrets/API keys (Oracle + Netlify + Supabase + Mac Mini).
- Review migration hygiene and archive stale SQL drafts.
- Perform restore drill in non-production.

### Quarterly
- Security re-audit (auth, tenant isolation, webhook trust boundaries).
- Cost optimization review (provider mix, cache TTL effectiveness, token/cost trends).
- Run launch checklist dry-run as game day.

## Go / No-Go Rule
- Go only when all section 1 blockers are complete.
- If any blocker is incomplete, remain No-Go and operate in controlled pre-launch mode.
