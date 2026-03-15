# Queue Architecture Addendum (Watchdog v1)

## Purpose
This addendum documents how Worker Session Watchdog quarantine signals affect queue job claiming.

## Watchdog Quarantine Integration (v1)
- Queue claim path checks `worker_controls` for `paused=true` on the active `worker_id`.
- If paused/quarantined, claim returns no jobs and worker heartbeats as paused.
- This blocks new job acceptance while preserving jobs in `pending` / `retry_wait`.
- Release remains manual via control-plane release endpoint with `fresh_probe_passed=true`.

## Safety Notes
- No destructive queue mutation is performed during claim blocking.
- No automatic restart/recovery loop is enabled in v1.
- Quarantine and release actions are audit-logged via control-plane routes.
