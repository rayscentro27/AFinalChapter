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

## `oracle-deploy-gateway`
Purpose: deploy the current `gateway/` tree to Oracle through the pinned OCI Bastion path, create a backup, preserve `.env`, and restart `nexus-api`.

Command:
```bash
scripts/oracle_bastion_deploy.sh
```

Notes:
- Writes a release marker to `/opt/nexus-api/gateway/.deploy-release.json`.
- Stores the previous gateway tree under `/home/ubuntu/backups/nexus-api/<release_id>/gateway`.

## `oracle-deploy-rollback`
Purpose: restore the latest Oracle gateway backup and restart `nexus-api`.

Command:
```bash
scripts/oracle_bastion_rollback.sh
```

Optional:
```bash
scripts/oracle_bastion_rollback.sh <release_id>
```

## `oracle-credential-smoke`
Purpose: provision a temporary admin smoke user, call the protected credential-readiness Netlify route, and clean up afterward.

Command:
```bash
SMOKE_TENANT_ID=<tenant_uuid> scripts/oracle_protected_smoke.sh
```

Notes:
- Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in env or `gateway/.env`.
- Fails unless the endpoint returns HTTP 200 with JSON `{ ok: true }`.

## `oracle-messaging-smoke`
Purpose: run a modern outbox smoke send using the permission-guarded `/messages/send` path.

Command:
```bash
SMOKE_TENANT_ID=<tenant_uuid> \
SMOKE_CONVERSATION_ID=<conversation_uuid> \
SMOKE_PROVIDER=meta \
SMOKE_BEARER_TOKEN=<user_jwt> \
GATEWAY_BASE_URL=https://api.goclearonline.cc \
GATEWAY_INTERNAL_API_KEY=<internal_api_key> \
SUPABASE_URL=<supabase_url> \
SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
node scripts/smoke-inbox-send.mjs
```

## `oracle-smoke-user-provision`
Purpose: create a deterministic smoke user and force tenant role (default: `admin`) to avoid `missing_permission` surprises.

Command:
```bash
node scripts/provision_smoke_user_token.mjs --tenant-id=<tenant_uuid> --role=admin
```

Notes:
- Writes token + metadata to `.secrets/real_user_bearer_token.txt` and `.secrets/real_user_bearer_token.meta.json` by default.
- Use `--no-write=true` to print summary only.

## `oracle-smoke-user-cleanup`
Purpose: remove temporary `codex.smoke.admin.*` users and tenant membership rows.

Commands:
```bash
node scripts/cleanup_smoke_users.mjs --dry-run=true
node scripts/cleanup_smoke_users.mjs
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
2. `oracle-deploy-gateway`
3. `oracle-credential-smoke`
4. `oracle-scheduler-check`
5. `oracle-gateway-smoke`

---
If infra IDs change, update these files only:
- `scripts/oracle_quickconnect.sh`
- `scripts/oracle_bastion_deploy.sh`
- `scripts/oracle_bastion_rollback.sh`
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
