# Nexus Go-Live Commander Update (Control Plane Integrated)

## Goal
Make the Control Plane the operational command center for launch, simulation, chaos, and rollback.

## Updated Go-Live Timeline
### T-7 to T-2 days (pre-launch hardening)
- Set `system_mode=research`.
- Keep queue intake limited to approved job types.
- Validate worker health and stale recovery behavior.
- Dry-run incident controls and emergency stop.

### T-1 day (launch rehearsal)
- Run 100-user simulation in isolated test tenant mode.
- Execute at least one controlled chaos scenario (worker crash + queue spike).
- Confirm rollback runbook with control toggles.

### Launch day (soft launch)
- Start in `production` with conservative caps.
- Keep AI usage limits tight for first 24h.
- Enable features in waves using feature flags.

### First 24h
- Monitor `/api/system/health`, `/api/system/workers`, `/api/system/jobs`, `/api/system/errors` every 15 minutes.
- Escalate to `degraded` if error rates or stale workers cross thresholds.

## Control Plane Usage by Launch Phase
Pre-launch:
- system mode controls
- worker controls
- queue controls
- simulation controls

Soft launch:
- feature flags
- queue depth controls
- AI usage limits
- incident panel

100-user simulation:
- user simulation and load controls
- queue caps and retry overrides
- worker quarantine actions

Chaos testing:
- incident events + emergency stop rehearsals
- fallback disablement checks

## Soft Launch Operator Workflow
1. Confirm mode is `production`.
2. Confirm queue intake and feature flags match launch plan.
3. Enable first user cohort flags.
4. Monitor worker freshness + queue depth.
5. Expand cohort only after stability window passes.

## 100-User Simulation Workflow
1. Set simulation safety caps.
2. Run scripted signup/login/upload/AI actions.
3. Watch queue depth and dead-letter trends.
4. Stop simulation immediately if thresholds breached.
5. Save simulation report and incident notes.

## Chaos Testing Workflow
Scenarios:
- worker crash
- OpenClaw session expiry
- queue flood
- transient DB errors

Procedure:
1. Start in `research` or controlled soft-launch mode.
2. Inject one scenario at a time.
3. Validate recovery controls and audit logs.
4. Restore baseline and confirm normal behavior.

## Emergency Stop and Rollback
Emergency stop trigger conditions:
- sustained worker stale count
- dead-letter surge
- cascading provider failures

Actions:
1. Set `system_mode=emergency_stop`.
2. Pause queue intake globally.
3. Disable AI jobs and research jobs.
4. Disable outbound messaging features.
5. Open incident and assign owner.

Recovery:
1. Move to `maintenance`.
2. Fix root cause.
3. Re-enable controls in order: queue -> workers -> AI fallback.
4. Return to `production` after stability check.

## First-24-Hour Monitoring Workflow
Cadence:
- 0-4h: every 15 min
- 4-12h: every 30 min
- 12-24h: hourly

Mandatory checks:
- health endpoint status
- queue depth by status
- stale worker count
- top errors by type
- AI usage/cost policy adherence

Stop conditions:
- any high-severity incident unresolved > 15 min
- queue backlog growth with no processing recovery
- repeated crash loops in worker fleet
