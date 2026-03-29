# Nexus OpenClaw Worker Operational Rules

Status: operational policy and runbook only. No deployment or infrastructure changes.

## Scope
Applies to Mac Mini worker execution for:
- OpenClaw (ChatGPT login workflows)
- Comet browser research
- transcript ingestion
- opportunity discovery

Architecture boundaries:
- Fastify on Oracle remains control plane.
- Supabase remains source of truth.
- Mac Mini remains worker/research node only.
- No live trading, no broker execution.

## 1) Worker Polling Frequency

Queue-aware workers:
- Poll interval: every 10-15 seconds.
- Use jitter (+/- 2 seconds) to avoid synchronized bursts.
- Never poll faster than every 5 seconds.

Direct-run workers:
- Run by explicit trigger (cron/manual), not tight loops.
- Recommended cadence for ingestion/research: 5-15 minutes.

## 2) Lease Handling Rules

When claiming queue jobs:
- Claim only statuses: `pending`, `retry_wait`.
- Require `available_at <= now()`.
- On claim set:
  - `worker_id`
  - `leased_at`
  - `lease_expires_at`
  - `status='leased'`

Lease durations:
- Default lease: 5 minutes for lightweight tasks.
- Long-running browser tasks: up to 15 minutes, renew every heartbeat.

Worker must transition:
- `leased -> running` when execution starts.
- `running -> completed` on success.
- `running -> retry_wait` on retryable failure.
- `running -> failed/dead_letter` on terminal failure.

## 3) Retry and Backoff Rules

Retry policy:
- Exponential backoff with jitter.
- Respect `max_attempts` per job.
- On each retry increment `attempt_count`.

Recommended schedule:
- Attempt 1 retry: 30-60s
- Attempt 2 retry: 2-4m
- Attempt 3 retry: 5-10m
- Attempt 4+: 15-30m (bounded)

Dead-letter transition:
- Move to `dead_letter` when `attempt_count >= max_attempts`.
- Attach `last_error`, `trace_id`, and minimal context.

## 4) Stale Job Recovery

Stale job definition:
- `status in ('leased','running')` and `lease_expires_at < now()`.

Recovery behavior:
- Requeue stale jobs to `retry_wait` with backoff.
- Increment `attempt_count`.
- Preserve previous `worker_id` in metadata.
- Never delete stale jobs automatically.

## 5) Worker Heartbeats

Heartbeat interval:
- Every 10-15 seconds while running.

Heartbeat payload should include:
- `worker_id`
- `worker_type`
- `status`
- `system_mode`
- `current_job_id`
- `in_flight_jobs`
- `max_concurrency`
- `last_seen_at`

Freshness SLO:
- Worker is stale if no heartbeat for > 60 seconds.
- Alert when stale workers > 0 while queue is enabled.

## 6) Crash Recovery Rules

On uncaught exception/unhandled rejection:
- Log to `system_errors` with component, error_type, stack.
- Mark any active job as `retry_wait` unless non-retryable.
- Exit process (fail fast), rely on supervisor restart.

Restart strategy:
- Process supervisor should restart worker with backoff.
- If 3+ crashes within 10 minutes, auto-disable worker group via flags and escalate.

## 7) Queue Backpressure Handling

Backpressure thresholds (initial):
- Warning: pending depth > 100
- Critical: pending depth > 500
- Critical: dead-letter growth trend > 10/hour

Backpressure responses:
1. Reduce intake from non-critical producers.
2. Pause low-priority job types.
3. Keep high-priority user-impact jobs flowing.
4. If worsening, set:
   - `RESEARCH_JOBS_ENABLED=false`
   - keep core control-plane endpoints online.

## 8) Worker Concurrency and Rate Limits

Concurrency rules:
- Per worker default concurrency: 1-2 for browser-heavy flows.
- Global max via `WORKER_MAX_CONCURRENCY`.

Provider/browser limits:
- Max OpenClaw sessions in parallel: 1 per worker process.
- Max Comet browser tasks in parallel: 1-2.
- Per-job runtime cap via `JOB_MAX_RUNTIME_SECONDS`.

Circuit breakers:
- If provider/browser failure rate > 50% in last 20 runs, pause that job type for cooldown window.

## 9) Transcript Ingestion Safety Rules

Input safety:
- Enforce size limits on transcript text.
- Drop binary/non-text payloads.
- Sanitize control characters and malformed encodings.

Content safety:
- Strip or mask obvious PII before enrichment/generation.
- Store raw source references and derived summaries separately.
- Mark uncertain extraction as `needs_review`.

Idempotency:
- Deduplicate by transcript source key/video_id/hash.
- Avoid repeated ingestion of same artifact.

## 10) Browser Automation Safety Rules (OpenClaw/Comet)

Allowed:
- Research reads, transcript extraction, summarization, opportunity discovery.

Forbidden:
- Any broker execution flow.
- Any live trading action.
- Any credentials exfiltration or account setting mutation.
- Any client PII submission to external forms/tools.

Session safety:
- Use dedicated worker profiles.
- Rotate/re-auth as needed; do not persist secrets in code.
- Redact secrets and tokens from logs.

## 11) Guardrails Against Runaway Usage

Runaway prevention:
- Per-worker max jobs/hour.
- Per-tenant max jobs/hour (`TENANT_JOB_LIMIT_ACTIVE`).
- Per-job token/time budget.
- Kill switch flags:
  - `QUEUE_ENABLED`
  - `AI_JOBS_ENABLED`
  - `RESEARCH_JOBS_ENABLED`
  - `NOTIFICATIONS_ENABLED`

Automatic throttling triggers:
- Sustained queue growth + stale workers.
- Elevated error rate from `/api/system/errors`.
- Cache miss spikes with increased AI cost.

## 12) Duplicate Processing Prevention

Required controls:
- `dedupe_key` at queue write time when possible.
- Lease-based claim (single active worker per job).
- Idempotent handlers for replays.
- Write side effects only after successful handler completion.

## 13) Operational Command Checklist

Pre-run checks:
```bash
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/health | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/jobs | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/workers | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" "http://127.0.0.1:3000/api/system/errors?hours=24&limit=50" | jq
```

Safe pause sequence:
1. Set `QUEUE_ENABLED=false`
2. Set `RESEARCH_JOBS_ENABLED=false`
3. Restart worker processes
4. Verify queue depth stabilizes

Safe resume sequence:
1. Set `SYSTEM_MODE=production` (or target mode)
2. Set `QUEUE_ENABLED=true`
3. Enable `RESEARCH_JOBS_ENABLED=true` last
4. Verify heartbeats and dead-letter trend

## 14) Incident Escalation Conditions

Escalate immediately when:
- stale workers persist > 5 minutes while queue enabled
- dead-letter count grows continuously for 15+ minutes
- repeated worker crash loop
- evidence of tenant-boundary or privacy risk

## 15) Non-Negotiable Policies

- No OpenClaw on Oracle control plane.
- No live trading and no broker execution.
- AI outputs are drafts until approved.
- Tenant safety remains server-enforced.
