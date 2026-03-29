# Outbox Runner Runbook (Oracle VM)

## 1) Required env vars
Edit `/home/opc/afinal_gateway/.env` and set:

- `INTERNAL_API_KEY=<existing gateway internal key>`
- `ORACLE_CRON_TOKEN=<new strong random token>`
- `ORACLE_TENANT_IDS=<tenant_uuid_1,tenant_uuid_2,...>`

Then restart API:

```bash
sudo systemctl restart nexus-gateway.service
```

## 2) Apply DB lock functions
Run the migration in Supabase SQL editor:

- `supabase/migrations/20260225153000_outbox_runner_advisory_lock.sql`

## 3) Install systemd runner

```bash
sudo cp /home/opc/afinal_gateway/deploy/nexus-outbox-runner.service /etc/systemd/system/
sudo cp /home/opc/afinal_gateway/deploy/nexus-outbox-runner.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nexus-outbox-runner.timer
```

## 4) Manual one-time test

```bash
sudo systemctl start nexus-outbox-runner.service
sudo journalctl -u nexus-outbox-runner.service -n 50 --no-pager
```

Expected JSON line fields per tenant:
- `tenant_id`
- `status_code`
- `message`
- `response` (API JSON)

## 5) Ongoing logs

```bash
sudo journalctl -u nexus-outbox-runner.timer -f
sudo journalctl -u nexus-outbox-runner.service -f
```

## 6) Security behavior
- `/admin/outbox/run` accepts cron bypass only when:
  - `x-api-key` is valid
  - `x-cron-token` matches `ORACLE_CRON_TOKEN`
  - request is from localhost
  - `tenant_id` is in `ORACLE_TENANT_IDS`
- Runner lock is per-tenant advisory lock.
- If lock is already held, endpoint returns:
  - `{ "ok": true, "skipped": true, "reason": "lock_not_acquired" }`
