# Repo Alignment Summary

## Scope
Alignment audit for architecture:
- Mac Mini runs OpenClaw + AI employees
- Oracle VM runs Nexus API only
- Supabase is the shared research brain
- Netlify runs CRM/control panel UI

## Classification

### A) Keep As-Is
These remain valid and were not removed:
- Frontend/UI and control panel code:
  - `App.tsx`, `Sidebar.tsx`, `components/**`, `src/**`, `contexts/**`
- Integration/data access layers:
  - `adapters/**`, `lib/**`, `services/**`, `utils/**`
- Netlify deploy/runtime assets:
  - `netlify/functions/**`, `netlify.toml`, `docs/NETLIFY_FUNCTIONS.md`
- Supabase assets and schemas:
  - `schema.sql`, `supabase/migrations/**`, `docs/supabase/**`
- Prompt libraries and strategy/research pipeline prompt specs:
  - `nexus-codex-prompts/**` (except minimal wording updates listed below)

### B) Revised For Mac Mini Architecture
Revised in this pass:
- `nexus-codex-prompts/nexus-codex-prompts/00_codex_master_prompt.txt`
  - Added architecture baseline: OpenClaw on external Mac Mini operator node, Oracle API-only role.
- `nexus-codex-prompts/nexus-codex-prompts/prompt_17_vector_memory_layer_pgvector.txt`
  - Updated embedding generation assumption to external OpenClaw node on Mac Mini.

Created in this pass:
- `ARCHITECTURE_CURRENT.md`
- `MAC_MINI_INTEGRATION_PLAN.md`
- `REPO_ALIGNMENT_SUMMARY.md`

### C) Deprecated / Remove (Oracle-OpenClaw-Specific)
Deprecated (retained as historical handoff, not active runtime instructions):
- `ORACLE_OPENCLAW_ABORT_AND_HANDOFF.md`
- `docs/DEPRECATED_ORACLE_OPENCLAW_ITEMS.md`

No active Oracle-only OpenClaw bootstrap/systemd scripts were found in the current tracked repo to delete.

## What Was Kept
- Supabase schemas and migration lineage
- Research pipeline assumptions and prompts
- Strategy/ranking/signal/control-panel logic
- Netlify + UI runtime structure
- Oracle backend integration assumptions (API role)

## What Was Revised
- Architecture assumptions where OpenClaw role needed explicit externalization to Mac Mini.

## What Was Deprecated
- Oracle-hosted OpenClaw path as an operating model.

## What Remains To Build (Mac Mini Side)
1. Mac Mini runtime/service wrapper for OpenClaw process supervision.
2. Secure env/profile management for Codex/OpenAI auth and API integrations.
3. Mac Mini health/heartbeat reporting into existing operator state tables.
4. End-to-end validation jobs from transcript -> artifact -> strategy -> proposal signal.
5. Operational runbook for restart/recovery on Mac Mini.
