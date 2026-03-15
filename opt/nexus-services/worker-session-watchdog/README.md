# Worker Session Watchdog (v1)

Mac Mini-side watchdog for browser-dependent workers (OpenClaw / Comet).

## Scope
- Detects session/process/browser/progress failure patterns.
- Writes `worker_sessions` and `worker_session_events` records to Supabase.
- Applies **v1 policy**: alert + quarantine (`worker_controls.paused=true`).
- No automatic browser restart loops.

## Install
```bash
cd /opt/nexus-services/worker-session-watchdog
npm install
cp .env.example .env
```

## Run Once
```bash
node worker.js --once
```

## Run Continuous Loop
```bash
node worker.js
```

## Safety Defaults
- Poll interval: `WATCHDOG_POLL_SECONDS=15`
- Auto recovery disabled: `WATCHDOG_AUTO_RECOVERY_ENABLED=false`
- Quarantine enabled: `WATCHDOG_QUARANTINE_ENABLED=true`
- Manual release required via control-plane endpoint.

## Probe Signals
- `process_running`
- `browser_running`
- `session_state_probe` (login/rate-limit/model unavailable signals)
- progress aging (`last_success_at`, `current_job_started_at`)
- stale lease detection from `job_queue`
- page signature repeats from worker metadata

## Canonical Session States
- `healthy`
- `degraded`
- `login_required`
- `browser_crashed`
- `rate_limited`
- `stuck`
- `restarting`
- `paused`
- `quarantined`

## v1 Transition Policy
- `healthy -> degraded` on fake-healthy/no-progress threshold.
- `degraded -> login_required|browser_crashed|stuck` when probes confirm.
- `login_required|browser_crashed|stuck -> quarantined` under v1 policy.
- `quarantined -> healthy` only by manual operator release and fresh probe confirmation.
