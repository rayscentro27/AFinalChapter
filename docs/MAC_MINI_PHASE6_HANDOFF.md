# Mac Mini Phase 6 Handoff

## Windows Side Delivered
- Queue runtime modules (lease/claim/process/retry/heartbeat)
- Worker runtime entrypoint (`npm run queue:worker`)
- System observability endpoint expansion (`/api/system/health`, `/workers`, `/jobs`, `/errors`)
- Error logging helper (`logSystemError`)
- AI cache module + router integration in gateway AI execute path
- Real Supabase migration files created (not pushed/applied)

## What Mac Mini Should Continue Doing
Keep Mac Mini as AI/research worker only:
- research ingestion
- transcript extraction
- clustering/enrichment
- knowledge generation
- replay/performance/optimization labs

Do not move control plane to Mac Mini.

## Expected Tables for Worker/Observability Features
- `job_queue`
- `worker_heartbeats`
- `ai_cache`
- `system_errors`

## Windows Commands Before Mac Mini Resume
From Windows, after migration approval:
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux
supabase db push
```

Then validate gateway:
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux/gateway
set -a; source .env; set +a
npm run start
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/health | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/workers | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/jobs | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/errors | jq
```

## Verified Mac Mini Runtime Baseline (2026-03-13)
- Canonical Mac runtime root is `/Users/raymonddavis/nexus-ai` (not `/opt/nexus-services`).
- LaunchAgents in active use:
  - `ai.openclaw.gateway`
  - `com.nexus.signal-router`
  - `com.raymonddavis.nexus.telegram`
  - `com.raymonddavis.nexus.dashboard`
  - `com.raymonddavis.nexus` (one-shot bootstrap only; no `KeepAlive`)
- OpenClaw gateway healthy on `127.0.0.1:18789` (`/health` returns `ok: true`).
- Local dashboard process healthy on `127.0.0.1:3000`.
- Tailscale peer path confirmed between Windows (`100.78.50.25`) and Mac Mini (`100.89.219.10`).

Admin-only local check on Mac Mini (run manually in local Terminal):
```bash
sudo systemsetup -getremotelogin
```

## Mac Mini First Validation Steps After Reset
1. Run existing research ingestion pipeline against same Supabase project.
2. Confirm new queue/system tables are visible to service-role reads.
3. Confirm no attempts to write control-plane settings from Mac services.
4. Confirm research outputs can be observed from Windows `/api/system/*` endpoints.

## Mac Mini Population Targets
Mac Mini should naturally populate through workflows:
- `job_queue` (if queue enqueue path is enabled)
- `worker_heartbeats` (if worker heartbeat write is enabled)
- `ai_cache` (via gateway ai execution path)
- `system_errors` (on worker/job failures)
