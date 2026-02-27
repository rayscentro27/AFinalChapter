# Runbook: Outbox Backlog

## Symptoms
- High `outbox.queued` / `oldest_due_minutes`
- Increased send latency
- Repeated `OUTBOX_FAILED_SPIKE` alerts

## Immediate Checks
```bash
curl -s "http://127.0.0.1:3000/admin/monitoring/overview?tenant_id=<TENANT_ID>" -H "x-api-key: $INTERNAL_API_KEY" -H "Authorization: Bearer $JWT"
curl -s -X POST "http://127.0.0.1:3000/admin/outbox/run" -H "content-type: application/json" -H "x-api-key: $INTERNAL_API_KEY" -H "x-cron-token: $ORACLE_CRON_TOKEN" -d '{"tenant_id":"<TENANT_ID>","limit":25}'
```
- Check `SAFE_MODE` status.
- Check provider/channel health down/degraded counts.

## Mitigation
1. If `SAFE_MODE=true`, disable only after incident control is in place.
2. Increase runner frequency/limit temporarily.
3. Reset unhealthy channels after credentials fix.
4. Reduce retry pressure by honoring backoff and no-healthy-route cooldown.

## Verification
- Queued and oldest_due decrease steadily.
- Sent count rises and failed rate normalizes.

## Rollback
- Revert recent send-route or provider adapter changes.
- Restore previous channel configuration and tokens.
