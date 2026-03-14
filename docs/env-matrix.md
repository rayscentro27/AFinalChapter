# Env Matrix (Phase 1)

## A) Netlify Frontend (public)
Required:
- `VITE_API_BASE_URL`: Gateway base URL.
- `VITE_BACKEND_MODE`: runtime adapter selection.
- `VITE_SUPABASE_URL`: Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: public anon key.

Optional:
- Feature flags for UI-only modules.

Validation:
- Frontend boot check for missing `VITE_*` values.
- Fail-fast in build for empty placeholders.

## B) Oracle VM Gateway (secret/private)
Required:
- `INTERNAL_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Channel credentials used by enabled providers (`TWILIO_*`, `META_*`, `WHATSAPP_*`).

Recommended runtime controls:
- `SYSTEM_MODE`
- `QUEUE_ENABLED`
- `AI_JOBS_ENABLED`
- `RESEARCH_JOBS_ENABLED`
- `NOTIFICATIONS_ENABLED`
- `JOB_MAX_RUNTIME_SECONDS`
- `WORKER_MAX_CONCURRENCY`
- `TENANT_JOB_LIMIT_ACTIVE`
- `WORKER_HEARTBEAT_SECONDS`
- `ENV_VALIDATE_STRICT`

Proxy trust controls:
- `TRUST_PROXY`
- `TRUST_PROXY_CIDRS`
- `TRUST_PROXY_ALLOW_ALL`

Validation:
- Startup validation module: `gateway/src/config/envValidation.js`.
- In production (`NODE_ENV=production`), strict validation defaults to enabled unless explicitly overridden.
- When `TRUST_PROXY=true`, configure `TRUST_PROXY_CIDRS` (preferred) or explicitly set `TRUST_PROXY_ALLOW_ALL=true`.

## C) Netlify Functions (secret/private)
Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` (required for encrypted `tenant_integrations.credentials` at rest).

Optional (recommended for key rotation):
- `INTEGRATION_CREDENTIALS_ENCRYPTION_ACTIVE_KID` (write key id for new envelopes).
- `INTEGRATION_CREDENTIALS_ENCRYPTION_KEYRING` (JSON map of key ids to secrets).
- `INTEGRATION_CREDENTIALS_ENCRYPTION_PREVIOUS_KEY` (legacy read-only fallback during rotation windows).

Validation:
- Function-level fail-fast for missing/ambiguous write key when encrypting credentials.
- Decryption supports multi-key fallback (`kid`, active key, previous key, keyring) to keep legacy rows readable during rotations.
- Keep these variables server-side only; never expose as `VITE_*`.

## D) Mac Mini AI Node (secret/private)
Required (expected):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- provider keys actually used by research workers (`GEMINI_API_KEY`, optional fallback keys)

Recommended:
- `SYSTEM_MODE=research`
- `QUEUE_ENABLED`
- worker concurrency and runtime caps aligned with gateway settings.

Validation:
- Mirror gateway-style startup validation on Mac worker entrypoints.
- Reject startup when required AI routing vars are missing.

## Naming convention
- Upper snake case only.
- `VITE_*` is frontend-public only.
- all credentials remain non-`VITE_*` and server-side only.
