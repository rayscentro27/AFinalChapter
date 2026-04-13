# Env Workspace

This folder is the local env workspace for Nexus.

Use one file at a time:

1. `env/frontend/.env`
2. `env/gateway/.env`
3. `env/netlify-functions/.env`
4. `env/supabase-auth/.env`
5. `env/mac-mini-worker/.env`
6. `env/tenant-integrations/.env`

Rules:
- Fill the file, save it, then tell me which one you completed.
- I will verify that file before you move to the next one.
- Secret-bearing `env` files are ignored by git on purpose.
- `tenant-integrations/.env` is a staging sheet for app credentials that will later be copied into `/admin/credentials`.

File purposes:
- `frontend/.env`: browser-visible Vite variables.
- `gateway/.env`: Oracle VM / Fastify backend secrets and runtime controls.
- `netlify-functions/.env`: server-side secrets for Netlify Functions.
- `supabase-auth/.env`: Supabase auth parity and local captcha settings.
- `mac-mini-worker/.env`: Mac Mini worker configuration.
- `tenant-integrations/.env`: tenant integration credentials staged before entry in the app.
