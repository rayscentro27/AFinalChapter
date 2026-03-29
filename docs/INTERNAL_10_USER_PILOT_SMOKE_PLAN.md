# Internal 10-User Pilot Smoke Plan

Purpose: focused smoke plan to validate the pilot-critical client, admin, and worker-facing surfaces before and during the internal 10-user pilot.

Rules:
- Keep this as a validation and observation plan, not a deployment plan.
- Use real staff accounts and pilot users where possible.
- Prefer additive evidence capture: screenshots, timestamps, response payload summaries, and issue tracker entries.

## Smoke Objectives

- verify the core client journey is understandable
- verify admin surfaces reflect real system state
- verify worker-side behavior is stable and not noisy
- verify pilot blockers are caught before the 100-user test

## Pilot-Critical Routes and Surfaces

### Client-Side

- Home
- Action Center
- documents and uploads
- funding roadmap
- task and next-step flows
- internal messages or inbox-like guidance

### Admin-Side

- Admin Control Plane
- CEO briefing
- Super Admin Command Center
- Command Inbox
- Source Registry
- readiness endpoint: `/.netlify/functions/admin-production-readiness`
- commands endpoint: `/.netlify/functions/admin-super-admin-commands`
- command inbox endpoint: `/.netlify/functions/admin-command-inbox`
- source registry endpoint: `/.netlify/functions/admin-source-registry`

### Worker-Side

- recent worker summaries
- readiness summaries fed by agent runs
- command or source-review follow-up behavior
- repeated or noisy automation symptoms

## Pre-Pilot Smoke Pass

Run once before pilot start.

### Client Journey

- [ ] Sign in as one early-stage user.
- [ ] Confirm Home makes the first next step obvious.
- [ ] Confirm Action Center or task flow links to the correct follow-up surface.
- [ ] Upload one document and confirm success feedback is understandable.
- [ ] Confirm user can return and still find tasks and uploaded items.

- [ ] Sign in as one existing-business user.
- [ ] Confirm business profile or readiness path is visible.
- [ ] Confirm Funding Roadmap is understandable and sequenced correctly.
- [ ] Confirm optional paths do not crowd out the core flow.

- [ ] Sign in as one post-funding or capital-path user.
- [ ] Confirm post-funding or capital-path tasks are visible.
- [ ] Confirm Home and Funding Roadmap do not regress into early-stage messaging.

### Admin Journey

- [ ] Open Admin Control Plane.
- [ ] Confirm readiness summary, incident count, and control-plane state load correctly.
- [ ] Open CEO briefing page and confirm the summary reflects real current state.
- [ ] Open Super Admin Command Center and submit or inspect one low-risk command.
- [ ] Open Command Inbox and confirm selected detail, status timeline, and related artifacts load.
- [ ] Open Source Registry and confirm warnings, actions, and persistent source rows load.

### Endpoint Smoke

- [ ] Confirm `admin-production-readiness` returns populated summary data for staff users.
- [ ] Confirm `admin-super-admin-commands` returns persisted command history.
- [ ] Confirm `admin-command-inbox` returns selected detail and related artifacts.
- [ ] Confirm `admin-source-registry` returns Supabase-backed source rows and warnings.

### Worker and Automation Smoke

- [ ] Confirm at least one agent summary is visible where expected.
- [ ] Confirm command-related or source-related summaries are written when relevant.
- [ ] Confirm no repeated internal messages or noisy duplicate automation appears during the smoke window.

## Daily Pilot Smoke Cadence

Run a light pass each day during the pilot.

### Daily Client Checks

- [ ] Sample one pilot user from the active cohort that day.
- [ ] Confirm login succeeds.
- [ ] Confirm the next step is still clear.
- [ ] Confirm documents or tasks have not regressed.

### Daily Admin Checks

- [ ] Confirm Admin Control Plane still reflects current readiness.
- [ ] Confirm no admin surface requires terminal-only intervention.
- [ ] Confirm review queues or approvals are not silently piling up.

### Daily Worker Checks

- [ ] Confirm summaries are still being written where expected.
- [ ] Confirm there is no repeated automation noise.
- [ ] Confirm blocked or warning states are visible in operator surfaces.

## Stop Conditions

Escalate immediately and log in the pilot issue tracker if any of these occur:

- wrong-tenant or wrong-scope data exposure
- repeated auth or permission failures
- client cannot determine the next required action
- document flow silently fails or becomes ambiguous
- admin must use terminal or SQL for ordinary pilot work
- worker system produces repeated or unsafe automations
- readiness or briefing surfaces hide real blocked state

## Evidence Capture

Capture for each smoke pass:

- timestamp
- tester role and cohort
- surface or endpoint checked
- pass or fail result
- summary of what was observed
- issue tracker reference if failed

## Exit Criteria

Call the pilot smoke plan successful only if:

- the core client journey remains understandable across all three user cohorts
- admin surfaces remain usable without terminal work
- worker-side behavior remains stable and low-noise
- no stop conditions are triggered
- all failures are captured in `docs/INTERNAL_10_USER_PILOT_ISSUE_TRACKER_TEMPLATE.md`
