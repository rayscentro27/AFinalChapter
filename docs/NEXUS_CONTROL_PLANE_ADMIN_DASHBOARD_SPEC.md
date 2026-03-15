# Nexus Control Plane Admin Dashboard Spec

## Purpose
Add a production-safe operations console inside existing React admin UX that controls runtime behavior without redeploys.

## Navigation
Recommended nav entry:
- `Admin > Control Plane`

Tabs:
1. Overview
2. System Mode
3. Workers
4. Queue
5. AI Controls
6. Feature Flags
7. Incidents
8. Simulations
9. Audit Log

## Layout
Top row (always visible):
- system mode badge
- queue status
- active incidents
- worker stale count
- dead-letter count

Main area:
- left: controls
- right: live telemetry and safety notes

## Section Specs
### 1) System mode control
Purpose:
- Set global runtime mode.

Metrics:
- current mode
- mode change history (last 10)

Actions:
- switch to development/research/production/maintenance/degraded/emergency_stop

Confirmations:
- typed confirmation for `maintenance`, `degraded`, `emergency_stop`

Permissions:
- superadmin only for emergency stop

Dependencies:
- `system_config`
- `/api/control-plane/state`

UI components:
- segmented control
- confirmation modal with reason textarea

Failure/empty states:
- if fetch fails, keep controls disabled and show warning banner.

### 2) Worker controls
Purpose:
- Manage worker health and execution volume.

Metrics:
- workers by status
- stale workers
- quarantined workers

Actions:
- pause worker type
- resume worker type
- set max concurrency
- quarantine worker

Confirmations:
- reason required for quarantine and pause-all.

Permissions:
- admin/superadmin

Dependencies:
- `worker_heartbeats`
- `worker_controls`
- `/api/system/workers`

UI components:
- worker table
- inline sliders/inputs
- action drawer

### 3) Queue controls
Purpose:
- protect stability during spikes.

Metrics:
- queue depth total
- depth by status
- oldest pending age
- dead-letter count

Actions:
- pause queue intake
- pause by job type
- set queue depth cap
- requeue selected dead-letter jobs

Confirmations:
- required for requeue and global queue pause.

Permissions:
- admin/superadmin

Dependencies:
- `job_queue`
- `queue_controls`
- `/api/system/jobs`

UI components:
- stacked bar by status
- job-type policy table
- requeue modal

### 4) Feature flags
Purpose:
- controlled rollout without deploys.

Metrics:
- enabled/disabled counts
- recently changed flags

Actions:
- toggle flag
- set scoped override
- set expiry

Confirmations:
- required when flag impacts client-facing behavior.

Permissions:
- admin/superadmin

Dependencies:
- `feature_flags`

UI components:
- flag list with scope chips
- expiry picker

### 5) AI usage controls
Purpose:
- avoid cost spikes and unstable fallback behavior.

Metrics:
- provider usage by day
- cache hit/miss
- blocked requests due to policy

Actions:
- force cache-only mode
- disable fallback provider
- set daily quotas
- set max transcript size

Permissions:
- admin/superadmin

Dependencies:
- `ai_usage_limits`
- `/api/system/health`

UI components:
- limit cards
- quota editor panel

### 6) Incident response controls
Purpose:
- contain incidents quickly.

Metrics:
- active incidents
- mttr (later phase)
- affected systems

Actions:
- open incident
- trigger emergency stop
- resolve incident

Confirmations:
- strict two-step confirmations.

Permissions:
- superadmin for emergency stop

Dependencies:
- `incident_events`

UI components:
- incident timeline
- severity badge and action panel

### 7) Audit log viewer
Purpose:
- accountability and compliance.

Metrics:
- actions/day
- high-risk action count

Actions:
- filter/search/export (phase 2 export)

Permissions:
- admin/superadmin (read-only)

Dependencies:
- `control_plane_audit_log`

UI components:
- paginated table with diff viewer

### 8) Testing and simulation controls
Purpose:
- validate behavior before wide rollout.

Metrics:
- running simulations
- pass/fail summary
- queue/worker impact

Actions:
- start user simulation
- start load test
- start chaos test
- stop simulation

Confirmations:
- scenario + duration + safety cap required.

Permissions:
- superadmin/admin (policy controlled)

Dependencies:
- simulation job records (new table or `job_queue` tags)

UI components:
- simulation wizard
- result cards

## Launch Readiness Widget
Must show:
- auth/health endpoint status
- queue status
- worker freshness
- incidents open/closed
- rollback readiness checklist link

## Phase Plan
Phase 1:
- Overview + System Mode + Workers + Queue + Audit read.

Phase 2:
- Feature flags + AI controls + incident panel write actions.

Phase 3:
- Simulation orchestration and chaos controls.

## Safety Defaults
- all destructive controls hidden behind explicit confirmation.
- no bulk actions without reason.
- no controls active for non-authorized roles.

### 10) Worker session health (watchdog)
Purpose:
- detect browser-session failures that look healthy at process level.

Metrics:
- counts by `worker_sessions.session_state`
- quarantined workers
- critical session events (24h)
- queue-risk workers (stale leased jobs + unhealthy state)

Actions:
- quarantine worker
- release worker (requires fresh probe confirmation)

Confirmations:
- quarantine/release require reason.
- release requires explicit `fresh_probe_passed=true`.

Dependencies:
- `worker_sessions`
- `worker_session_events`
- `worker_controls`
- `/api/system/worker-sessions`
- `/api/system/worker-session-events`
- `/api/control-plane/workers/:workerId/quarantine`
- `/api/control-plane/workers/:workerId/release`

UI components:
- state distribution cards
- session/event timeline
- queue risk table
- quarantine/release action modal
