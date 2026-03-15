# Worker Session Watchdog v1 (Design + Scaffold)

Status: additive scaffold implemented. No deployment, no migration execution, no automatic restart loops.

## Scope
This v1 implementation adds a Mac Mini watchdog process and control-plane/read APIs for browser-dependent workers.

Goals covered:
- detect fake-healthy worker states
- detect login-required/browser-crash/stuck/rate-limited states
- write normalized worker session state into Supabase
- emit session events for monitoring and triage
- quarantine workers in v1 policy (alert + quarantine)
- keep release manual and audit-logged

## Canonical States
- `healthy`
- `degraded`
- `login_required`
- `browser_crashed`
- `rate_limited`
- `stuck`
- `restarting`
- `paused`
- `quarantined`

## v1 Transition Notes
- `healthy -> degraded` when fake-healthy/no-progress or stale lease risk appears.
- `degraded -> login_required|browser_crashed|stuck` based on probes.
- `login_required|browser_crashed|stuck -> quarantined` under v1 policy.
- `quarantined -> healthy` only by manual release endpoint with `fresh_probe_passed=true`.

## Supabase Tables (Migration Draft)
Migration file:
- `supabase/migrations/20260315170000_worker_session_watchdog_scaffold.sql`

Tables:
- `worker_sessions`
- `worker_session_events`
- `worker_recovery_policies`

Key indexes:
- `worker_sessions(worker_id)` unique
- `worker_sessions(session_state, updated_at desc)`
- `worker_session_events(worker_id, created_at desc)`
- `worker_session_events(severity, created_at desc)`

## Mac Mini Watchdog Service
Path:
- `opt/nexus-services/worker-session-watchdog`

Main files:
- `worker.js`
- `src/config.js`
- `src/probes.js`
- `src/stateMachine.js`
- `src/watchdog.js`
- `src/db.js`

v1 defaults:
- poll every 15s
- `WATCHDOG_AUTO_RECOVERY_ENABLED=false`
- quarantine enabled
- manual release required

## Gateway Read APIs
Added:
- `GET /api/system/worker-sessions`
- `GET /api/system/worker-session-events`

Extended:
- `GET /api/system/health` now includes:
  - `watchdog_unhealthy_workers`
  - `watchdog_quarantined_workers`
  - `watchdog_critical_events_24h`

## Control Plane APIs
Added:
- `POST /api/control-plane/workers/:workerId/quarantine`
- `POST /api/control-plane/workers/:workerId/release`

Release guard:
- requires `fresh_probe_passed=true`

Extended:
- `GET /api/control-plane/state` includes:
  - `summary_metrics.watchdog_unhealthy_workers`
  - `summary_metrics.watchdog_quarantined_workers`
  - `summary_metrics.watchdog_critical_events_24h`

## Test Plan (Manual)

1) Simulate login-required
- Write worker heartbeat metadata with `session_state_probe=login_required`.
- Run watchdog once.
- Verify `worker_sessions.session_state='quarantined'`.
- Verify critical `worker_session_events` row.

2) Simulate browser crash
- Set metadata `process_running=false` or `browser_running=false`.
- Run watchdog once.
- Verify `browser_crashed` reasoning and quarantine event.

3) Simulate fake-healthy
- Keep heartbeat fresh and in-flight job, but make `last_success_at` old.
- Run watchdog once.
- Verify `degraded` transition and warning event.

4) Simulate stale leased job
- Create `job_queue` row with `status=leased` and old `leased_at`.
- Run watchdog once.
- Verify `queue_stale_lease_risk` warning event.

5) Verify read APIs
```bash
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://localhost:3000/api/system/worker-sessions | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://localhost:3000/api/system/worker-session-events | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://localhost:3000/api/system/health | jq
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://localhost:3000/api/control-plane/state | jq
```

6) Quarantine action
```bash
curl -s -X POST \
  -H "content-type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -d '{"reason":"manual watchdog quarantine","worker_type":"openclaw_worker"}' \
  http://localhost:3000/api/control-plane/workers/<WORKER_ID>/quarantine | jq
```

7) Release action (manual + fresh probe)
```bash
curl -s -X POST \
  -H "content-type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -d '{"reason":"probe passed","fresh_probe_passed":true}' \
  http://localhost:3000/api/control-plane/workers/<WORKER_ID>/release | jq
```

## Graceful Degradation
If watchdog tables are missing, read endpoints return safe empty shapes with warnings/missing table markers.

## Hard Boundaries
- no live trading
- no broker execution
- no OpenClaw on Oracle
- no automatic browser restart loops in v1
