# Nexus Final Pre-Simulation Validation Checklist

Purpose: final real-world validation gate before running the Nexus 100-user simulation.

Detailed 10-user pilot deliverables now live in `docs/INTERNAL_10_USER_PILOT_READINESS_PASS.md` and should be used as the primary pilot runbook before the 100-user simulation.

Scope:
- React CRM / Client Portal on Netlify
- Fastify backend on Oracle VM
- Supabase Postgres + Storage
- Mac Mini AI workers (OpenClaw, ChatGPT login workflows, Comet research, OpenRouter fallback)

Rules:
- No architecture redesign.
- No live trading or broker execution.
- Freeze non-essential changes during pilot window.

## A) Launch Freeze (Required Before Pilot)
- [ ] No non-essential deploys.
- [ ] No env-var changes.
- [ ] No schema changes/migrations.
- [ ] No worker runtime/config changes unless incident mitigation is approved.

## B) Manual Real-World Check 1: Browser Flow (app.goclearonline.cc)
Flow: login -> perform one CRM write -> refresh -> verify persistence.

Pass criteria:
- [ ] Login succeeds with valid production user credentials.
- [ ] Protected page/API access succeeds (no auth loop).
- [ ] CRM write succeeds in UI and API response.
- [ ] Record persists after hard refresh.
- [ ] Supabase row verified with:
  - [ ] correct `tenant_id`
  - [ ] expected `updated_at` change
  - [ ] correct actor attribution (`updated_by` / audit actor) if enabled
- [ ] No critical browser console errors (auth, CORS, 5xx, runtime crash).

Fail criteria:
- [ ] Login failure/intermittent auth regression.
- [ ] UI shows write but Supabase row missing or wrong tenant.
- [ ] Duplicate row created by single action.
- [ ] Wrong actor attribution or missing audit record where required.

## C) Manual Real-World Check 2: WhatsApp + Messenger Flow
Flow: send one WhatsApp test message and one Messenger test message -> webhook ingest -> routed record confirmation.

Inbound pass criteria:
- [ ] Webhook verify/signature behavior correct (valid accepted, invalid rejected).
- [ ] Provider event stored once with stable external event ID.
- [ ] Contact match/create is correct (no wrong merge).
- [ ] Message appears in correct conversation/thread and tenant.
- [ ] Route/action record created as expected.

Outbound/reply pass criteria (bidirectional path):
- [ ] One staff reply/outbound message created from Nexus.
- [ ] Provider accepts outbound request.
- [ ] Outbound status transitions recorded (queued/sent/delivered/read as available).
- [ ] Conversation remains attached to correct contact + tenant.

Duplicate/idempotency checks:
- [ ] Replayed inbound payload does not create duplicate canonical message.
- [ ] Duplicate prevention behavior is logged/observable.

Fail criteria:
- [ ] Any wrong-tenant routing, wrong-contact attachment, or duplicate canonical message.
- [ ] Outbound accepted by provider but missing local status updates.
- [ ] Webhook failures or signature mismatches in normal path.

## D) File Storage Protection Mini-Test (If Uploads Are In Scope)
- [ ] Upload one protected file (same tenant as browser test).
- [ ] Verify object path/bucket naming is tenant-correct.
- [ ] Verify authorized retrieval succeeds.
- [ ] Verify cross-tenant/public retrieval is denied.
- [ ] Verify no accidental public leakage link.

## E) Contact Matching / Thread Routing / Tenant Isolation Checks
- [ ] Contact resolution uses expected keys (phone/meta IDs).
- [ ] Same sender maps to existing contact/thread correctly.
- [ ] New sender creates one contact/thread only.
- [ ] Cross-tenant access test fails as expected (no leakage).
- [ ] Thread updates and message statuses remain tenant-scoped.

## F) Mac Mini Worker Runtime Checks
- [ ] OpenClaw runtime healthy.
- [ ] ChatGPT session valid (not stuck at login/consent).
- [ ] Comet research worker path runnable in current mode.
- [ ] Worker heartbeat fresh in monitoring endpoints.
- [ ] One worker-triggered job completes end-to-end.
- [ ] No stuck leased jobs beyond threshold.
- [ ] Browser/session recovery count is stable (no restart loop).

## G) 10-User Pilot Checklist (30-60 min)
- [ ] Start pilot with freeze controls active.
- [ ] Confirm API health baseline before pilot start.
- [ ] Run 10 representative user sessions across:
  - [ ] auth
  - [ ] CRM write/update
  - [ ] messaging inbound
  - [ ] one outbound reply
  - [ ] one file upload + protected retrieval
- [ ] Confirm at least one Mac Mini worker job completes during pilot.
- [ ] Capture metrics every 5-10 minutes (section H).
- [ ] Record all incidents and mitigations with timestamps.

## H) Metrics to Log Every 5-10 Minutes
System/API:
- [ ] `/api/system/health` snapshot
- [ ] `/api/system/workers` snapshot
- [ ] `/api/system/jobs` snapshot
- [ ] `/api/system/errors` snapshot
- [ ] auth failure rate (401/403 trend)
- [ ] API p95/p99 latency for key routes

Queue/worker:
- [ ] queue depth by status
- [ ] dead-letter count + delta
- [ ] oldest pending job age
- [ ] queue lease age max
- [ ] worker heartbeat freshness (fresh/stale counts)
- [ ] last successful worker job completion time
- [ ] browser restart/recovery count
- [ ] OpenClaw session state
- [ ] ChatGPT session validity indicator

Messaging/storage:
- [ ] webhook accepted/failed deltas
- [ ] outbound messaging accepted/failed count
- [ ] duplicate/ignored webhook event count
- [ ] storage upload success/failure
- [ ] signed/protected retrieval success/failure

## I) Pilot Stop Conditions (Immediate Halt)
- [ ] Any cross-tenant data leakage.
- [ ] Sustained auth regression.
- [ ] Queue/dead-letter growth spike beyond baseline threshold.
- [ ] Worker/session failures without bounded recovery.
- [ ] Duplicate message/contact creation trend.
- [ ] File access leakage or unauthorized retrieval success.

## J) Go/No-Go Criteria for 100-User Simulation
Ready only if all are true:
- [ ] Browser flow pass with direct Supabase row verification.
- [ ] WhatsApp + Messenger inbound pass.
- [ ] Outbound/reply path pass (if enabled).
- [ ] File storage protection test pass (if uploads in scope).
- [ ] Tenant isolation checks pass.
- [ ] 10-user pilot completes 30-60 min with no stop conditions triggered.
- [ ] No unresolved Sev1/Sev2 incidents.
- [ ] No queue/dead-letter/stale-lease trend indicating instability.

Not ready if any are true:
- [ ] Any unresolved auth/security/tenant isolation issue.
- [ ] Any unresolved worker session stability blocker.
- [ ] Any unresolved duplicate/idempotency defect.
- [ ] Any unresolved storage access control defect.

## K) Final Recommendation Output Template
Use one of the exact statuses below.

### NOT READY
- Status: `NOT READY`
- Blocking issues:
  1. ...
  2. ...
- Evidence:
  - endpoint snapshots/log IDs
  - failed scenario IDs + timestamps
- Required fixes before retest:
  1. ...
  2. ...
- Owner + ETA: ...

### READY FOR 10-USER PILOT
- Status: `READY FOR 10-USER PILOT`
- Preconditions met:
  1. Browser flow pass
  2. Messaging flow pass
  3. Tenant isolation pass
  4. Worker end-to-end pass
- Pilot window: ...
- Monitoring owner: ...
- Stop conditions acknowledged: yes/no

### READY FOR 100-USER SIMULATION
- Status: `READY FOR 100-USER SIMULATION`
- Pilot summary:
  - duration
  - users covered
  - incidents + resolution
  - key metric trend notes
- Residual risks (non-blocking):
  1. ...
  2. ...
- Sign-off:
  - Ops
  - Backend
  - Mac Mini worker owner
