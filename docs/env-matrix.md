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

Validation:
- Startup validation module: `gateway/src/config/envValidation.js`.
- Strict mode support via `ENV_VALIDATE_STRICT=true`.

## C) Mac Mini AI Node (secret/private)
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
