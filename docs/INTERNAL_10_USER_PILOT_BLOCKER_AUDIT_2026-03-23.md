# Internal 10-User Pilot Blocker Audit 2026-03-23

Purpose: verified repo-level blocker audit for the internal 10-user pilot.

Method used:
- reviewed the current pilot runbook and handoff docs
- verified pilot-critical admin routes and Netlify functions exist in the repo
- ran a production build with `npm run build`
- inspected the workflow path, settings limitations, funding gates, and document/task surfaces

## Bottom Line

Current status: pilot-ready with operational prechecks.

The repo is not blocked by build failures or missing pilot-critical admin surfaces. The remaining risk is operational: pilot data seeding, entitlement state, and one real workflow auth or tenant-context smoke test on day 0.

## Verified Ready

### Build Readiness

- `npm run build` completed successfully on 2026-03-23.
- No active editor diagnostics were returned for the workspace during this audit.

### Pilot-Critical Admin Surfaces Present

Verified page files exist:
- `src/pages/AdminControlPlanePage.tsx`
- `src/pages/AdminCeoBriefingPage.tsx`
- `src/pages/AdminSuperAdminCommandCenterPage.tsx`
- `src/pages/AdminCommandInboxPage.tsx`
- `src/pages/AdminSourceRegistryPage.tsx`

Verified Netlify functions exist:
- `netlify/functions/admin-production-readiness.ts`
- `netlify/functions/admin-super-admin-commands.ts`
- `netlify/functions/admin-command-inbox.ts`
- `netlify/functions/admin-source-registry.ts`

### Workflow Invocation Path Present

- `src/services/workflowEngineApi.ts` uses `supabase.functions.invoke('workflow-engine', ...)` and checks for an authenticated session before start, advance, and trigger actions.
- `src/pages/WorkflowDetailPage.tsx` uses that API layer for step advancement and pause or resume behavior.

## Verified Non-Blocking Limitations

These should be briefed to operators, but they do not block the pilot if the pilot scope is controlled.

### Settings AI Workforce Tab Is Still A Stub

Evidence:
- `components/Settings.tsx` renders: `Workforce management UI is not implemented yet. For now, use Neural Floor for agent operations.`

Impact:
- this does not block the pilot-critical admin path because the pilot docs rely on Control Plane, CEO Briefing, Command Center, Command Inbox, and Source Registry instead of the Settings AI Workforce tab

Operator rule:
- do not treat the Settings AI Workforce tab as part of pilot acceptance

### Settings Auto-Reply Tab Is Also Placeholder-Only

Evidence:
- `components/Settings.tsx` renders: `Auto-reply rules UI is not implemented yet. This tab is a placeholder so you don't hit a blank screen.`

Impact:
- not pilot-critical unless the cohort depends on editing auto-reply rules during the pilot window

## Verified Operational Risks Requiring Day-0 Validation

These are the real pre-pilot risks.

### 1. Document Upload Clarity Depends On Seeded Task Requirements

Evidence:
- `components/documents/ClientDocumentWorkspace.tsx` shows: `No active task attachments are calling for uploads right now. When workflow tasks declare required attachments, they will appear here.`

Interpretation:
- the document workspace is implemented, but it can look empty if the workflow or task seed state does not declare upload requirements for the pilot user

Required day-0 check:
- ensure at least one user in the cohort has a visible task-linked document requirement

### 2. Funding Research And Outcomes Are Still Entitlement-Gated

Evidence:
- `src/pages/FundingResearchPage.tsx` shows `PREMIUM Required` until entitlement and required disclosures are satisfied
- `src/pages/FundingOutcomesPage.tsx` shows `PREMIUM Required For Estimation` until entitlement and agreement conditions are satisfied
- `UPDATED_RUNBOOK.md` documents stale browser tier cache as a known cause of incorrect gate state

Interpretation:
- pilot accounts must be provisioned intentionally, and stale local tier cache should be cleared if UI state conflicts with the expected plan

Required day-0 check:
- verify entitlement, disclosure, and agreement state with one real pilot account before opening the pilot window

### 3. Workflow Auth And Tenant-Scope Must Be Proven With One Real Action

Evidence:
- the current workflow client path is present and authenticated
- `IMMEDIATE_FIXES.md` and `UPDATED_RUNBOOK.md` document historical 401 or 403 workflow issues caused by auth or RLS drift

Interpretation:
- there is no repo-level proof of a current blocker, but there is enough history that day 0 must include one real workflow step completion or advance action with a valid pilot account

Required day-0 check:
- complete one real workflow step and confirm no auth, permission, or wrong-tenant behavior occurs

### 4. Readiness Surfaces Need Real Rows To Be Meaningful

Evidence:
- `docs/PRODUCTION_WRAPUP_100_USER_AUDIT_2026-03-23.md` notes that readiness and simulation artifacts were added and then need manual population or intentional seed data
- `src/pages/AdminControlPlanePage.tsx` loads readiness summaries, recent simulations, briefings, and agent run summaries

Interpretation:
- the page can load successfully while still showing a low-signal or sparse state if readiness rows and related summaries have not been populated for the pilot tenant or environment

Required day-0 check:
- confirm the readiness endpoint and page return useful current-state data rather than empty placeholders

## Recommended Day-0 Preflight

Before pilot start approval:

1. Run the checklist in `docs/INTERNAL_10_USER_PILOT_DAY0_EXECUTION_CHECKLIST.md`.
2. Verify one early-stage, one existing-business, and one post-funding user can identify the next required action.
3. Verify one admin can operate the control-plane surfaces without terminal or SQL work.
4. Verify one real workflow action succeeds.
5. Verify the funding-tier state is correct for at least one provisioned pilot account.

## Go Or No-Go

### Go

Proceed with the pilot if all are true:
- build remains green
- admin surfaces and readiness endpoints load
- seeded task and document guidance exists for the cohort
- one real workflow action succeeds
- no stop condition is observed

### No-Go

Do not start the pilot if any are true:
- wrong-tenant or wrong-scope data appears anywhere
- users cannot determine the next required action because of empty or unseeded state
- funding entitlement state is wrong for the intended pilot account and cannot be corrected quickly
- a real workflow action fails with auth or permission issues
- admins need terminal or SQL work for ordinary pilot tasks
