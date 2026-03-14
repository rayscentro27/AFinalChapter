# Nexus Monitoring System Design

Status: design-only, additive, production-safe.

## Scope
Operational monitoring for:
- worker health
- queue depth and retries
- transcript ingestion
- opportunity engine activity
- video worker activity
- AI usage and errors

No infrastructure replacement. Supabase + Fastify remain system-of-record/control-plane stack.

## 1) Required Monitoring Metrics

Core system:
- `uptime_seconds`
- `system_mode`
- `queue_enabled`, `ai_jobs_enabled`, `research_jobs_enabled`, `notifications_enabled`

Queue:
- `queue_depth_pending`
- `queue_depth_running`
- `dead_letter_count`
- `oldest_pending_age_seconds`
- `retry_wait_count`
- `queue_claim_rate_per_min`
- `queue_completion_rate_per_min`

Workers:
- `workers_total`
- `workers_fresh`
- `workers_stale`
- `worker_crash_count_24h`
- `heartbeat_lag_seconds`

Transcript ingestion:
- `transcripts_ingested_24h`
- `transcript_ingest_failures_24h`
- `ingest_latency_p50_ms`
- `ingest_latency_p95_ms`

Opportunity engine:
- `opportunities_generated_24h`
- `opportunity_briefs_generated_24h`
- `opportunity_failures_24h`

Video content worker:
- `video_jobs_processed_24h`
- `video_drafts_generated_24h`
- `video_review_pending`
- `video_worker_failures_24h`

AI usage:
- `ai_requests_24h`
- `ai_failures_24h`
- `ai_cache_hit_rate_24h`
- `token_usage_24h`
- `cost_estimate_24h_usd`

Errors:
- `system_errors_24h`
- `top_failing_job_types`
- `top_error_components`

## 2) Recommended Supabase Monitoring Tables

Reuse existing first:
- `worker_heartbeats`
- `job_queue`
- `system_errors`
- `ai_cache`
- `research_artifacts`

Optional additive tables (drafts only, no auto-migration):
- `ops_metric_snapshots`
  - `id`, `metric_name`, `metric_value`, `labels jsonb`, `captured_at`
- `ops_alert_events`
  - `id`, `severity`, `alert_key`, `message`, `context jsonb`, `acknowledged_at`, `created_at`

## 3) Backend Endpoint Contracts

Existing (keep):
- `GET /api/system/health`
- `GET /api/system/workers`
- `GET /api/system/jobs`
- `GET /api/system/errors`

Recommended additive read-only contracts:
- `GET /api/system/usage`
  - AI/token/cost/cache metrics
- `GET /api/system/ingestion`
  - transcript/research ingestion rates + failures
- `GET /api/system/opportunities`
  - opportunity pipeline metrics
- `GET /api/system/video-worker`
  - video job counts and draft/review states

Example `/api/system/usage`:
```json
{
  "ok": true,
  "timestamp": "2026-03-14T08:00:00Z",
  "ai_requests_24h": 132,
  "ai_failures_24h": 5,
  "ai_cache_hit_rate_24h": 0.41,
  "token_usage_24h": 238440,
  "cost_estimate_24h_usd": 3.84
}
```

## 4) Admin Dashboard Components

Recommended panels:
- System Mode + Safety Flags
- Queue Health (pending/running/retry/dead-letter)
- Worker Freshness (fresh vs stale)
- Error Feed (last 24h)
- AI Usage + Cache Hit Rate
- Transcript Ingestion Health
- Opportunity Engine Throughput
- Video Worker Throughput and Review Queue

## 5) Alert Conditions

Sev 1:
- `workers_stale > 0` for > 5 min while `queue_enabled=true`
- `dead_letter_count` increasing continuously for 15+ min
- `system_errors_24h` includes tenant/auth isolation error burst

Sev 2:
- `queue_depth_pending > 500`
- `ai_failures_24h / ai_requests_24h > 0.30`
- `transcript_ingest_failures_24h > 20`

Sev 3:
- cache hit-rate dips below 0.10 for 24h window
- non-critical worker retry spikes

## 6) Worker Heartbeat Tracking Rules

Heartbeat interval:
- 10-15 seconds for queue workers

Freshness definition:
- fresh: `last_seen_at` within last 60 seconds
- stale: older than 60 seconds

Stale response:
1. classify worker as stale
2. page operator if queue enabled
3. inspect job leases and requeue stale leases safely

## 7) Failure Alerting Workflow

1. detect threshold breach from system endpoints
2. persist alert record (`ops_alert_events` optional)
3. notify operator channel (Telegram/email)
4. apply safe-mode flags if severe:
   - `QUEUE_ENABLED=false`
   - `RESEARCH_JOBS_ENABLED=false`
5. run incident triage commands

## 8) Operator Command Set

```bash
# baseline
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/health | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/jobs | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/workers | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" "http://127.0.0.1:3000/api/system/errors?hours=24&limit=100" | jq
```

## 9) Rollout Sequence

1. Start with endpoint-driven dashboard (no schema changes).
2. Add optional snapshot/alert tables if needed.
3. Add threshold alerts and on-call routing.
4. Add weekly trend reporting for queue/worker/AI spend.
