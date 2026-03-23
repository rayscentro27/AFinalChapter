# Internal 10-User Pilot Readiness Pass

Purpose: additive pilot-readiness pass for a small internal cohort before the 100-user test.

Scope:
- core client journey validation
- admin and control-plane validation
- internal communication clarity
- command center and source registry usability
- issue capture during a 5 to 7 day pilot window

Rules:
- Do not deploy automatically during the pilot window.
- Keep non-essential changes frozen once pilot start is approved.
- Treat the 10-user pilot as the required gate before the 100-user test.
- Use seeded sample data only for operator smoke coverage, not for pilot success reporting.

## Pilot Group

Use 10 users split across the core product paths:
- 3 early-stage users
- 3 users with existing businesses
- 2 post-funding or capital-path users
- 2 internal or admin operators

Pilot duration:
- 5 to 7 days

## Deliverable 1: 10-User Pilot Checklist

- [ ] Freeze non-essential deploys, schema changes, env changes, and worker config changes.
- [ ] Confirm production build passes before pilot start.
- [ ] Confirm linked Supabase project is in migration parity.
- [ ] Confirm Admin Control Plane loads readiness, incidents, and recent operational summaries.
- [ ] Confirm the pilot tenant or user cohort list is explicitly recorded.
- [ ] Confirm support owners are assigned for auth, documents, funding flow, admin review, and worker incidents.
- [ ] Confirm issue capture document or tracker is prepared before day 1.
- [ ] Confirm one early-stage user can complete sign-in and first task discovery.
- [ ] Confirm one existing-business user can move through business profile and funding-readiness flow.
- [ ] Confirm one post-funding user can find capital-path or post-funding tasks without confusion.
- [ ] Confirm one admin operator can use Control Plane, Command Inbox, Command Center, and Source Registry without terminal intervention.
- [ ] Confirm staff can identify blocked readiness checks from the readiness endpoint or page.
- [ ] Confirm worker jobs process normally during at least one monitored activity window.
- [ ] Confirm pilot issues are triaged daily and stop conditions are reviewed.

## Deliverable 2: Admin Checklist

### Control Plane

- [ ] Admin Control Plane shows current system mode and feature state correctly.
- [ ] Launch readiness widget shows real checks, warnings, and blocked items.
- [ ] Active incident count is understandable without inspecting raw tables.
- [ ] Audit history is readable enough to understand major admin actions.

### Command Center and Inbox

- [ ] Super Admin Command Center accepts plain-language commands without UI breakage.
- [ ] Command Inbox shows approval state, queue state, execution state, and related artifacts.
- [ ] Admin team can tell which commands are pending review versus completed.
- [ ] No command requires terminal-only troubleshooting for normal operations.

### Source Registry

- [ ] Source Registry loads persistent source rows from Supabase-first state.
- [ ] Warning states are understandable and actionable.
- [ ] Pause, resume, schedule pause, run-now, and priority actions behave predictably.
- [ ] Admins can tell when a source needs review or is blocked by quality issues.

### CEO and Summary Surfaces

- [ ] CEO briefing surfaces summarize real current issues rather than stale placeholder content.
- [ ] Executive rollups expose pending approvals, failed commands, paused sources, and review queues clearly.
- [ ] Agent run summaries are present when worker-side summaries exist.

### Stop-and-Escalate Admin Conditions

- [ ] Any wrong-tenant data view.
- [ ] Any admin surface requiring direct SQL or terminal work for ordinary pilot actions.
- [ ] Any approval state mismatch between UI and stored command state.
- [ ] Any readiness summary that hides blocked or warning-state items.

## Deliverable 3: Client Checklist

### Login and Orientation

- [ ] User can sign in without auth loops or permission confusion.
- [ ] Home screen makes the first action obvious.
- [ ] User can find the next-step or task system quickly.

### Documents and Tasks

- [ ] User can upload required documents without uncertainty about what belongs where.
- [ ] Document upload confirmations are visible and understandable.
- [ ] User can return later and still find pending tasks and uploaded materials.
- [ ] Missing task links or dead-end navigation do not block the core journey.

### Core Journey Clarity

- [ ] Home, Action Center, and Funding Roadmap feel coherent.
- [ ] Business setup and funding-readiness steps appear in the right order.
- [ ] Optional grant and trading paths remain secondary and do not distract from core tasks.
- [ ] Internal messages or inbox-style guidance help move the user forward rather than adding noise.

### Client Stop-and-Escalate Conditions

- [ ] User cannot tell what to do next.
- [ ] Document flow is broken, ambiguous, or silently fails.
- [ ] Tasks link to the wrong surface or a blank state.
- [ ] Auth, permissions, or tenant scope appears wrong.

## Deliverable 4: Top-Risk List Before Pilot Launch

1. Auth and permission drift
   - Risk: pilot users hit loops, blank protected pages, or wrong-role visibility.
   - Why it matters: pilot feedback becomes unusable if users cannot enter the core journey cleanly.

2. Task and navigation ambiguity
   - Risk: users cannot find the correct next step across Home, Action Center, documents, and funding flow.
   - Why it matters: this creates false demand on support and hides whether the workflow itself is sound.

3. Document-flow confusion
   - Risk: uploads appear to work but users do not know what was accepted, what is missing, or where files belong.
   - Why it matters: document friction will dominate pilot feedback if not contained.

4. Admin operational trust gap
   - Risk: Control Plane, Command Inbox, Command Center, Source Registry, and CEO briefing surfaces look complete but do not expose the real system state clearly enough.
   - Why it matters: internal operators will fall back to terminal or SQL work, which invalidates the pilot as an operational rehearsal.

5. Noisy or repeated automations
   - Risk: repeated internal messages, duplicated summaries, or overactive worker automations create confusion.
   - Why it matters: pilot users and staff will interpret system noise as instability.

6. Source and command review bottlenecks
   - Risk: warnings, approvals, or review queues pile up faster than admins can resolve them.
   - Why it matters: this blocks trust in the new admin persistence surfaces.

7. Readiness visibility mismatch
   - Risk: readiness checks, simulations, and summaries exist but do not align with actual pilot conditions.
   - Why it matters: go or no-go decisions become subjective instead of evidence-backed.

## Deliverable 5: Must-Fix Blockers Before Pilot Starts

The pilot should not start until these are true:

- [ ] No major auth or permission regression exists for pilot users.
- [ ] Core client path surfaces load reliably: Home, documents, task flow, funding flow.
- [ ] Admin Control Plane shows usable readiness and incident visibility.
- [ ] Command Center, Command Inbox, and Source Registry can be operated by admins without terminal work.
- [ ] Worker jobs and summary-writing paths show stable behavior during monitored validation.
- [ ] No unsafe automation behavior is visible in commands, summaries, internal messages, or source actions.
- [ ] Wrong-tenant or wrong-scope data exposure is not observed.

## Pilot Issue Capture

Track every pilot issue with these fields:
- timestamp
- role: client, admin, worker, or system
- cohort: early_stage, existing_business, post_funding, internal_admin
- surface: Home, Action Center, documents, funding roadmap, Control Plane, Command Center, Command Inbox, Source Registry, CEO briefing, worker system
- severity: blocker, major, moderate, minor
- reproduction steps
- expected behavior
- actual behavior
- owner
- disposition: fixed, accepted, deferred, or stop_condition

## Pilot Success Criteria

Call the pilot successful only if:
- users can complete the core journey without repeated hand-holding
- no major auth or data-scope bugs appear
- the admin team can operate the system without terminal work
- worker processing remains stable
- no unsafe automation behavior appears

Supporting pilot artifacts:
- `docs/INTERNAL_10_USER_PILOT_SMOKE_PLAN.md`
- `docs/INTERNAL_10_USER_PILOT_ISSUE_TRACKER_TEMPLATE.md`
- `docs/INTERNAL_10_USER_PILOT_HANDOFF_2026-03-23.md`

## Recommended Sequence After Pilot

1. Fix critical issues.
2. Run a short validation pass on the repaired surfaces.
3. Update readiness checks with real pilot findings.
4. Move to the 100-user test only after pilot blockers are closed.