# Runbook: Webhook Failures

## Symptoms
- Spike in `/admin/monitoring/overview.webhooks.failed_15m`
- `WEBHOOK_FAILED_SPIKE` alerts open
- Provider events missing in conversations

## Immediate Checks
```bash
curl -s "http://127.0.0.1:3000/admin/monitoring/overview?tenant_id=<TENANT_ID>" -H "x-api-key: $INTERNAL_API_KEY" -H "Authorization: Bearer $JWT"
curl -s "http://127.0.0.1:3000/admin/webhooks/failures?tenant_id=<TENANT_ID>&limit=50" -H "x-api-key: $INTERNAL_API_KEY" -H "Authorization: Bearer $JWT"
```
- Verify webhook signatures/secrets for Meta/Twilio/WhatsApp/Matrix.
- Confirm provider webhook URLs resolve and TLS is valid.

## Mitigation
1. Fix invalid token/signature secret mismatch.
2. If provider outage, suppress noisy alerts and monitor backlog.
3. Replay missed events if provider supports retry/replay.
4. Temporarily raise webhook worker capacity if backlog grows.

## Verification
- `failed_15m` returns to baseline.
- New inbound messages appear in inbox.
- Alert transitions to resolved.

## Rollback
- Revert last webhook parser/signature deployment.
- Restore previous secret values from secure vault if rotation caused failures.
