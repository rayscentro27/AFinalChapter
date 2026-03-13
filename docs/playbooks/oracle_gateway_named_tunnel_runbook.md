# Oracle Gateway Named Tunnel Runbook

Last updated: 2026-02-26

Quick keywords: see `docs/KEYWORD_RUNBOOKS.md`.

## Scope
This is the canonical operational process for the current Oracle gateway deployment used by `AFinalChapter`.

Current architecture:
- Gateway app runs on OCI VM `OpenChatAI` (private IP `10.0.0.70`).
- Gateway process path: `/home/opc/afinal_gateway`.
- Public endpoint: `https://api.goclearonline.cc`.
- Public routing: Cloudflare Named Tunnel `afinalchapter-gateway`.
- Netlify proxies call Oracle with header `x-api-key: ORACLE_API_KEY`.

## Prerequisites
- OCI CLI authenticated with profile `goclearonline`.
- Netlify CLI authenticated and linked to site `afinalchapter`.
- SSH access to OCI VM via Bastion managed session.
- Cloudflare tunnel cert present on VM at `/home/opc/.cloudflared/cert.pem`.

## Fast status check
Run from repo root:

```bash
scripts/oracle_gateway_smoke.sh
```

Expected:
- `https://api.goclearonline.cc/health` returns `{"ok":true,...}`
- Netlify function preview endpoint returns `missing_authorization` when no bearer JWT is sent.

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
pkill -f 'node src/index.js' || true
cd /home/opc/afinal_gateway
nohup /home/opc/.nvm/versions/node/v20.20.0/bin/node src/index.js > /home/opc/afinal_gateway/gateway.log 2>&1 < /dev/null &

pkill -f 'cloudflared tunnel run afinalchapter-gateway' || true
nohup /home/opc/cloudflared tunnel run afinalchapter-gateway > /home/opc/cloudflared.log 2>&1 < /dev/null &
```

## Rotate internal API key
1) Generate new key:

```bash
NEW_KEY=$(openssl rand -hex 32)
```

2) On VM update `/home/opc/afinal_gateway/.env`:

```bash
sed -i "s#^INTERNAL_API_KEY=.*#INTERNAL_API_KEY=${NEW_KEY}#" /home/opc/afinal_gateway/.env
```

3) Restart gateway process.
4) Sync local + Netlify envs:

```bash
scripts/oracle_gateway_set_env.sh "https://api.goclearonline.cc" "$NEW_KEY"
```

5) Verify:
- Old key should return `{"ok":false,"error":"unauthorized"}`.
- New key request without bearer JWT should return `{"ok":false,"error":"missing_authorization"}`.

## Recreate named tunnel (if needed)
On VM:

```bash
cloudflared tunnel create afinalchapter-gateway
cloudflared tunnel route dns afinalchapter-gateway api.goclearonline.cc
```

Create `/home/opc/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/opc/.cloudflared/<TUNNEL_UUID>.json
ingress:
  - hostname: api.goclearonline.cc
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Run:

```bash
cloudflared tunnel run afinalchapter-gateway
```

## Reboot persistence (current strategy)
User crontab on VM should contain:

```cron
@reboot /bin/bash -lc 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; cd /home/opc/afinal_gateway && nohup node src/index.js >> /home/opc/afinal_gateway/gateway.log 2>&1 < /dev/null & # afinal_gateway'
@reboot /bin/bash -lc 'nohup /home/opc/cloudflared tunnel run afinalchapter-gateway >> /home/opc/cloudflared.log 2>&1 < /dev/null &'
```

## Cleanup checklist
- Delete bastion sessions after admin work:

```bash
oci bastion session delete --session-id <SESSION_OCID> --region us-phoenix-1 --profile goclearonline --force
```

- Delete local temp keys:

```bash
rm -f /tmp/bastion_session_key /tmp/bastion_session_key.pub
```

- Keep OCI security list ingress minimal (SSH only) if using tunnel.

## Security notes
- Never paste private keys in chat or commits.
- Rotate OCI API keys that were exposed.
- Rotate Meta tokens that were shared.
- Rotate `ORACLE_API_KEY` after major setup/debug sessions.
