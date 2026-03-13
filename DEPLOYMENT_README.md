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
