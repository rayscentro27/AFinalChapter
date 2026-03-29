# Autonomous Run Issues Log (2026-03-15)

## Scope
Issues encountered while continuing prompt execution unattended.

## Resolved During Run
1. Control-plane endpoint auth path
- Symptom: `401 missing_authorization` without bearer token.
- Resolution: verified expected behavior; authenticated test runner used with real user token.

2. Token-path confusion across Windows/WSL
- Symptom: token file not found/empty in Linux runtime.
- Resolution: standardized source path (`/mnt/c/tmp/real_user_bearer_token.txt`) and mirror path (`/home/rayscentro/Projects/AFinalChapter_linux/.secrets/real_user_bearer_token.txt`).

3. Control-plane check script env export bug
- Symptom: script reported valid JWT as invalid.
- Cause: token/env vars not exported before Node subprocess reads.
- Resolution: script rewritten to export `TOKEN`, `USER_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Active Gaps (Not Auto-Fixed)
1. Control-plane tables missing in target Supabase
- Evidence from authenticated checks:
  - `systemConfig` missing
  - `feature_flags` missing
  - `incident_events` missing
  - `control_plane_audit_log` missing
- Impact: control-plane endpoints return safe empty/missing-table states.

2. Control-plane writes disabled by runtime flag
- `CONTROL_PLANE_WRITE_ENABLED=false`
- Impact: mode/flag/emergency write endpoints remain gated.

3. Large pre-existing dirty worktree
- Many unrelated modified/untracked files existed before run.
- Approach used: selective commits only for targeted changes.

## Artifacts Added This Run
- `scripts/run_control_plane_checks.sh`
- `docs/NEXUS_TRANSCRIPT_TO_VIDEO_CONTENT_ENGINE.md`
- `docs/NEXUS_FACELESS_VIDEO_TEMPLATE_LIBRARY.md`
- `docs/NEXUS_CONTENT_ENGINE_IMPLEMENTATION_SPEC.md`
- `docs/sql_drafts/content_engine_schema.sql`
- `docs/NEXUS_WEEKLY_CONTENT_PRODUCTION_SOP.md`
- `docs/NEXUS_GO_LIVE_DAY_PLAN.md`

## Recommended Next Actions (When Back)
1. Apply reviewed control-plane migrations to Supabase environment.
2. Re-run `./scripts/run_control_plane_checks.sh`.
3. Enable `CONTROL_PLANE_WRITE_ENABLED=true` in non-production first, then retest write actions.
4. Review/commit new docs and script selectively.
