# Scheduler Runbook (Outbox + Assignment + Escalation + Alerts)

Quick keywords: see `docs/KEYWORD_RUNBOOKS.md`.

## 1) Required Oracle VM env vars
Edit `/home/opc/afinal_gateway/.env` (or your gateway env file):

- `INTERNAL_API_KEY=<gateway internal key>`
- `ORACLE_CRON_TOKEN=<strong random token>`
- `ORACLE_TENANT_IDS=<tenant_uuid_1,tenant_uuid_2,...>`
- Optional: `ORACLE_API_BASE_URL=http://127.0.0.1:3000`
- Optional: `OUTBOX_RUN_LIMIT=25`
- Optional: `ASSIGNMENT_RUN_LIMIT=50`
- Optional: `ESCALATION_RUN_LIMIT=50`
- Optional: `ALERTS_NOTIFY=true`

Restart API after env updates:

```bash
sudo systemctl restart nexus-gateway.service
```

## 2) Install scripts on Oracle VM

```bash
chmod +x /home/opc/afinal_gateway/scripts/outbox_cron.sh
chmod +x /home/opc/afinal_gateway/scripts/assignment_cron.sh
chmod +x /home/opc/afinal_gateway/scripts/escalation_cron.sh
chmod +x /home/opc/afinal_gateway/scripts/alerts_cron.sh
```

## 3) Install systemd units/timers

```bash
sudo cp /home/opc/afinal_gateway/deploy/nexus-outbox-runner.service /etc/systemd/system/
sudo cp /home/opc/afinal_gateway/deploy/nexus-outbox-runner.timer /etc/systemd/system/
sudo cp /home/opc/afinal_gateway/deploy/nexus-assignment-runner.service /etc/systemd/system/
sudo cp /home/opc/afinal_gateway/deploy/nexus-assignment-runner.timer /etc/systemd/system/
sudo cp /home/opc/afinal_gateway/deploy/nexus-escalation-runner.service /etc/systemd/system/
sudo cp /home/opc/afinal_gateway/deploy/nexus-escalation-runner.timer /etc/systemd/system/
sudo cp /home/opc/afinal_gateway/deploy/nexus-alerts-runner.service /etc/systemd/system/
sudo cp /home/opc/afinal_gateway/deploy/nexus-alerts-runner.timer /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now nexus-outbox-runner.timer
sudo systemctl enable --now nexus-assignment-runner.timer
sudo systemctl enable --now nexus-escalation-runner.timer
sudo systemctl enable --now nexus-alerts-runner.timer
```

## 4) Manual one-time tests

```bash
sudo systemctl start nexus-outbox-runner.service
sudo systemctl start nexus-assignment-runner.service
sudo systemctl start nexus-escalation-runner.service
sudo systemctl start nexus-alerts-runner.service

sudo journalctl -u nexus-outbox-runner.service -n 50 --no-pager
sudo journalctl -u nexus-assignment-runner.service -n 50 --no-pager
sudo journalctl -u nexus-escalation-runner.service -n 50 --no-pager
sudo journalctl -u nexus-alerts-runner.service -n 50 --no-pager
```

Expected log lines are JSON and include:
- `runner`
- `tenant_id`
- `status_code`
- `message`
- `response`

## 5) Ongoing logs

```bash
sudo journalctl -u nexus-outbox-runner.timer -f
sudo journalctl -u nexus-assignment-runner.timer -f
sudo journalctl -u nexus-escalation-runner.timer -f
sudo journalctl -u nexus-alerts-runner.timer -f

sudo journalctl -u nexus-outbox-runner.service -f
sudo journalctl -u nexus-assignment-runner.service -f
sudo journalctl -u nexus-escalation-runner.service -f
sudo journalctl -u nexus-alerts-runner.service -f
```

## 6) Manual API smoke (without systemd)

```bash
curl -sS -X POST http://127.0.0.1:3000/admin/outbox/run \
  -H "content-type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -H "x-cron-token: $ORACLE_CRON_TOKEN" \
  --data '{"tenant_id":"<tenant_uuid>","limit":25}'

curl -sS -X POST http://127.0.0.1:3000/admin/assignment/run \
  -H "content-type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -H "x-cron-token: $ORACLE_CRON_TOKEN" \
  --data '{"tenant_id":"<tenant_uuid>","limit":50}'

curl -sS -X POST http://127.0.0.1:3000/admin/escalation/run \
  -H "content-type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -H "x-cron-token: $ORACLE_CRON_TOKEN" \
  --data '{"tenant_id":"<tenant_uuid>","limit":50}'

curl -sS -X POST http://127.0.0.1:3000/admin/alerts/run \
  -H "content-type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -H "x-cron-token: $ORACLE_CRON_TOKEN" \
  --data '{"tenant_id":"<tenant_uuid>","notify":true}'
```

## 7) Security notes
- Runner endpoints require valid `x-api-key`.
- Cron bypass requires all of:
  - valid `x-cron-token`
  - localhost source
  - `tenant_id` included in `ORACLE_TENANT_IDS`
- No secrets are printed by scheduler scripts.
