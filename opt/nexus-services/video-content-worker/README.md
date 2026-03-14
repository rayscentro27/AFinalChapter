# Nexus Video Content Worker

Phase A Ticket A1 scope:
- direct-run draft generation hardening
- tenant-scoped validation
- dry-run and non-dry-run command validation

## Safety
- Draft-only output (`status=draft`).
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

## Queue Run (Optional)
```bash
VIDEO_WORKER_QUEUE_ENABLED=true node worker.js --once --queue --dry-run
```

## Check and Test
```bash
npm run check
npm run test
```

## Write Safety Guards
Non-dry-run writes can be blocked if:
- insufficient evidence (`VIDEO_WORKER_MIN_EVIDENCE_ITEMS`)
- tenant-scoped signals missing when `VIDEO_WORKER_STRICT_TENANT_SCOPE=true`

## Output Target
Default write target is `research_artifacts` with draft markers in `key_points` and `tags`, including `tenant_id:<TENANT_UUID>` for traceability.
