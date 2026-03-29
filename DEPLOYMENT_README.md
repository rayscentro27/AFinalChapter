# Nexus CRM Deployment README

This file documents the current production deployment layout and the commands used to operate it safely.

## Production Endpoints

- Web app: `https://app.goclearonline.cc`
- API: `https://api.goclearonline.cc`
- Root marketing domain: `https://goclearonline.cc`

## Current Hosting Topology

- Frontend (Vite/React): Netlify site `afinalchapter`
- DNS: Cloudflare
- API host: Oracle VM (`129.146.241.247`)
- Reverse proxy/TLS: Nginx + Let's Encrypt on Oracle VM

## Service Layout on Oracle VM

- `nexus-api.service`
  - User: `ubuntu`
  - Working dir: `/opt/nexus-api/gateway`
  - Port: `3000`
  - Public traffic path: `api.goclearonline.cc -> nginx -> 127.0.0.1:3000`

- `nexus-gateway.service` (legacy service kept alive separately)
  - User: `opc`
  - Working dir: `/home/opc/afinal_gateway`
  - Port: `3001`
  - Not exposed by nginx in current config

## Nginx + TLS

- Nginx config file: `/etc/nginx/sites-available/nexus-api`
- Live cert path:
  - `/etc/letsencrypt/live/api.goclearonline.cc/fullchain.pem`
  - `/etc/letsencrypt/live/api.goclearonline.cc/privkey.pem`

## Firewall/Network

- OCI security list ingress allows: `22`, `80`, `443`
- VM firewall allows: `22`, `80`, `443`

## Runtime Validation Commands

From your local machine:

```bash
curl -i https://api.goclearonline.cc/healthz
curl -i -X POST https://api.goclearonline.cc/api/ai/execute \
  -H "content-type: application/json" \
  -H "x-api-key: wrong" \
  -d '{"prompt":"test"}'
```

Expected:
- `/healthz` returns `200` with JSON payload
- `/api/ai/execute` returns `401` unless correct internal API key is provided

## Canonical Oracle Deploy Path

Use the OCI Bastion path as the single supported deployment route for the gateway.

From repo root:

```bash
scripts/oracle_bastion_deploy.sh
```

What it does:
- opens a managed OCI Bastion SSH session using `scripts/oracle_quickconnect.sh`
- streams the local `gateway/` tree to `/opt/nexus-api/gateway`
- preserves the live `.env`
- stores a backup under `/home/ubuntu/backups/nexus-api/<release_id>/gateway`
- runs `npm ci --omit=dev` on-host
- restarts `nexus-api`
- writes a release marker to `/opt/nexus-api/gateway/.deploy-release.json`

Rollback:

```bash
scripts/oracle_bastion_rollback.sh
scripts/oracle_bastion_rollback.sh <release_id>
```

Protected post-deploy smoke:

```bash
SMOKE_TENANT_ID=<tenant_uuid> scripts/oracle_protected_smoke.sh
```

This smoke path provisions a temporary admin user, calls the protected Netlify credential-readiness route, requires HTTP `200` with JSON `{ "ok": true }`, and then cleans up the temporary user.

## CI Secrets For Oracle Deploy

The GitHub workflow `.github/workflows/deploy-api-oracle.yml` now expects these secrets:

- `OCI_REGION`
- `OCI_USER_OCID`
- `OCI_TENANCY_OCID`
- `OCI_FINGERPRINT`
- `OCI_API_KEY_CONTENT`
- `OCI_BASTION_ID` (optional if repo defaults are still correct)
- `OCI_INSTANCE_ID` (optional if repo defaults are still correct)
- `OCI_TARGET_IP` (optional if repo defaults are still correct)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMOKE_TENANT_ID`

If any required secret is missing, the deploy workflow fails before attempting a production update.

## Oracle Deploy Runner Model

The Oracle deploy workflow now assumes a self-hosted GitHub Actions runner with labels `self-hosted` and `oracle-deploy-wsl` for normal deploys.

Why this changed:
- the OCI Bastion session-create call repeatedly timed out from `ubuntu-latest`
- the failure happened before OCI returned a request endpoint, so this is treated as a runner-path/network problem rather than an app or secret problem
- self-hosting the deploy runner on the machine that already has working OCI connectivity is the stable path

Operational rules:
- `push` to `main` deploys only through the `self-hosted, oracle-deploy-wsl` runner path
- manual `workflow_dispatch` defaults to `self-hosted`
- `github-hosted` remains available only as a manual diagnostic fallback, not the primary production route

The deploy runner must have:
- outbound connectivity to OCI Bastion APIs and SSH proxy endpoints from Ubuntu WSL
- `wsl.exe` available on the Windows runner host
- Ubuntu WSL with `bash`, `ssh`, `tar`, `node`, `npm`, Python 3.11, and `oci`
- an existing working OCI profile in Ubuntu WSL at `~/.oci/config`
- access to the same repo secrets already configured for Supabase smoke validation

On this machine, the supported Oracle deploy path is the Ubuntu WSL environment. The Windows runner remains the GitHub Actions entrypoint, but OCI access, deploy, and smoke now execute inside WSL because the Windows service context timed out on plain OCI API calls while WSL successfully created Bastion sessions and reached the Oracle VM.

For the canonical supported path, recovery checks, and change-control rules, use [docs/ORACLE_CANONICAL_DEPLOY_PATH.md](docs/ORACLE_CANONICAL_DEPLOY_PATH.md).

For runner setup guidance, use [docs/ORACLE_DEPLOY_RUNNER_SETUP.md](docs/ORACLE_DEPLOY_RUNNER_SETUP.md).

Tailscale is not required on the Oracle VM for this deployment model. Use it only if you want private operator access between your admin machines; do not treat it as the primary fix for CI deploy reliability.

For the exact secret inventory, command templates, and first-run CI verification order, use [docs/ORACLE_CI_SECRET_CHECKLIST.md](docs/ORACLE_CI_SECRET_CHECKLIST.md).

## Oracle VM Operations

```bash
sudo systemctl status nexus-api --no-pager
sudo systemctl restart nexus-api
sudo systemctl status nexus-gateway --no-pager
sudo systemctl restart nexus-gateway
sudo nginx -t
sudo systemctl reload nginx
sudo ss -ltnp | egrep ':80|:443|:3000|:3001'
```

## Notes

- Do not commit `.env` files or API keys.
- Rotate any token/key that was shared in chat or terminal history.
