# Env Matrix (Phase 1)

## Backend (Fastify gateway on Oracle VM)

### Required at startup (secret)
- `INTERNAL_API_KEY`: internal/system endpoint auth.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: service-role DB access.
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_TOKEN`
- `META_PAGE_ACCESS_TOKEN`

### Recommended for full integrations (secret)
- `GEMINI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TRADINGVIEW_WEBHOOK_SECRET`

### Runtime safety controls (non-secret)
- `SYSTEM_MODE` (`development|research|production|maintenance|degraded|emergency_stop`)
- `QUEUE_ENABLED`
- `AI_JOBS_ENABLED`
- `RESEARCH_JOBS_ENABLED`
- `NOTIFICATIONS_ENABLED`
- `CONTROL_PLANE_WRITE_ENABLED` (keep `false` by default)
- `JOB_MAX_RUNTIME_SECONDS`
- `WORKER_MAX_CONCURRENCY`
- `TENANT_JOB_LIMIT_ACTIVE`
- `WORKER_HEARTBEAT_SECONDS`
- `ENV_VALIDATE_STRICT`

### Proxy trust controls (non-secret)
- `TRUST_PROXY`
- `TRUST_PROXY_CIDRS`
- `TRUST_PROXY_ALLOW_ALL`

### Optional backend settings
Secret:
- `OPENROUTER_API_KEY`
- `NVIDIA_NIM_API_KEY`
- `SUPABASE_JWT_SECRET`

Non-secret:
- `LOG_LEVEL`
- `PORT`
- `TRUST_PROXY`
- `ALLOWED_ORIGINS`
- `AI_PROVIDER`

### Validation implementation
- Module: `gateway/src/config/envValidation.js`
- Boot config: `gateway/src/env.js`
- Strict mode defaults on in production (`ENV_VALIDATE_STRICT=true` recommended everywhere).
- When `TRUST_PROXY=true`, configure `TRUST_PROXY_CIDRS` (preferred) or explicitly set `TRUST_PROXY_ALLOW_ALL=true`.

## Netlify Functions (server-side secret)

### Required
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` (required for encrypted `tenant_integrations.credentials` at rest)

### Optional for key rotation
- `INTEGRATION_CREDENTIALS_ENCRYPTION_ACTIVE_KID`
- `INTEGRATION_CREDENTIALS_ENCRYPTION_KEYRING` (JSON map of key ids to secrets)
- `INTEGRATION_CREDENTIALS_ENCRYPTION_PREVIOUS_KEY`

### Validation notes
- Function-level fail-fast for missing/ambiguous write key when encrypting credentials.
- Decryption should support multi-key fallback (`kid`, active key, previous key, keyring) for rotation windows.
- Keep these server-side only; never expose as `VITE_*`.

## Frontend (Netlify, documentation only)

Public (`VITE_*` only):
- `VITE_API_BASE_URL`
- `VITE_BACKEND_MODE`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Mac Mini AI node (documentation only)

Expected secret variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- model/provider keys used by research workers

Expected non-secret controls:
- `SYSTEM_MODE=research`
- queue/runtime caps aligned to gateway policy
