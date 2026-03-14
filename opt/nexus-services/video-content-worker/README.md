# Nexus Video Content Worker

Scaffold worker for generating draft video content packs from Nexus research and transcript inputs.

## Safety
- Draft-only output (`status=draft`).
- No auto-publish.
- No schema migrations are executed by this worker.
- Queue mode is optional and off by default.

## Install
```bash
cd /opt/nexus-services/video-content-worker
npm ci
cp .env.example .env
```

## Run once (direct mode)
```bash
node worker.js --once --tenant <TENANT_UUID>
```

## Run once (queue mode)
```bash
VIDEO_WORKER_QUEUE_ENABLED=true node worker.js --once --queue
```

## Check syntax
```bash
npm run check
```

## Output target
Default write target is `research_artifacts` with `summary/key_points/tags/trace_id` fields and draft metadata embedded in tags/key points.

If `VIDEO_WORKER_DRY_RUN=true`, worker only prints previews and does not write rows.
