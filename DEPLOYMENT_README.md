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
