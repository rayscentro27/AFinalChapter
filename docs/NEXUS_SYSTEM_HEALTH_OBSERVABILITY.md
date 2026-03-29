# Nexus System Health + Observability

## Endpoints

- `GET /api/system/health`
  - system mode and safety flags
  - queue depth and oldest pending job
  - worker freshness summary
  - AI cache metrics
  - API latency summary for the last 60 minutes
- `GET /api/system/jobs`
  - queue backlog by status
  - recent job rows with failure metadata
  - dead-letter and running counts
- `GET /api/system/errors`
  - filtered recent system errors
  - top failing job types
  - error counts by type

## Supporting Panels

- `GET /api/system/workers`
  - Mac Mini and other worker heartbeat state
- `GET /api/system/usage`
  - AI request volume, failures, token usage, and cost estimates
- `GET /api/system/ingestion`
  - transcript and research ingestion throughput
- `GET /api/system/opportunities`
  - generated opportunity output volume
- `GET /api/system/video-worker`
  - video/content worker queue and artifact summary

## Dashboard Plan

- Admin Health
  - tenant-scoped alert visibility
  - system observability roll-up card wall
  - recent alert notifications and webhook failure table
- System Observability Panels
  - API latency block with avg, p95, p99, and slowest routes
  - Mac Mini worker status list with freshness and concurrency
  - queue backlog/failure block with recent jobs
  - recent system error alerts and top failing job types
  - AI usage and cost breakdowns
- Admin SRE
  - time-series charts for throughput, failure rate, and provider-down counts

## Alerting Logic

- Existing persistent alerts
  - outbox failed backlog
  - oldest due lag
  - webhook failure spike
  - delivery failed backlog
  - channels down
- Observability warning thresholds surfaced in UI
  - worker stale count greater than zero
  - dead-letter backlog greater than zero
  - API p95 latency trending high
  - AI failure count increasing relative to request volume
- Operator action flow
  - use `admin-alerts-run` to refresh persistent alert state
  - use `admin-system-observability` for read-only diagnosis panels
  - use `admin-sre-rollup-run` to refresh chart buckets when investigating incidents