# On-Call Checklist

## Daily Checks
1. Review `/admin/monitoring/overview` for each active tenant.
2. Review open alerts in `/admin/monitoring/alerts?status=open`.
3. Verify outbox backlog is stable (queued + oldest_due_minutes).
4. Check provider health for down/degraded channels.

## Weekly Checks
1. Run k6 smoke load tests for webhooks, send queueing, and dashboard reads.
2. Validate rollup freshness via `/admin/sre/charts` and manual rollup run.
3. Confirm alert notifications still deliver to Slack/email.
4. Verify capacity recommendations and adjust limits if needed.

## Token Rotation Reminders
- Rotate provider tokens and webhook secrets on a fixed schedule.
- Rotate `ORACLE_CRON_TOKEN` and internal API keys at least quarterly.
- Re-test webhook signatures immediately after secret rotation.

## Backup Verification Reminders
- Confirm Supabase backup/snapshot jobs completed.
- Validate restore workflow periodically in a staging tenant.
- Verify critical docs/runbooks are versioned and current.

## Safe Mode Procedure
- Set `SAFE_MODE=true` on gateway to pause all outbound sending.
- Keep ingress endpoints active for visibility and continuity.
- Monitor queue growth; drain once incident is resolved by setting `SAFE_MODE=false`.
