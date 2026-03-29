# Internal 10-User Pilot Day-0 Execution Checklist

Purpose: one operator-facing checklist that compresses the pilot handoff, readiness pass, smoke plan, and operator checklist into a single day-0 run sheet.

Use this with:
- `docs/INTERNAL_10_USER_PILOT_HANDOFF_2026-03-23.md`
- `docs/INTERNAL_10_USER_PILOT_READINESS_PASS.md`
- `docs/INTERNAL_10_USER_PILOT_SMOKE_PLAN.md`
- `docs/INTERNAL_10_USER_PILOT_ISSUE_TRACKER_TEMPLATE.md`
- `docs/INTERNAL_10_USER_PILOT_OPERATOR_CHECKLIST.md`

Rules:
- No non-essential deploys during the pilot window.
- No non-essential schema, env, or worker-config changes after pilot start approval.
- Log every failure in the issue tracker template.
- Pause immediately on any stop condition.

## Pilot Metadata

- Pilot window:
- Pilot owner:
- Support owner:
- Admin operations owner:
- Control-plane owner:
- Worker owner:
- Decision owner:
- Pilot tenant or cohort reference:

## Cohort Lock

- [ ] 3 early-stage users recorded
- [ ] 3 existing-business users recorded
- [ ] 2 post-funding or capital-path users recorded
- [ ] 2 internal or admin operators recorded
- [ ] Cohort list frozen before smoke start

## Environment Freeze Check

- [ ] No active or pending production deploy
- [ ] No pending schema migration for pilot start
- [ ] No pending env-var change required for pilot start
- [ ] No worker runtime/config change required for pilot start

## Day-0 Readiness Sequence

### 1. Confirm Admin Surfaces Are Reachable

- [ ] Open Admin Control Plane
- [ ] Open CEO Briefing
- [ ] Open Super Admin Command Center
- [ ] Open Command Inbox
- [ ] Open Source Registry
- [ ] Confirm all pages load without terminal or SQL work

### 2. Confirm Readiness Endpoints Respond

- [ ] `/.netlify/functions/admin-production-readiness`
- [ ] `/.netlify/functions/admin-super-admin-commands`
- [ ] `/.netlify/functions/admin-command-inbox`
- [ ] `/.netlify/functions/admin-source-registry`

Record for each endpoint:
- Status:
- Staff account used:
- Summary of payload quality:

### 3. Confirm Client Journey Across Three Cohorts

#### Early-Stage User

- [ ] Sign in succeeds
- [ ] Home makes the first action obvious
- [ ] Action Center opens the correct follow-up surface
- [ ] Documents area is understandable
- [ ] No auth loop or blank protected page

#### Existing-Business User

- [ ] Sign in succeeds
- [ ] Business profile or readiness path is visible
- [ ] Funding Roadmap sequencing makes sense
- [ ] Optional paths do not displace the core path

#### Post-Funding User

- [ ] Sign in succeeds
- [ ] Post-funding or capital-path tasks are visible
- [ ] Home does not fall back to early-stage guidance
- [ ] The next required action is obvious

### 4. Confirm Document and Task Surfaces Are Seeded

- [ ] At least one pilot user has a visible top task in Action Center
- [ ] At least one pilot user has a visible document requirement or upload instruction
- [ ] No pilot user hits an avoidable empty state caused only by missing seed data

### 5. Confirm Funding and Tier-Gated Paths

- [ ] Funding Research shows the expected entitlement state for the pilot account
- [ ] Funding Outcomes shows the expected entitlement state for the pilot account
- [ ] Required disclosures and agreement state are visible and understandable
- [ ] Browser tier cache is cleared if entitlement state appears stale

### 6. Confirm Workflow Path With One Real Action

- [ ] Open one real workflow instance
- [ ] Complete one real task or step
- [ ] Confirm workflow state refreshes correctly
- [ ] Confirm no auth, permission, or tenant-scope error appears

### 7. Confirm Worker Visibility

- [ ] At least one recent worker or agent summary is visible where expected
- [ ] Readiness or briefing surfaces do not hide warning or blocked state
- [ ] No repeated or noisy automation appears during the smoke window

## Evidence Capture

For each failed or uncertain item above, capture:
- timestamp
- tester role and cohort
- route or endpoint
- expected behavior
- actual behavior
- issue tracker ID

## Stop Conditions

Pause the pilot immediately if any of these occur:

- [ ] wrong-tenant or wrong-scope data exposure
- [ ] repeated auth or permission failures
- [ ] user cannot determine the next required action
- [ ] document flow silently fails or becomes ambiguous
- [ ] admin requires terminal or SQL work for ordinary pilot tasks
- [ ] worker automation becomes repeated, unsafe, or noisy
- [ ] readiness or briefing surfaces hide blocked state

## Day-0 Decision

- [ ] No stop condition is active
- [ ] Pre-pilot smoke pass completed
- [ ] Pilot owner approves start
- [ ] Decision owner approves start

Result:
- Pilot start approved: yes or no
- If no, top blockers:
  1.
  2.
  3.
