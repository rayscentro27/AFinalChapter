# Migration Index (Research Backend Consolidation)

This index documents the Windows-side consolidation pass for the research/risk/reporting layer. The migrations below are additive and ordered for safe Supabase deployment.

## Existing Baseline

- Last pre-existing migration in this repo: `20260310064434_trading_lab_intake.sql`
- Existing legacy SQL docs referenced during consolidation:
  - `opt/nexus-services/ops/supabase/approval_queue.sql`
  - `opt/nexus-services/ops/supabase/risk_governor.sql`
  - `opt/nexus-services/ops/supabase/strategy_ranking.sql`
  - `opt/nexus-services/ops/supabase/strategy_verifier.sql`
  - `opt/nexus-services/ops/supabase/research_brain.sql`

These legacy SQL files informed naming/semantics, but the exact table set requested for this pass did not yet exist as Supabase migrations under `supabase/migrations`.

## New Ordered Migrations

1. `20260311100000_research_decisioning_core.sql`
- Creates proposal/risk/approval/performance tables:
  - `reviewed_signal_proposals`
  - `risk_decisions`
  - `approval_queue`
  - `proposal_outcomes`
  - `strategy_performance`
  - `options_strategy_performance`
  - `agent_scorecards`
  - `options_trade_proposals`
  - `options_risk_decisions`
- Adds core indexes for dashboard read patterns.

2. `20260311101000_research_labs_and_hypotheses.sql`
- Creates replay/optimization/research tables:
  - `paper_trade_runs`
  - `replay_results`
  - `confidence_calibration`
  - `strategy_optimizations`
  - `strategy_variants`
  - `research_clusters`
  - `research_hypotheses`
  - `coverage_gaps`
  - `research_briefs`
- Adds indexes aligned to reporting endpoint filters/sorts.

3. `20260311102000_research_reporting_views.sql`
- Creates read-only ranking/reporting views:
  - `v_research_strategy_rankings`
  - `v_research_options_rankings`
  - `v_research_agent_scorecards_latest`

## Why This Ordering

- Core proposal/risk/performance primitives first.
- Lab/research/hypothesis artifacts second.
- Read-only views last so they compile against already-created base tables.

## Idempotency Notes

- Table creation is additive (`create table if not exists`).
- Indexes are additive (`create index if not exists`).
- Foreign-key constraints are guarded for duplicate constraint names.
- No destructive schema operations are included.

4. `20260311114000_strategy_library_registry.sql`
- Adds migration-managed support for `strategy_library` as a master strategy registry.
- Uses add-only `alter table ... add column if not exists` to avoid overwriting compatible existing schema.
- Adds index support for common reporting filters (`asset_type`, `status`, `created_by`, `updated_at`).

5. `20260323233000_nexus_one_activation_setup.sql`
- Creates the Windows-owned activation and readiness tables:
  - `setup_domains`
  - `setup_credentials`
  - `activation_steps`
  - `environment_readiness`
- Adds the `setup_status` view for activation rollups.
- Adds triggers and RLS policies for master-admin management.

6. `20260324000500_control_plane_command_lifecycle.sql`
- Extends `admin_commands` with lifecycle state, approval metadata, execution timestamps, and result fields.
- Creates `admin_command_events` for status-transition history.
- Extends `executive_briefings` with `recommendations` and `urgency`.
- Adds lifecycle transition guard and logging triggers.

7. `20260324103000_system_integration_readiness.sql`
- Creates the secure credential-readiness metadata tables:
  - `system_integrations`
  - `system_integration_checks`
  - `system_integration_events`
- Adds indexes, triggers, and RLS policies for integration readiness tracking.
- Seeds integration-readiness rows for all tenants without exposing raw secrets.

8. `20260402193000_trading_access_v2_and_lab.sql`
- Extends `user_advanced_access` with Trading Access V2 fields (tier/stage/admin-lab flags).
- Creates Mac Mini strategy lab storage tables and Hermes review surfaces.
- Adds tenant-scoped and admin-only RLS policies for the new trading data.

## Current Ordering Notes

- Activation and command-lifecycle migrations build on the existing operational tables and should be applied before the newer integration-readiness snapshot layer.
- The secure credential-readiness migration is intentionally metadata-only; it records readiness state, verification outcomes, and event history without creating a second secret store.
