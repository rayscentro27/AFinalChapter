# Internal 10-User Pilot Issue Tracker Template

Purpose: a lightweight issue log for the 5 to 7 day internal pilot.

Usage rules:
- Log issues in real time during the pilot.
- Create one row per distinct issue.
- Update severity and disposition as evidence improves.
- Link screenshots, recordings, or logs when available.
- Mark `stop_condition` immediately for anything that should halt the pilot.

## Severity Definitions

- `blocker`: pilot cannot continue safely for affected users or operators
- `major`: core flow works poorly or requires hand-holding
- `moderate`: usability, clarity, or reliability issue that does not fully block progress
- `minor`: cosmetic or low-risk friction that should still be tracked

## Disposition Definitions

- `fixed`: resolved and revalidated
- `accepted`: known issue, does not block the pilot
- `deferred`: fix postponed until after pilot
- `stop_condition`: severe enough to pause or halt the pilot

## Pilot Metadata

- Pilot window:
- Pilot owner:
- Support owner:
- Control-plane owner:
- Worker owner:
- Pilot tenant or cohort reference:

## Issue Log

| ID | Timestamp | Role | Cohort | Surface | Severity | Summary | Reproduction Steps | Expected Behavior | Actual Behavior | Owner | Disposition | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PILOT-001 |  | client | early_stage | Home |  |  |  |  |  |  |  |  |
| PILOT-002 |  | client | existing_business | documents |  |  |  |  |  |  |  |  |
| PILOT-003 |  | client | post_funding | funding roadmap |  |  |  |  |  |  |  |  |
| PILOT-004 |  | admin | internal_admin | Control Plane |  |  |  |  |  |  |  |  |
| PILOT-005 |  | admin | internal_admin | Command Inbox |  |  |  |  |  |  |  |  |

## Daily Triage Summary

### Day 1

- New blockers:
- New major issues:
- Fixed today:
- Accepted today:
- Deferred today:
- Stop conditions triggered: yes or no
- Notes:

### Day 2

- New blockers:
- New major issues:
- Fixed today:
- Accepted today:
- Deferred today:
- Stop conditions triggered: yes or no
- Notes:

### Day 3

- New blockers:
- New major issues:
- Fixed today:
- Accepted today:
- Deferred today:
- Stop conditions triggered: yes or no
- Notes:

### Day 4

- New blockers:
- New major issues:
- Fixed today:
- Accepted today:
- Deferred today:
- Stop conditions triggered: yes or no
- Notes:

### Day 5

- New blockers:
- New major issues:
- Fixed today:
- Accepted today:
- Deferred today:
- Stop conditions triggered: yes or no
- Notes:

### Day 6

- New blockers:
- New major issues:
- Fixed today:
- Accepted today:
- Deferred today:
- Stop conditions triggered: yes or no
- Notes:

### Day 7

- New blockers:
- New major issues:
- Fixed today:
- Accepted today:
- Deferred today:
- Stop conditions triggered: yes or no
- Notes:

## Exit Summary

- Pilot result: pass, conditional pass, or fail
- Total blockers:
- Total major issues:
- Total moderate issues:
- Total minor issues:
- Must-fix before 100-user test:
  1.
  2.
  3.
- Ready for short validation rerun: yes or no
- Ready for 100-user test: yes or no
