# Queue Operations Runbook (Phase 5)

## Queue Lifecycle States
- `pending`
- `leased`
- `running`
- `retry_wait`
- `completed`
- `failed`
- `dead_letter`
- `cancelled`

## Worker Commands
Start gateway:
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux/gateway
set -a; source .env; set +a
npm run start
```

Run queue worker (flag-controlled):
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux/gateway
set -a; source .env; set +a
npm run queue:worker
```

Bounded smoke run:
```bash
timeout 12 env QUEUE_ENABLED=true SYSTEM_MODE=development WORKER_MAX_CONCURRENCY=2 WORKER_HEARTBEAT_SECONDS=10 npm run queue:worker
```

## Operational Checks
- Worker freshness:
```bash
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/workers | jq
```

- Queue depth and dead-letter:
```bash
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/jobs | jq
```

- Error visibility:
```bash
curl -s -H "x-api-key: $INTERNAL_API_KEY" "http://127.0.0.1:3000/api/system/errors?hours=24&limit=50" | jq
```

## Retry and Dead-Letter Policy
- Backoff: exponential with jitter.
- `attempt_count` increments per failure.
- If `attempt_count >= max_attempts`, job transitions to `dead_letter`.
- Failed/retry/dead-letter events are logged to system error tracking when schema exists.

## Stale Worker and Lease Handling
- Worker heartbeat interval is clamped to 10–15 seconds.
- Staleness is derived from `last_seen_at` cutoff.
- Lease safety fields:
  - `leased_at`
  - `lease_expires_at`
  - `worker_id`

## Safe Pause / Resume
Pause:
- set `QUEUE_ENABLED=false`
- optionally set `SYSTEM_MODE=maintenance`
- restart gateway and workers

Resume:
- switch to `SYSTEM_MODE=production` (or desired mode)
- set `QUEUE_ENABLED=true`
- restart worker
- monitor queue + errors endpoints

## Failure Triage Sequence
1. Check `/api/system/health` safety flags.
2. Check `/api/system/jobs` dead-letter and oldest pending.
3. Check `/api/system/workers` freshness.
4. Check `/api/system/errors` top failing job types.
5. Disable queue if failure rate is escalating.
