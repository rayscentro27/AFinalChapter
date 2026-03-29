# Oracle Gateway Bastion Deploy Runbook

Last updated: 2026-03-24

Quick keywords: see `docs/KEYWORD_RUNBOOKS.md`.

## Scope
This is the canonical operational process for the current Oracle gateway deployment used by `AFinalChapter`.

Current architecture:
- Gateway app runs on OCI VM `OpenChatAI` (private IP `10.0.0.70`).
- Gateway process path: `/opt/nexus-api/gateway`.
- Public endpoint: `https://api.goclearonline.cc`.
- Public routing: Nginx + TLS on the Oracle VM.
- Netlify proxies call Oracle through the app domain and protected functions.

## Prerequisites
- OCI CLI authenticated with profile `goclearonline`.
- SSH access to OCI VM via Bastion managed session.
- `gateway/.env` present on the live host at `/opt/nexus-api/gateway/.env`.
- Local access to `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a valid smoke tenant UUID for protected smoke.

## Fast status check
Run from repo root:

```bash
scripts/oracle_gateway_smoke.sh
```

Expected:
- `https://api.goclearonline.cc/health` returns `{"ok":true,...}`
- Netlify function preview endpoint returns `missing_authorization` when no bearer JWT is sent.

## Canonical Deploy

Run from repo root:

```bash
scripts/oracle_bastion_deploy.sh
```

Expected:
- backup written to `/home/ubuntu/backups/nexus-api/<release_id>/gateway`
- release marker written to `/opt/nexus-api/gateway/.deploy-release.json`
- `nexus-api` restarts successfully

For GitHub Actions:
- normal deploys now target a self-hosted runner labeled `self-hosted, oracle-deploy`
- manual hosted-runner dispatch remains available only for diagnostics
- if the hosted runner times out during `oci bastion session create-managed-ssh`, do not keep treating that as an app deploy bug

## Protected Post-Deploy Smoke

Run from repo root:

```bash
SMOKE_TENANT_ID=<tenant_uuid> scripts/oracle_protected_smoke.sh
```

Expected:
- temporary smoke user is provisioned as `admin`
- `/.netlify/functions/admin-credential-readiness` returns HTTP `200`
- response content-type is `application/json`
- payload contains `ok: true`
- smoke user is cleaned up automatically

## Rollback

Restore the latest backup:

```bash
scripts/oracle_bastion_rollback.sh
```

Restore a specific backup:

```bash
scripts/oracle_bastion_rollback.sh <release_id>
```

## Update Oracle URL/API key everywhere
Run from repo root:

```bash
scripts/oracle_gateway_set_env.sh "https://api.goclearonline.cc" "<NEW_INTERNAL_API_KEY>"
```

This updates:
- local `.env`
- local `.netlify/.env`
- Netlify env vars: `ORACLE_API_BASE_URL`, `ORACLE_API_KEY`, `ORACLE_BASE_URL`, `ORACLE_INTERNAL_API_KEY`

## Reconnect to VM (Bastion workflow)
1) Enable Bastion plugin on target VM if needed:

```bash
oci compute instance update \
  --instance-id <INSTANCE_OCID> \
  --region us-phoenix-1 \
  --profile goclearonline \
  --agent-config '{"plugins-config":[{"name":"Bastion","desired-state":"ENABLED"}]}' \
  --force
```

2) Ensure bastion exists (create once if needed):

```bash
oci bastion bastion create \
  --compartment-id <TENANCY_OCID> \
  --region us-phoenix-1 \
  --name afinal-bastion \
  --bastion-type standard \
  --target-subnet-id <SUBNET_OCID> \
  --client-cidr-list '["0.0.0.0/0"]' \
  --wait-for-state SUCCEEDED
```

3) Create managed SSH session:

```bash
ssh-keygen -t ed25519 -N '' -f /tmp/bastion_session_key -C bastion-session
oci bastion session create-managed-ssh \
  --bastion-id <BASTION_OCID> \
  --region us-phoenix-1 \
  --profile goclearonline \
  --display-name afinal-openchatai-opc \
  --ssh-public-key-file /tmp/bastion_session_key.pub \
  --target-resource-id <INSTANCE_OCID> \
  --target-os-username opc \
  --target-port 22 \
  --session-ttl 10800
```

4) Connect:

```bash
ssh -i /tmp/bastion_session_key \
  -o ProxyCommand="ssh -i /tmp/bastion_session_key -W %h:%p -p 22 <SESSION_OCID>@host.bastion.us-phoenix-1.oci.oraclecloud.com" \
  -p 22 opc@10.0.0.70
```

## Service restart on VM

```bash
sudo systemctl restart nexus-api
sudo systemctl status nexus-api --no-pager
```

## Rotate internal API key
1) Generate new key:

```bash
NEW_KEY=$(openssl rand -hex 32)
```

2) On VM update `/opt/nexus-api/gateway/.env`:

```bash
sed -i "s#^INTERNAL_API_KEY=.*#INTERNAL_API_KEY=${NEW_KEY}#" /opt/nexus-api/gateway/.env
```

3) Restart gateway process.
4) Sync local + Netlify envs:

```bash
scripts/oracle_gateway_set_env.sh "https://api.goclearonline.cc" "$NEW_KEY"
```

5) Verify:
- Old key should return `{"ok":false,"error":"unauthorized"}`.
- New key request without bearer JWT should return `{"ok":false,"error":"missing_authorization"}`.

## Cleanup checklist
- Delete bastion sessions after admin work:

```bash
oci bastion session delete --session-id <SESSION_OCID> --region us-phoenix-1 --profile goclearonline --force
```

- Delete local temp keys:

```bash
rm -f /tmp/bastion_session_key /tmp/bastion_session_key.pub
```

- Keep OCI security list ingress minimal and leave Bastion as the admin access path.

## Security notes
- Never paste private keys in chat or commits.
- Rotate OCI API keys that were exposed.
- Rotate Meta tokens that were shared.
- Rotate `ORACLE_API_KEY` after major setup/debug sessions.
- Keep GitHub Actions secrets current so production deploys do not fall back to manual recovery.
