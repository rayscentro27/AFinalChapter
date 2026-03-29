# Mac Mini Remaining Infrastructure Implementation Plan 2026-03-23

Purpose: convert the remaining Mac Mini work into a concrete implementation sequence based on what already exists in this repo.

## Baseline

Architecture remains:
- Oracle VM hosts the Nexus API and gateway role
- Supabase remains the shared state and queue system
- Netlify remains the web and admin UI surface
- Mac Mini hosts worker and operator runtimes only

Hard rules:
- no live trading
- no broker execution
- signals remain proposal-only
- do not move the Oracle API role onto the Mac Mini

## Current Repo State

### Already Present

- `mac-mini-worker/` exists as a working queue worker package
- `mac-mini-worker/src/mac-mini-worker.js` is the current worker entrypoint
- `mac-mini-worker/src/workers/index.js` registers one real handler: `sentiment_triage`
- `mac-mini-worker/README.md` documents polling, heartbeats, retries, and queue flow
- `MAC_MINI_TRANSFER_GUIDE.md` and `MAC_MINI_QUICK_REFERENCE.md` document the current transfer and operator path
- `NEXT_STEPS_MAC_MINI.md` defines the higher-level OpenClaw setup path

### Not Yet Complete

- OpenClaw service supervision on the Mac Mini
- secure secret provisioning and operator profile management
- heartbeat visibility tied cleanly into admin operating surfaces
- end-to-end transcript to research to strategy to proposal validation
- handler implementation for `neural_scout_batch`, `scenario_runner`, `grants_matcher`, and `content_factory`
- restart and recovery runbook for the Mac Mini host

### Important Constraint From Current Code

`mac-mini-worker/src/workers/index.js` currently throws `not yet implemented` for four of the five declared job types. This means the queue framework exists, but the broader worker roadmap is still mostly scaffolding.

## Design Decision

Treat the Mac Mini as two separate concerns:

1. Queue worker runtime
   - owned by `mac-mini-worker/`
   - responsible for asynchronous job execution and heartbeats

2. OpenClaw operator runtime
   - installed separately on the Mac Mini host
   - responsible for research and operator-assisted tasks that should not live inside the Oracle API

Do not conflate those two runtimes into one process.

## Workstream 1: Runtime Standardization

### Goal

Standardize the host runtime so the Mac Mini can run both the worker package and OpenClaw consistently.

### Decisions

- standardize on Node 24 for the Mac Mini host
- keep `mac-mini-worker` compatible with Node 24 even though its current package only requires `>=20`
- keep OpenClaw installed globally or in a dedicated operator workspace outside `mac-mini-worker/`

### Deliverables

- host-level Node 24 install verified
- `mac-mini-worker` installs and starts on Node 24
- OpenClaw CLI install verified
- canonical Mac Mini workspace layout documented, for example:
  - `~/nexus-ops/openclaw`
  - `~/nexus-ops/mac-mini-worker`
  - `~/nexus-ops/runbooks`
  - `~/nexus-ops/logs`

## Workstream 2: Secret And Profile Management

### Goal

Stop relying on bundled production credentials and move to explicit local provisioning.

### Current Risk

`MAC_MINI_TRANSFER_GUIDE.md` describes shipping a bundle that contains a production `.env`. That is an operator convenience pattern, not a durable security model.

### Required Changes

- do not treat a credentialed tarball as the long-term deployment method
- provision `.env` on the Mac Mini directly from a secure source
- separate worker secrets from OpenClaw/operator secrets

### Minimum Worker Secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WORKER_ID`
- `WORKER_POOL_SIZE`
- `LOG_LEVEL`

### Minimum Operator Secrets

- `NEXUS_API_BASE_URL`
- OpenAI or Codex auth profile data
- Telegram bot token and chat routing values if notifications are used
- any OpenRouter or other provider keys actually required by the operator flow

### Deliverables

- `.env.example` files split by runtime if needed
- secure provisioning steps documented without embedding live secrets in archives
- local validation command for each runtime

## Workstream 3: Process Supervision And Logging

### Goal

Make the Mac Mini self-recovering without relying on a manually open terminal window.

### Required Changes

- add a macOS `launchd` service for `mac-mini-worker`
- add a separate `launchd` service if OpenClaw must run continuously
- define stdout and stderr log paths under a stable logs directory
- define restart policy and backoff behavior

### Deliverables

- `deploy/mac-mini/` folder with example `launchd` plist files
- service install and unload commands documented
- log rotation or retention guidance documented
- recovery runbook documented in `docs/MAC_MINI_RECOVERY_RUNBOOK_2026-03-23.md`

## Workstream 4: Heartbeat And Health Reporting

### Goal

Make worker liveness and failure state visible in operator surfaces without SQL-only inspection.

### Current State

The worker README describes heartbeat writes and queue metrics, but the operating model still leans on direct table inspection.

### Required Changes

- confirm `worker_heartbeats` freshness can be surfaced in existing admin health or control-plane views
- define stale threshold, for example `> 90 seconds without heartbeat`
- define restart escalation path when heartbeat becomes stale

### Deliverables

- one agreed heartbeat freshness threshold
- one agreed stale-worker alert path
- one admin-facing summary location for Mac Mini worker health

## Workstream 5: Handler Completion Roadmap

### Goal

Move the worker package from framework to useful coverage.

### Priority Order

1. `neural_scout_batch`
   - research contacts or opportunities
   - store results in the appropriate Supabase tables

2. `scenario_runner`
   - run queued scenario work asynchronously instead of blocking a UI path

3. `content_factory`
   - generate content artifacts asynchronously and persist results

4. `grants_matcher`
   - match and store grant recommendations without interactive blocking

### Deliverable For Each Handler

- real implementation file under `mac-mini-worker/src/workers/`
- handler registered in `index.js`
- one queue integration test
- one operational smoke test
- one rollback or disable instruction

## Workstream 6: End-to-End Validation

### Goal

Prove the Mac Mini path does useful work across the intended pipeline, not just queue polling.

### Validation Sequence

1. Transcript ingestion test
   - start one transcript-oriented job from the Mac Mini side
   - verify the expected queue record is claimed and completed

2. Research artifact write test
   - verify resulting rows appear in the intended research tables

3. Strategy generation test
   - verify strategy and proposal-oriented rows appear in the intended tables

4. Operator notification test
   - verify Telegram or the selected notification path emits one controlled message

5. Heartbeat and recovery test
   - stop the worker intentionally
   - verify stale detection and restart procedure behave as designed

### Acceptance Criteria

- one real non-placeholder handler completes end-to-end from queue to stored result
- heartbeats remain fresh during normal runtime
- worker restart procedure is documented and works in practice
- no Oracle API role shift is required
- no live execution path is introduced

## Workstream 7: Recovery Runbook

### Goal

Give the next operator a bounded restart and incident path.

### Runbook Must Cover

- how to check service status
- how to inspect the last logs
- how to restart worker service
- how to restart OpenClaw service if applicable
- how to identify stuck claimed jobs
- when to requeue versus when to leave failed jobs alone
- how to confirm heartbeat recovery

## Recommended Execution Order

### Phase 0

- standardize Node 24 on the Mac Mini host
- provision secrets locally instead of shipping a credentialed archive

### Phase 1

- install and verify `mac-mini-worker`
- install and verify OpenClaw
- create `launchd` service definitions

### Phase 2

- surface heartbeat freshness into an operator-facing admin summary
- validate stale-worker restart behavior

### Phase 3

- implement `neural_scout_batch`
- implement `scenario_runner`
- add queue integration tests for both

### Phase 4

- implement `content_factory` and `grants_matcher`
- complete end-to-end transcript to artifact to strategy validation

### Phase 5

- finalize the Mac Mini recovery runbook
- run one controlled production-like smoke pass

## Definition Of Done

The remaining Mac Mini work is done only when all are true:

- the Mac Mini host runs Node 24 and both runtimes cleanly
- no production `.env` needs to travel inside a bundle archive
- worker heartbeats are visible without direct SQL-only operations
- at least two additional non-placeholder handlers are implemented and tested
- transcript to artifact to strategy flow has one real validated path
- restart and recovery steps are documented and operator-usable
