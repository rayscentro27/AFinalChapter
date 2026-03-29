# Runbook: Database Latency / Query Hotspots

## Symptoms
- Elevated API p95 latency
- SRE capacity endpoint reports high `db_query_hotspots`
- Slow admin list/chart endpoints

## Immediate Checks
```bash
curl -s "http://127.0.0.1:3000/admin/sre/capacity?tenant_id=<TENANT_ID>" -H "x-api-key: $INTERNAL_API_KEY" -H "Authorization: Bearer $JWT"
curl -s "http://127.0.0.1:3000/admin/sre/charts?tenant_id=<TENANT_ID>&range=24h" -H "x-api-key: $INTERNAL_API_KEY" -H "Authorization: Bearer $JWT"
```
- Validate index presence from `supabase_sre_rollups.sql`.
- Check Supabase dashboard for long-running queries.

## Mitigation
1. Reduce heavy list limits (max 500 already enforced).
2. Prefer rollup endpoints over raw-table scans.
3. Run rollup manually to refresh chart cache.
4. Temporarily reduce background job limits if DB contention is high.

## Verification
- p95 latency normalizes.
- Timeouts/5xx drop.
- Capacity recommendations return baseline state.

## Rollback
- Revert recent query/path changes.
- Disable non-critical cron jobs temporarily.
