# System Safe Pause/Resume Playbook (Ticket E2)

## Purpose
Standardize incident containment and recovery with repeatable operator commands.

Scope:
- Fastify control-plane endpoints only
- no schema migration
- no deployment automation

## Required Inputs
Set these before running commands:

```bash
cd /home/rayscentro/Projects/AFinalChapter_linux/gateway
export SYSTEM_API_BASE_URL="http://127.0.0.1:3000"
export INTERNAL_API_KEY="<INTERNAL_API_KEY>"
export TENANT_ID="<TENANT_UUID>"
export REAL_USER_BEARER_TOKEN="<REAL_USER_JWT>"
```

## 1) Baseline Diagnostics
```bash
npm run system:diagnostics
```

This calls:
- `GET /api/system/health`
- `GET /api/system/jobs`
- `GET /api/system/workers`
- `GET /api/system/errors?hours=24&limit=50`

## 2) Safe Pause (Incident Containment)
```bash
npm run system:safe-pause
```

Optional explicit reason:
```bash
node scripts/system_control_cli.js incident-contain --reason="incident containment"
```

Expected post-pause health minimums:
- `system_mode=maintenance`
- `queue_enabled=false`
- `ai_jobs_enabled=false`
- `research_jobs_enabled=false`

## 3) Safe Resume (Controlled Recovery)
```bash
npm run system:safe-resume
```

Optional explicit reason:
```bash
node scripts/system_control_cli.js incident-resume --reason="incident resolved"
```

Expected:
- prior mode/flags restored from pause snapshot
- diagnostics endpoint responses remain healthy

## 4) Manual Control Overrides
Set mode directly:
```bash
node scripts/system_control_cli.js mode-set --mode=production
```

Update selected flags:
```bash
node scripts/system_control_cli.js flags-update \
  --queue_enabled=true \
  --ai_jobs_enabled=true \
  --research_jobs_enabled=true \
  --notifications_enabled=true \
  --worker_max_concurrency=4 \
  --job_max_runtime_seconds=300
```

## 5) Failure Handling
If a command fails:
1. rerun `npm run system:diagnostics`
2. inspect `/api/system/errors` output in diagnostics payload
3. verify bearer token has tenant admin permission (`monitoring.manage`)
4. verify audit table exists (`audit_events`) because control-plane writes fail closed if audit logging is unavailable
