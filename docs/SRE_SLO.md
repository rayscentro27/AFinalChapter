# SRE SLO/SLA Targets

## Service Scope
- Oracle Fastify gateway
- Supabase-backed outbox, webhook ingest, and delivery status pipeline
- Admin monitoring/SRE endpoints

## SLOs
1. Webhook acceptance latency: `p95 < 500ms`
2. Outbox processing timeliness: `99%` of queued messages processed within `2 minutes`
3. Delivery callback handling latency: `p95 < 500ms`
4. API error rate: `< 1%` excluding upstream provider failures
5. Gateway uptime: `99.9%` monthly

## Error Budget
- Monthly uptime budget at 99.9%: ~43m 49s downtime.
- Exhausting >50% budget in first half of month triggers change freeze for non-critical deployments.

## Load Test Commands
Prereqs:
- Install `k6`: https://k6.io/docs/get-started/installation/
- Provide env vars:
  - `BASE_URL`
  - `INTERNAL_API_KEY`
  - `AUTH_BEARER` (JWT for protected admin/send routes)
  - `TENANT_ID`
  - `CONTACT_ID` (send test)
  - `MATRIX_WEBHOOK_TOKEN` (optional)

Run:
```bash
npm run loadtest:webhooks
npm run loadtest:send
npm run loadtest:reads
```

## Pass Criteria
- All k6 thresholds pass.
- No sustained growth in outbox failed backlog.
- No increase in open critical alerts after test window.
