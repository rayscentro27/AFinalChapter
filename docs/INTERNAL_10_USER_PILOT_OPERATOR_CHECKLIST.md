# Internal 10-User Pilot Operator Checklist

Purpose: short execution checklist for the operator running the internal 10-user pilot day by day.

Use this with:
- `docs/INTERNAL_10_USER_PILOT_HANDOFF_2026-03-23.md`
- `docs/INTERNAL_10_USER_PILOT_READINESS_PASS.md`
- `docs/INTERNAL_10_USER_PILOT_SMOKE_PLAN.md`
- `docs/INTERNAL_10_USER_PILOT_ISSUE_TRACKER_TEMPLATE.md`

## Day 0: Pilot Start Approval

- [ ] Confirm there is no active or pending production deploy.
- [ ] Confirm the 10-user cohort is fixed and recorded.
- [ ] Confirm pilot owner assignments are filled in.
- [ ] Confirm the issue tracker metadata is filled in.
- [ ] Run the pre-pilot smoke pass.
- [ ] Confirm one early-stage user can complete sign-in and first-task discovery.
- [ ] Confirm one existing-business user can complete the core business or funding path.
- [ ] Confirm one post-funding user can find the correct next step.
- [ ] Confirm one admin can operate Control Plane, Command Center, Command Inbox, and Source Registry without terminal work.
- [ ] Declare pilot start only if no stop conditions are active.

## Days 1-7: Daily Operating Pass

Run once daily.

- [ ] Run the daily smoke cadence from the smoke plan.
- [ ] Sample at least one active pilot user for the day.
- [ ] Confirm the next step is clear for that user.
- [ ] Confirm documents, tasks, and funding-path surfaces have not regressed.
- [ ] Confirm Admin Control Plane still reflects current readiness.
- [ ] Confirm review queues or approvals are not silently piling up.
- [ ] Confirm worker summaries are still visible where expected.
- [ ] Log every issue in the tracker template.
- [ ] Mark any stop condition immediately.
- [ ] Write the daily triage summary for the current day.

## Immediate Escalation Checks

- [ ] Wrong-tenant or wrong-scope data exposure
- [ ] Auth or permission failures repeating across users
- [ ] User cannot determine the next required action
- [ ] Document flow breaks or silently fails
- [ ] Admin must use terminal or SQL for ordinary pilot work
- [ ] Worker automation becomes noisy, repeated, or unsafe
- [ ] Readiness or briefing surfaces hide blocked state

If any box above is checked, pause the pilot and record the issue as `stop_condition`.

## End Of Pilot Review

- [ ] Confirm all blockers are closed or explicitly rejected for continuation.
- [ ] Count blockers, major issues, and moderate issues.
- [ ] Confirm the client core journey was understandable across cohorts.
- [ ] Confirm admin operations were workable without terminal intervention.
- [ ] Confirm worker behavior remained stable and low-noise.
- [ ] Decide: pass, conditional pass, or fail.
- [ ] Decide whether a short post-fix validation pass is required.
- [ ] Decide whether the 100-user test is approved.

## Output Record

Record the final pilot result in the issue tracker exit summary:

- Pilot result:
- Must-fix items before 100-user test:
  1.
  2.
  3.
- Ready for short validation rerun: yes or no
- Ready for 100-user test: yes or no

Then fill:
- `docs/INTERNAL_10_USER_PILOT_RESULTS_TEMPLATE.md`
