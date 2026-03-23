# Internal 10-User Pilot Handoff

Date: 2026-03-23

Purpose: concise operator handoff for starting the internal 10-user pilot from the current production baseline without introducing new deploy risk.

## Current Production Baseline

- Production site: `https://goclearonline.cc`
- Most recent production app deploy confirmed from commit: `b10ba01`
- Pilot-readiness docs added after deploy:
  - `becea66` pilot readiness runbook
  - `e00cbd5` pilot smoke plan and issue tracker
- Current branch: `feat/production-wrapup-100-users`

Implication:
- the production runtime is already live
- the newest changes since the last deploy are documentation-only pilot operations artifacts
- no additional deploy is required to start the internal pilot

## Pilot Rule Set

- Do not deploy automatically during the pilot window.
- Freeze non-essential schema, env, worker-config, and UI churn once pilot start is approved.
- Treat the pilot as the required gate before any 100-user test.
- Capture issues in the tracker template instead of relying on ad hoc notes.

## Required Pilot Docs

Use these together:

1. `docs/INTERNAL_10_USER_PILOT_READINESS_PASS.md`
2. `docs/INTERNAL_10_USER_PILOT_SMOKE_PLAN.md`
3. `docs/INTERNAL_10_USER_PILOT_ISSUE_TRACKER_TEMPLATE.md`

Recommended usage:

1. Use the readiness pass to confirm go or no-go before pilot day 1.
2. Use the smoke plan before pilot start and once per day during the pilot.
3. Use the issue tracker as the system of record for all pilot defects and stop conditions.

## Pilot Owner Assignments

Fill these before pilot start:

- Pilot owner:
- Support owner:
- Admin operations owner:
- Control-plane owner:
- Worker owner:
- Decision owner for pilot stop or continue:

## Day 0 Start Sequence

1. Confirm there is no pending production deploy.
2. Confirm the pilot cohort list is fixed at 10 users across the intended segments.
3. Confirm the issue tracker template has pilot metadata filled in.
4. Run the pre-pilot smoke pass from `docs/INTERNAL_10_USER_PILOT_SMOKE_PLAN.md`.
5. Confirm admins can use Control Plane, Command Inbox, Command Center, and Source Registry without terminal work.
6. Confirm one user from each client cohort can complete the first core task.
7. Declare pilot start only if no stop conditions are active.

## Daily Operating Cadence

1. Run the daily smoke cadence.
2. Log every issue in the tracker template.
3. Review blockers and majors once per day.
4. Decide whether any issue qualifies as a stop condition.
5. Keep fixes tightly scoped and avoid unrelated changes.

## Stop Conditions

Pause the pilot immediately if any of the following occurs:

- wrong-tenant or wrong-scope data exposure
- repeated auth or permission failures
- client users cannot identify the next required action
- documents silently fail or become ambiguous
- admins need terminal or SQL work for ordinary pilot tasks
- worker automations become repeated, unsafe, or noisy
- readiness or briefing surfaces hide blocked state

## Exit Decision Standard

Do not approve the 100-user test until all of the following are true:

- pilot blockers are closed
- major auth or scope failures are absent
- client core journey is understandable across cohorts
- admin operations are workable without terminal intervention
- worker behavior is stable and low-noise
- a short post-fix validation pass has been completed when fixes were required

## Notes For The Next Operator

- If you need to make pilot-related fixes, keep them additive and reviewable.
- Prefer small docs-backed commits over broad runtime churn.
- If a runtime fix is needed, validate it first, then commit and push separately from pilot notes.
- Do not trigger a new deploy unless the pilot finds a real defect that requires it.
