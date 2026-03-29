# RUNBOOK.md

This runbook sets up:
- Web app: `https://app.goclearonline.cc` (Netlify)
- API: `https://api.goclearonline.cc` (Oracle VM + Fastify + Nginx)
- DNS: Cloudflare
- AI Gateway foundation route + env scaffolding (no provider calls yet)

All placeholders are explicit; do not commit real secrets.

---

## Phase 0 - Repo Layout + Local Scaffolding

### 0.1 Layout recommendation (deliverable #1)

Recommended: **monorepo** (already matches this project)

- `apps/web` (or current root Vite app)
- `apps/api` (or current `gateway/` Fastify app)
- `deploy/netlify/` (Netlify templates)
- `deploy/cloudflare/` (DNS automation scripts)
- `deploy/oracle/` (Nginx + systemd + bootstrap)
- `.github/workflows/` (deploy automation)

Two-repo alternative (only if team boundaries demand it):
- `nexus-web` (Vite React)
- `nexus-api` (Fastify gateway)

Expected output:
- You have clear separation between web/app and API infra files.

### 0.2 Fastify AI Gateway foundation added (deliverable #5)

Implemented in code:
- CORS allowlist via `ALLOWED_ORIGINS` + optional Netlify preview URLs
- `GET /healthz`
- `POST /api/ai/execute` stub (secure: requires `x-api-key`)
- config module reads:
  - `NODE_ENV`
  - `ALLOWED_ORIGINS`
  - `GEMINI_API_KEY`
  - `OPENROUTER_API_KEY`
  - `NVIDIA_NIM_API_KEY`
  - `ENABLE_NIM_DEV` (default false)
- logger redaction expanded for AI provider keys

Files:
- `gateway/src/config/aiGatewayConfig.js`
- `gateway/src/routes/ai_gateway.js`
- `gateway/src/routes/health.js`
- `gateway/src/index.js`
- `gateway/src/env.js`
- `gateway/.env.example`

Expected output:
- API can answer `/healthz` and `/api/ai/execute` without exposing secrets.

---

## Phase 1 - Netlify Setup (Web)

## 1.1 Config files (deliverable #2)

Use template:
- `deploy/netlify/netlify.toml.example`

If needed, copy into project root:

```bash
cp deploy/netlify/netlify.toml.example netlify.toml
```

Required frontend env var:
- `VITE_API_BASE_URL=https://api.goclearonline.cc`
- `VITE_SUPABASE_URL=https://<SUPABASE_PROJECT>.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>`

Required when Supabase Authentication -> Bot Detection is enabled:
- `VITE_TURNSTILE_ENABLED=true`
- `VITE_TURNSTILE_SITE_KEY=<TURNSTILE_SITE_KEY>`

Required for local Supabase CLI parity when `supabase/config.toml` keeps captcha enabled:
- `SUPABASE_AUTH_CAPTCHA_SECRET=<TURNSTILE_SECRET>`

Optional redirects (beneficial for SPA):
- `deploy/netlify/_redirects.example`

Expected output:
- `netlify.toml` has build + SPA redirect.

## 1.2 Netlify CLI link/init + env vars

```bash
cd <WEB_REPO_OR_MONOREPO_ROOT>

# Create site if needed
netlify sites:create --name <NETLIFY_SITE_NAME>

# Link local repo to the Netlify site
netlify link --name <NETLIFY_SITE_NAME>

# Set env var for production context
netlify env:set VITE_API_BASE_URL "https://api.goclearonline.cc" --context production
netlify env:set VITE_SUPABASE_URL "https://<SUPABASE_PROJECT>.supabase.co" --context production
netlify env:set VITE_SUPABASE_ANON_KEY "<SUPABASE_ANON_KEY>" --context production
netlify env:set VITE_TURNSTILE_ENABLED "true" --context production
netlify env:set VITE_TURNSTILE_SITE_KEY "<TURNSTILE_SITE_KEY>" --context production

# Optional for deploy previews
netlify env:set VITE_API_BASE_URL "https://api.goclearonline.cc" --context deploy-preview
netlify env:set VITE_SUPABASE_URL "https://<SUPABASE_PROJECT>.supabase.co" --context deploy-preview
netlify env:set VITE_SUPABASE_ANON_KEY "<SUPABASE_ANON_KEY>" --context deploy-preview
netlify env:set VITE_TURNSTILE_ENABLED "true" --context deploy-preview
netlify env:set VITE_TURNSTILE_SITE_KEY "<TURNSTILE_SITE_KEY>" --context deploy-preview

# Validate local/frontend auth env assumptions before deploy
npm run auth:check-env

# Deploy preview
netlify deploy

# Deploy production
netlify deploy --prod
```

Expected output:
- Production deploy URL exists.
- Netlify project has `VITE_API_BASE_URL` set.
- Netlify project has the Supabase auth vars and Turnstile frontend vars set when captcha is enforced.

## 1.3 Auth troubleshooting

Use this when login or signup fails with captcha-related errors, especially `auth/v1/token` returning `500`.

Local setup helper:

```powershell
Set-Location C:\Users\raysc\AFinalChapter
.\scripts\set-supabase-auth-captcha-secret.ps1
```

Or through npm:

```powershell
Set-Location C:\Users\raysc\AFinalChapter
npm run auth:set-captcha-secret
```

Session-only test run without restarting Supabase:

```powershell
Set-Location C:\Users\raysc\AFinalChapter
.\scripts\set-supabase-auth-captcha-secret.ps1 -SessionOnly -SkipRestart
```

Exact Supabase dashboard fields to verify:
- Supabase Dashboard -> Authentication -> Bot Detection
- `Enable Bot Detection`: ON
- `Provider`: Cloudflare Turnstile
- `Secret key`: the secret from the same Cloudflare Turnstile widget as your frontend site key

Exact Netlify fields to verify:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_TURNSTILE_ENABLED=true`
- `VITE_TURNSTILE_SITE_KEY`

Exact frontend behavior expected after deploy:
- Login page renders a Turnstile widget when captcha is enabled.
- Signup page renders a Turnstile widget when captcha is enabled.
- Login without solving captcha is blocked in the UI.
- Signup without solving captcha is blocked in the UI.

If the frontend blocks correctly but `auth/v1/token` still returns `500`, treat the remaining issue as hosted Supabase Turnstile configuration until proven otherwise.

---

## Phase 2 - Cloudflare DNS Setup

## 2.1 DNS record plan (deliverable #3)

- `app.goclearonline.cc` -> `CNAME` -> `<NETLIFY_SITE_TARGET>` (e.g. `<NETLIFY_SITE_NAME>.netlify.app`)
- `api.goclearonline.cc` -> `A` -> `<ORACLE_PUBLIC_IP>`

Proxy guidance:
- API: start **DNS-only** (`proxied=false`, grey cloud)
- App: safest initial cutover is DNS-only; you can enable proxy later once stable

If you proxy API later, Cloudflare SSL mode should be **Full (strict)**.

## 2.2 CLI/API commands

Idempotent script:

```bash
CF_API_TOKEN=<CLOUDFLARE_API_TOKEN> \
./deploy/cloudflare/dns_records.sh goclearonline.cc <NETLIFY_SITE_TARGET> <ORACLE_PUBLIC_IP>
```

Direct API examples:

```bash
./deploy/cloudflare/dns_api_examples.sh
```

Get zone id if needed:

```bash
curl -sS "https://api.cloudflare.com/client/v4/zones?name=goclearonline.cc" \
  -H "Authorization: Bearer <CLOUDFLARE_API_TOKEN>" \
  -H "Content-Type: application/json"
```

Expected output:
- `app.goclearonline.cc` and `api.goclearonline.cc` resolve to expected targets.

---

## Phase 3 - Oracle VM API (Nginx + TLS + systemd)

## 3.1 VM bootstrap + reverse proxy (deliverable #4)

Templates:
- `deploy/oracle/nginx.api.goclearonline.cc.conf`
- `deploy/oracle/nexus-api.service`
- `deploy/oracle/bootstrap.sh`

Run on Oracle VM:

```bash
cd <REPO_ON_VM>
bash deploy/oracle/bootstrap.sh
```

Manual equivalent:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

sudo cp deploy/oracle/nginx.api.goclearonline.cc.conf /etc/nginx/sites-available/nexus-api
sudo ln -sf /etc/nginx/sites-available/nexus-api /etc/nginx/sites-enabled/nexus-api
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d api.goclearonline.cc --non-interactive --agree-tos -m <LETSENCRYPT_EMAIL>

sudo cp deploy/oracle/nexus-api.service /etc/systemd/system/nexus-api.service
sudo systemctl daemon-reload
sudo systemctl enable nexus-api
sudo systemctl restart nexus-api
sudo systemctl status nexus-api --no-pager
```

Expected output:
- `nginx -t` succeeds.
- `certbot` issues certificate.
- `nexus-api` service is active.

## 3.2 Firewall and OCI network notes

On VM (UFW):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

OCI Security List / NSG (ingress):
- allow TCP 80 from `0.0.0.0/0`
- allow TCP 443 from `0.0.0.0/0`
- restrict SSH 22 to your admin IP(s)

Expected output:
- Only intended ports are reachable.

---

## Phase 4 - API Env + AI Gateway foundation

## 4.1 Environment template keys

In `gateway/.env` (never commit):

```bash
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
TRUST_PROXY=true
ALLOWED_ORIGINS=https://app.goclearonline.cc
ALLOW_NETLIFY_PREVIEWS=true

INTERNAL_API_KEY=<INTERNAL_API_KEY>
SUPABASE_URL=<SUPABASE_URL>
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY>

# AI provider keys (optional for stub route; required when providers enabled)
GEMINI_API_KEY=
OPENROUTER_API_KEY=
NVIDIA_NIM_API_KEY=
ENABLE_NIM_DEV=false
```

Restart service after changes:

```bash
sudo systemctl restart nexus-api
```

Expected output:
- API boots with no missing env var errors.

---

## Phase 5 - Deployment workflows (deliverable #6)

## 5.1 Option A: Manual pull + restart (simple now)

On Oracle VM:

```bash
cd /opt/nexus-api
git pull origin main
cd gateway
npm ci --omit=dev
sudo systemctl restart nexus-api
sudo systemctl status nexus-api --no-pager
```

Expected output:
- New commit hash on VM and service active.

## 5.2 Option B: GitHub Actions SSH deploy (recommended later)

Workflow file already provided:
- `.github/workflows/deploy-api-oracle.yml`

Required GitHub repo secrets:
- `ORACLE_HOST` = `<ORACLE_PUBLIC_IP_OR_HOSTNAME>`
- `ORACLE_USER` = `<VM_SSH_USER>`
- `ORACLE_SSH_PRIVATE_KEY` = `<PEM_PRIVATE_KEY_CONTENT>`
- `ORACLE_APP_DIR` = `/opt/nexus-api`

Expected output:
- Action run uploads code, runs `npm ci --omit=dev`, restarts `nexus-api`.

---

## Phase 6 - Validation checklist (deliverable #7)

## 6.1 DNS resolution

```bash
dig +short app.goclearonline.cc
dig +short api.goclearonline.cc
```

Expected output:
- `app` resolves to Netlify target.
- `api` resolves to Oracle public IP.

## 6.2 SSL certificate

```bash
openssl s_client -connect api.goclearonline.cc:443 -servername api.goclearonline.cc </dev/null 2>/dev/null | openssl x509 -noout -issuer -subject -dates
```

Expected output:
- Valid certificate issuer + valid date range.

## 6.3 Health endpoint

```bash
curl -sS https://api.goclearonline.cc/healthz
```

Expected output:
- JSON with `{"ok":true,...}`

## 6.4 AI execute stub

```bash
curl -sS -X POST https://api.goclearonline.cc/api/ai/execute \
  -H "Content-Type: application/json" \
  -H "x-api-key: <INTERNAL_API_KEY>" \
  -d '{"prompt":"hello","model":"stub"}'
```

Expected output:
- JSON with `"status":"stub"`, `"ok":true`

## 6.5 Browser check from app

Open `https://app.goclearonline.cc` in browser and verify frontend API base points to:
- `https://api.goclearonline.cc`

Quick JS console check:

```js
fetch('https://api.goclearonline.cc/healthz').then(r => r.json()).then(console.log)
```

Expected output:
- Health JSON returned with no CORS error from app origin.

---

## Notes

- Keep API DNS record DNS-only until Oracle TLS is stable.
- If later enabling Cloudflare proxy for API, set SSL/TLS mode to **Full (strict)**.
- Never commit `.env`, private keys, or API tokens.
