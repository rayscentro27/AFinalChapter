# Runbook: Provider Down / Circuit Breaker Tripped

## Symptoms
- Channel health shows `down`
- Outbox failures tied to one provider/channel_account
- Alert `PROVIDER_DOWN` open

## Immediate Checks
```bash
curl -s "http://127.0.0.1:3000/admin/channel-health?tenant_id=<TENANT_ID>" -H "x-api-key: $INTERNAL_API_KEY" -H "Authorization: Bearer $JWT"
curl -s "http://127.0.0.1:3000/admin/channel-health/events?tenant_id=<TENANT_ID>&limit=100" -H "x-api-key: $INTERNAL_API_KEY" -H "Authorization: Bearer $JWT"
```
- Validate provider credentials and API availability.
- Confirm cooldown window and `health_next_retry_at`.

## Mitigation
1. Fix credentials/network issue.
2. Use fallback provider/channel routing.
3. Manual reset after fix:
```bash
curl -s -X POST "http://127.0.0.1:3000/admin/channel-health/reset" -H "content-type: application/json" -H "x-api-key: $INTERNAL_API_KEY" -H "Authorization: Bearer $JWT" -d '{"tenant_id":"<TENANT_ID>","channel_account_id":"<CHANNEL_ACCOUNT_ID>"}'
```

## Verification
- Channel returns to `healthy`.
- Outbox sends succeed for that route.
- No new critical provider health events.

## Rollback
- Disable the affected channel account and route via alternate provider.
- Revert any recent provider adapter deployment.
