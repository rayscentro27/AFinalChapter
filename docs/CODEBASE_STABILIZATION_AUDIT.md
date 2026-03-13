# NEXUS_CODEBASE_STABILIZATION_AUDIT

Date: 2026-03-13
Mode: Non-destructive audit only (no deletions, no refactors applied)

## Scope
Repository-wide cleanup/stabilization audit focused on:
- unused/duplicate modules
- orphaned SQL/migration artifacts
- stale scripts/entrypoints
- documentation coverage gaps
- runtime/build validation posture

## Evidence Summary
- Frontend build: `npm run build` succeeds.
- Gateway tests: `npm --prefix gateway run test` succeeds.
- Monorepo type check: `npx tsc --noEmit` fails with many errors across mixed TS targets (web + Supabase Deno + unintegrated server prototypes).
- Worktree has significant unrelated dirty/untracked content, increasing PR risk.

## Findings (Priority Ordered)

### 1) Worktree Hygiene Risk (High)
- Large untracked directories and files are present during active development (`control_center/`, `lead_intelligence/`, `marketing_automation/`, `operations_center/`, `reputation_engine/`, `research/`, many `opt/nexus-services/*`).
- Risk: accidental staging/commit contamination, noisy diffs, unclear source-of-truth modules.

Recommendation:
- Add local-ignore strategy for prototype/generated paths (`.git/info/exclude`) or formalize with a tracked structure under `experimental/`.
- Keep selective staging discipline (`git add <explicit files>` only).

### 2) Tracked Placeholder Files in Repo Root (High)
- Tracked files: `[full_path_of_file_1]`, `[full_path_of_file_2]`.
- These contain non-meaningful binary/garbled content and are not referenced by code/docs.

Recommendation:
- Safe removal candidate in a dedicated cleanup PR.

### 3) Duplicate/Compatibility Function Surface (Medium)
- Multiple Netlify send/routing entrypoints exist for overlapping behavior:
  - `netlify/functions/messages-send.ts` (actively used by UI client)
  - `netlify/functions/send_message.ts` (backward-compatible route)
  - `netlify/functions/send-sms.ts`, `send-whatsapp.ts`, `send-meta.ts` (adapters to `send-outbox.ts`)
  - `netlify/functions/routing-run.ts` wrapper to `routing_run.ts`
- Risk: parallel maintenance burden and drift between alias endpoints.

Recommendation:
- Keep compatibility routes, but mark deprecation targets and set a removal window.
- Define canonical endpoints in docs (`messages-send`, `routing-run`) and classify wrappers as legacy aliases.

### 4) SQL Artifact Duplication / Orphan Risk (Medium)
- Supabase migrations are present and active in `supabase/migrations/*`.
- Legacy top-level SQL files also exist (`supabase_*.sql`) and overlap conceptually with migrated features.
- Draft SQLs in `docs/sql_drafts/` appear superseded by applied migrations:
  - `phase1_job_queue_schema.sql`
  - `phase1_worker_heartbeat_schema.sql`
  - `phase1_ai_cache_schema.sql`
  - `phase3_system_errors_schema.sql`

Risk:
- Team confusion over authoritative schema source.

Recommendation:
- Treat `supabase/migrations/` as sole executable source.
- Move legacy top-level SQL and draft SQL docs into an explicit archive (`docs/archive/sql_legacy/`) with clear “non-authoritative” header.

### 5) TypeScript Validation Fragmentation (Medium)
- Global `npx tsc --noEmit` fails due mixed environment targets and unintegrated modules, including:
  - web app typing issues
  - `server/research/*` prototype TS files not integrated with gateway
  - Supabase Deno function type/import mismatch under web TS config
- Risk: false-negative CI signal and reduced confidence in regression checks.

Recommendation:
- Split TS configs by runtime target:
  - web app (`tsconfig.app.json`)
  - gateway/node (`tsconfig.gateway.json`)
  - supabase functions (`tsconfig.supabase.json` or Deno-specific validation path)
- Scope CI checks per target rather than one global compile pass.

## Safe File Removal Candidates (Non-applied)
These are the safest first-pass candidates based on current evidence:
1. `[full_path_of_file_1]`
2. `[full_path_of_file_2]`

Potential second-pass candidates (after verification + communication):
1. legacy alias entrypoints once usage is confirmed zero
2. archived SQL drafts moved out of active docs path

## Module Consolidation Suggestions
1. Netlify send API surface
- Canonical: `messages-send.ts`
- Legacy aliases: `send_message.ts`, `send-sms.ts`, `send-whatsapp.ts`, `send-meta.ts`, `send-outbox.ts`
- Action: add deprecation annotations and shared helper to avoid drift.

2. Routing function naming
- Canonical public route appears as `routing-run.ts`.
- Internal implementation is `routing_run.ts`.
- Action: keep one implementation file and one compatibility wrapper, document clearly.

3. Research backend ownership boundary
- Gateway production research routes exist in `gateway/src/routes/research.js`.
- `server/research/*.ts` appears prototype-only and unreferenced by runtime.
- Action: either integrate formally into gateway architecture or relocate to `experimental/`.

## Documentation Gaps
1. No single “authoritative schema source” policy doc.
2. No explicit endpoint deprecation registry (legacy aliases vs canonical endpoints).
3. No runtime-target validation matrix (web/node/deno) for TS checks.
4. `supabase/MIGRATION_INDEX.md` is narrow (research pass focused) and does not function as a full-project migration map.

## Recommended Low-Risk Cleanup Sequence
1. PR-A: remove placeholder garbage files only.
2. PR-B: add docs clarifying canonical vs legacy Netlify endpoints.
3. PR-C: archive legacy/draft SQL docs with non-authoritative labels.
4. PR-D: split TS validation targets and update CI scripts.

## Copy/Paste Audit Commands
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux

# Validate runtime status
npm run build
npm --prefix gateway run test
npx tsc --noEmit --pretty false

# Check duplicates / aliases
rg -n "messages-send|send_message|send-outbox|send-meta|send-sms|send-whatsapp|routing-run|routing_run" netlify/functions docs lib src components

# Check legacy SQL outside migrations
find . -maxdepth 1 -type f -name 'supabase_*.sql' | sort
find docs/sql_drafts -maxdepth 2 -type f | sort

# Review tracked placeholder files
git ls-files "[full_path_of_file_1]" "[full_path_of_file_2]"
```

## Non-Destructive Confirmation
- No files deleted.
- No refactors applied.
- Audit/report only.
