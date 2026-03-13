# Keyword Runbooks

Use these exact keywords in chat and I will run the matching playbook without re-discovery.

## `oracle-connect-fast`
Purpose: connect to Oracle VM through OCI Bastion using known-good IDs.

Command:
```bash
scripts/oracle_quickconnect.sh ubuntu
```

Notes:
- Defaults are pinned for this project:
  - profile: `goclearonline`
  - region: `us-phoenix-1`
  - bastion: `afinal-bastion`
  - instance: `OpenChatAI` (`10.0.0.70`)
- `ubuntu` is default because sudo works there.

## `oracle-connect-opc`
Purpose: connect as `opc` instead of `ubuntu`.

Command:
```bash
scripts/oracle_quickconnect.sh opc
```

## `oracle-scheduler-check`
Purpose: verify outbox/assignment/escalation timers and logs.

Commands:
```bash
sudo systemctl list-timers --all | egrep 'nexus-(outbox|assignment|escalation)-runner'
sudo journalctl -u nexus-outbox-runner.service -n 50 --no-pager
sudo journalctl -u nexus-assignment-runner.service -n 50 --no-pager
sudo journalctl -u nexus-escalation-runner.service -n 50 --no-pager
```

## `oracle-gateway-smoke`
Purpose: smoke-check public API + Netlify proxy behavior.

Command:
```bash
scripts/oracle_gateway_smoke.sh
```

## `oracle-sync-env`
Purpose: update Oracle API URL/key locally and in Netlify.

Command:
```bash
scripts/oracle_gateway_set_env.sh "https://api.goclearonline.cc" "<NEW_INTERNAL_API_KEY>"
```

## `oracle-full-hotpath`
Purpose: end-to-end operational path.

Order:
1. `oracle-connect-fast`
2. `oracle-scheduler-check`
3. `oracle-gateway-smoke`

---
If infra IDs change, update these files only:
- `scripts/oracle_quickconnect.sh`
- `docs/playbooks/oracle_gateway_named_tunnel_runbook.md`
- `docs/SCHEDULERS_RUNBOOK.md`

## `oracle-alerts-check`
Purpose: run alert evaluation immediately for one tenant.

Command:
```bash
curl -sS -X POST http://127.0.0.1:3000/admin/alerts/run \
  -H "content-type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -H "x-cron-token: $ORACLE_CRON_TOKEN" \
  --data '{"tenant_id":"<tenant_uuid>","notify":true}'
```
