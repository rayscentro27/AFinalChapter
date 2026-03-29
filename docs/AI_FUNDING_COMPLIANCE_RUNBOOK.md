# AI Funding Compliance Runner Runbook

## Purpose
Automate follow-up task generation for funding workflows that are missing client-device submission confirmation.

Route called by scheduler:
- `POST /admin/ai/funding/compliance-run`

Security model:
- Requires `x-api-key`.
- Scheduler mode requires `x-cron-token` and localhost source.
- Tenant must be in `ORACLE_TENANT_IDS` allowlist.

## Required Env Vars (Oracle gateway `.env`)
- `INTERNAL_API_KEY`
- `ORACLE_CRON_TOKEN`
- `ORACLE_TENANT_IDS` (comma-separated UUIDs)
- `ORACLE_API_BASE_URL` (optional; defaults to `http://127.0.0.1:$PORT`)

Optional tuning:
- `AI_FUNDING_COMPLIANCE_RUN_LIMIT` (default `50`)
- `AI_FUNDING_COMPLIANCE_STALE_MINUTES` (default `30`)

## Install Script
Copy script to server path (if not already synced):
- `scripts/ai_funding_compliance_cron.sh`

## Install systemd Units
Copy units:
- `gateway/deploy/nexus-ai-funding-compliance-runner.service` -> `/etc/systemd/system/`
- `gateway/deploy/nexus-ai-funding-compliance-runner.timer` -> `/etc/systemd/system/`

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nexus-ai-funding-compliance-runner.timer
sudo systemctl status nexus-ai-funding-compliance-runner.timer --no-pager
```

## Manual Run
```bash
sudo systemctl start nexus-ai-funding-compliance-runner.service
sudo journalctl -u nexus-ai-funding-compliance-runner.service -n 100 --no-pager
```

## Timer Logs
```bash
sudo journalctl -u nexus-ai-funding-compliance-runner.timer -n 50 --no-pager
sudo journalctl -u nexus-ai-funding-compliance-runner.service -f
```

## Expected Success Output
JSON log lines per tenant with:
- `runner: "ai_funding_compliance"`
- `status_code` in `2xx`
- response fields like `created_tasks`, `candidate_pairs`, `skipped_pairs`

## Failure Checks
1. `invalid_cron_token`
- Verify `ORACLE_CRON_TOKEN` in `.env` and caller header.

2. `cron_not_from_localhost`
- Ensure scheduler hits `127.0.0.1` (not public hostname).

3. `tenant_not_allowed_for_cron`
- Add tenant UUID to `ORACLE_TENANT_IDS`.

4. `lock_not_acquired`
- Another run is active for that tenant; this is safe/expected occasionally.
