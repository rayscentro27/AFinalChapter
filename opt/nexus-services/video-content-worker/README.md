# Nexus Video Content Worker

Phase A scope:
- A1: direct-run draft generation hardening and tenant-scoped validation
- A2: queue retry/backoff/dead-letter hardening
- A3: review workflow integration and publish-handoff gating

## Safety
- Draft-only output (`status=draft`).
- Manual review is required before any publish handoff.
- Publish handoff requests are blocked in Phase A3.
- No auto-publish.
- No schema migrations are executed by this worker.
- Queue mode is optional and off by default.

## Install
```bash
cd /opt/nexus-services/video-content-worker
npm install
cp .env.example .env
```

## Direct-Run Validation (Tenant Required)
Dry-run:
```bash
node worker.js --once --tenant <TENANT_UUID> --dry-run
```

Non-dry-run (writes draft artifacts):
```bash
node worker.js --once --tenant <TENANT_UUID> --no-dry-run
```

## Queue Validation
Dry-run queue pass:
```bash
VIDEO_WORKER_QUEUE_ENABLED=true node worker.js --once --queue --dry-run
```

Queue failure policy:
- retryable failures -> `retry_wait` + exponential backoff
- terminal failures or max attempts reached -> `dead_letter`

Configurable controls:
- `VIDEO_WORKER_QUEUE_RETRY_BASE_DELAY_SECONDS`
- `VIDEO_WORKER_QUEUE_RETRY_MAX_DELAY_SECONDS`
- `VIDEO_WORKER_QUEUE_MAX_ATTEMPTS_DEFAULT`

Review workflow controls:
- `VIDEO_WORKER_REVIEW_POLICY_VERSION`

## Check and Test
```bash
npm run check
npm run test
```

## Write Safety Guards
Non-dry-run writes can be blocked if:
- insufficient evidence (`VIDEO_WORKER_MIN_EVIDENCE_ITEMS`)
- tenant-scoped signals missing when `VIDEO_WORKER_STRICT_TENANT_SCOPE=true`
- publish handoff requested without manual approval metadata

## Output Target
Default write target is `research_artifacts` with explicit draft/review metadata in `key_points` and `tags`, including `tenant_id:<TENANT_UUID>` for traceability.
