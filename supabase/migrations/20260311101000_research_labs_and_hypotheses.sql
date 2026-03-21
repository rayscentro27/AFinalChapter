begin;
create extension if not exists pgcrypto;
create table if not exists public.paper_trade_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  run_key text not null unique,
  strategy_id text,
  strategy_variant_id uuid,
  asset_type text not null default 'forex',
  symbol text,
  status text not null default 'queued',
  decision text,
  approval_status text,
  confidence_band text,
  started_at timestamptz,
  finished_at timestamptz,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.replay_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  paper_trade_run_id uuid,
  strategy_id text,
  asset_type text,
  symbol text,
  status text not null default 'complete',
  decision text,
  approval_status text,
  confidence_band text,
  trades_total integer,
  win_rate numeric,
  net_pnl numeric,
  max_drawdown numeric,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.confidence_calibration (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  strategy_id text,
  asset_type text,
  symbol text,
  confidence_band text,
  sample_size integer,
  expected_win_rate numeric,
  realized_win_rate numeric,
  calibration_error numeric,
  status text not null default 'active',
  decision text,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.strategy_optimizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  strategy_id text not null,
  base_strategy_id text,
  asset_type text,
  symbol text,
  status text not null default 'queued',
  decision text,
  approval_status text,
  confidence_band text,
  objective text,
  baseline_metric numeric,
  optimized_metric numeric,
  improvement_pct numeric,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.strategy_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  variant_key text not null unique,
  strategy_id text not null,
  parent_strategy_id text,
  asset_type text,
  symbol text,
  status text not null default 'candidate',
  decision text,
  approval_status text,
  confidence_band text,
  parameters jsonb not null default '{}'::jsonb,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.research_clusters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  cluster_key text not null unique,
  asset_type text,
  symbol text,
  status text not null default 'active',
  decision text,
  confidence_band text,
  summary text,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.research_hypotheses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  hypothesis_key text not null unique,
  cluster_id uuid,
  strategy_id text,
  asset_type text,
  symbol text,
  hypothesis text not null,
  status text not null default 'open',
  decision text,
  approval_status text,
  confidence_band text,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.coverage_gaps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  gap_key text not null unique,
  strategy_id text,
  asset_type text,
  symbol text,
  status text not null default 'open',
  decision text,
  approval_status text,
  confidence_band text,
  gap_type text,
  priority text,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.research_briefs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  brief_key text not null unique,
  hypothesis_id uuid,
  strategy_id text,
  asset_type text,
  symbol text,
  title text not null,
  status text not null default 'draft',
  decision text,
  approval_status text,
  confidence_band text,
  body text,
  author_agent text,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- Existing environments may already contain earlier versions of these tables.
-- Backfill missing columns before creating indexes/views.
alter table public.paper_trade_runs add column if not exists tenant_id uuid;
alter table public.paper_trade_runs add column if not exists run_key text;
alter table public.paper_trade_runs add column if not exists strategy_id text;
alter table public.paper_trade_runs add column if not exists strategy_variant_id uuid;
alter table public.paper_trade_runs add column if not exists asset_type text not null default 'forex';
alter table public.paper_trade_runs add column if not exists symbol text;
alter table public.paper_trade_runs add column if not exists status text not null default 'queued';
alter table public.paper_trade_runs add column if not exists decision text;
alter table public.paper_trade_runs add column if not exists approval_status text;
alter table public.paper_trade_runs add column if not exists confidence_band text;
alter table public.paper_trade_runs add column if not exists started_at timestamptz;
alter table public.paper_trade_runs add column if not exists finished_at timestamptz;
alter table public.paper_trade_runs add column if not exists notes text;
alter table public.paper_trade_runs add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.paper_trade_runs add column if not exists created_at timestamptz not null default now();
alter table public.replay_results add column if not exists tenant_id uuid;
alter table public.replay_results add column if not exists paper_trade_run_id uuid;
alter table public.replay_results add column if not exists strategy_id text;
alter table public.replay_results add column if not exists asset_type text;
alter table public.replay_results add column if not exists symbol text;
alter table public.replay_results add column if not exists status text not null default 'complete';
alter table public.replay_results add column if not exists decision text;
alter table public.replay_results add column if not exists approval_status text;
alter table public.replay_results add column if not exists confidence_band text;
alter table public.replay_results add column if not exists trades_total integer;
alter table public.replay_results add column if not exists win_rate numeric;
alter table public.replay_results add column if not exists net_pnl numeric;
alter table public.replay_results add column if not exists max_drawdown numeric;
alter table public.replay_results add column if not exists notes text;
alter table public.replay_results add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.replay_results add column if not exists created_at timestamptz not null default now();
alter table public.confidence_calibration add column if not exists tenant_id uuid;
alter table public.confidence_calibration add column if not exists strategy_id text;
alter table public.confidence_calibration add column if not exists asset_type text;
alter table public.confidence_calibration add column if not exists symbol text;
alter table public.confidence_calibration add column if not exists confidence_band text;
alter table public.confidence_calibration add column if not exists sample_size integer;
alter table public.confidence_calibration add column if not exists expected_win_rate numeric;
alter table public.confidence_calibration add column if not exists realized_win_rate numeric;
alter table public.confidence_calibration add column if not exists calibration_error numeric;
alter table public.confidence_calibration add column if not exists status text not null default 'active';
alter table public.confidence_calibration add column if not exists decision text;
alter table public.confidence_calibration add column if not exists notes text;
alter table public.confidence_calibration add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.confidence_calibration add column if not exists created_at timestamptz not null default now();
alter table public.strategy_optimizations add column if not exists tenant_id uuid;
alter table public.strategy_optimizations add column if not exists strategy_id text;
alter table public.strategy_optimizations add column if not exists base_strategy_id text;
alter table public.strategy_optimizations add column if not exists asset_type text;
alter table public.strategy_optimizations add column if not exists symbol text;
alter table public.strategy_optimizations add column if not exists status text not null default 'queued';
alter table public.strategy_optimizations add column if not exists decision text;
alter table public.strategy_optimizations add column if not exists approval_status text;
alter table public.strategy_optimizations add column if not exists confidence_band text;
alter table public.strategy_optimizations add column if not exists objective text;
alter table public.strategy_optimizations add column if not exists baseline_metric numeric;
alter table public.strategy_optimizations add column if not exists optimized_metric numeric;
alter table public.strategy_optimizations add column if not exists improvement_pct numeric;
alter table public.strategy_optimizations add column if not exists notes text;
alter table public.strategy_optimizations add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.strategy_optimizations add column if not exists created_at timestamptz not null default now();
alter table public.strategy_variants add column if not exists tenant_id uuid;
alter table public.strategy_variants add column if not exists variant_key text;
alter table public.strategy_variants add column if not exists strategy_id text;
alter table public.strategy_variants add column if not exists parent_strategy_id text;
alter table public.strategy_variants add column if not exists asset_type text;
alter table public.strategy_variants add column if not exists symbol text;
alter table public.strategy_variants add column if not exists status text not null default 'candidate';
alter table public.strategy_variants add column if not exists decision text;
alter table public.strategy_variants add column if not exists approval_status text;
alter table public.strategy_variants add column if not exists confidence_band text;
alter table public.strategy_variants add column if not exists parameters jsonb not null default '{}'::jsonb;
alter table public.strategy_variants add column if not exists notes text;
alter table public.strategy_variants add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.strategy_variants add column if not exists created_at timestamptz not null default now();
alter table public.research_clusters add column if not exists tenant_id uuid;
alter table public.research_clusters add column if not exists cluster_key text;
alter table public.research_clusters add column if not exists asset_type text;
alter table public.research_clusters add column if not exists symbol text;
alter table public.research_clusters add column if not exists status text not null default 'active';
alter table public.research_clusters add column if not exists decision text;
alter table public.research_clusters add column if not exists confidence_band text;
alter table public.research_clusters add column if not exists summary text;
alter table public.research_clusters add column if not exists notes text;
alter table public.research_clusters add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.research_clusters add column if not exists created_at timestamptz not null default now();
alter table public.research_hypotheses add column if not exists tenant_id uuid;
alter table public.research_hypotheses add column if not exists hypothesis_key text;
alter table public.research_hypotheses add column if not exists cluster_id uuid;
alter table public.research_hypotheses add column if not exists strategy_id text;
alter table public.research_hypotheses add column if not exists asset_type text;
alter table public.research_hypotheses add column if not exists symbol text;
alter table public.research_hypotheses add column if not exists hypothesis text;
alter table public.research_hypotheses add column if not exists status text not null default 'open';
alter table public.research_hypotheses add column if not exists decision text;
alter table public.research_hypotheses add column if not exists approval_status text;
alter table public.research_hypotheses add column if not exists confidence_band text;
alter table public.research_hypotheses add column if not exists notes text;
alter table public.research_hypotheses add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.research_hypotheses add column if not exists created_at timestamptz not null default now();
alter table public.coverage_gaps add column if not exists tenant_id uuid;
alter table public.coverage_gaps add column if not exists gap_key text;
alter table public.coverage_gaps add column if not exists strategy_id text;
alter table public.coverage_gaps add column if not exists asset_type text;
alter table public.coverage_gaps add column if not exists symbol text;
alter table public.coverage_gaps add column if not exists status text not null default 'open';
alter table public.coverage_gaps add column if not exists decision text;
alter table public.coverage_gaps add column if not exists approval_status text;
alter table public.coverage_gaps add column if not exists confidence_band text;
alter table public.coverage_gaps add column if not exists gap_type text;
alter table public.coverage_gaps add column if not exists priority text;
alter table public.coverage_gaps add column if not exists notes text;
alter table public.coverage_gaps add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.coverage_gaps add column if not exists created_at timestamptz not null default now();
alter table public.research_briefs add column if not exists tenant_id uuid;
alter table public.research_briefs add column if not exists brief_key text;
alter table public.research_briefs add column if not exists hypothesis_id uuid;
alter table public.research_briefs add column if not exists strategy_id text;
alter table public.research_briefs add column if not exists asset_type text;
alter table public.research_briefs add column if not exists symbol text;
alter table public.research_briefs add column if not exists title text;
alter table public.research_briefs add column if not exists status text not null default 'draft';
alter table public.research_briefs add column if not exists decision text;
alter table public.research_briefs add column if not exists approval_status text;
alter table public.research_briefs add column if not exists confidence_band text;
alter table public.research_briefs add column if not exists body text;
alter table public.research_briefs add column if not exists author_agent text;
alter table public.research_briefs add column if not exists notes text;
alter table public.research_briefs add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.research_briefs add column if not exists created_at timestamptz not null default now();
create index if not exists paper_trade_runs_tenant_created_idx on public.paper_trade_runs (tenant_id, created_at desc);
create index if not exists paper_trade_runs_strategy_symbol_idx on public.paper_trade_runs (strategy_id, asset_type, symbol, created_at desc);
create index if not exists paper_trade_runs_state_idx on public.paper_trade_runs (status, approval_status, decision, created_at desc);
create index if not exists paper_trade_runs_confidence_band_idx on public.paper_trade_runs (confidence_band, created_at desc);
create index if not exists replay_results_tenant_created_idx on public.replay_results (tenant_id, created_at desc);
create index if not exists replay_results_strategy_symbol_idx on public.replay_results (strategy_id, asset_type, symbol, created_at desc);
create index if not exists replay_results_state_idx on public.replay_results (status, approval_status, decision, created_at desc);
create index if not exists replay_results_confidence_band_idx on public.replay_results (confidence_band, created_at desc);
create index if not exists confidence_calibration_tenant_created_idx on public.confidence_calibration (tenant_id, created_at desc);
create index if not exists confidence_calibration_strategy_symbol_idx on public.confidence_calibration (strategy_id, asset_type, symbol, created_at desc);
create index if not exists confidence_calibration_state_idx on public.confidence_calibration (status, decision, created_at desc);
create index if not exists confidence_calibration_confidence_band_idx on public.confidence_calibration (confidence_band, created_at desc);
create index if not exists strategy_optimizations_tenant_created_idx on public.strategy_optimizations (tenant_id, created_at desc);
create index if not exists strategy_optimizations_strategy_symbol_idx on public.strategy_optimizations (strategy_id, asset_type, symbol, created_at desc);
create index if not exists strategy_optimizations_state_idx on public.strategy_optimizations (status, approval_status, decision, created_at desc);
create index if not exists strategy_optimizations_confidence_band_idx on public.strategy_optimizations (confidence_band, created_at desc);
create index if not exists strategy_variants_tenant_created_idx on public.strategy_variants (tenant_id, created_at desc);
create index if not exists strategy_variants_strategy_symbol_idx on public.strategy_variants (strategy_id, asset_type, symbol, created_at desc);
create index if not exists strategy_variants_state_idx on public.strategy_variants (status, approval_status, decision, created_at desc);
create index if not exists strategy_variants_confidence_band_idx on public.strategy_variants (confidence_band, created_at desc);
create index if not exists research_clusters_tenant_created_idx on public.research_clusters (tenant_id, created_at desc);
create index if not exists research_clusters_asset_symbol_idx on public.research_clusters (asset_type, symbol, created_at desc);
create index if not exists research_clusters_state_idx on public.research_clusters (status, decision, created_at desc);
create index if not exists research_clusters_confidence_band_idx on public.research_clusters (confidence_band, created_at desc);
create index if not exists research_hypotheses_tenant_created_idx on public.research_hypotheses (tenant_id, created_at desc);
create index if not exists research_hypotheses_strategy_symbol_idx on public.research_hypotheses (strategy_id, asset_type, symbol, created_at desc);
create index if not exists research_hypotheses_state_idx on public.research_hypotheses (status, approval_status, decision, created_at desc);
create index if not exists research_hypotheses_confidence_band_idx on public.research_hypotheses (confidence_band, created_at desc);
create index if not exists coverage_gaps_tenant_created_idx on public.coverage_gaps (tenant_id, created_at desc);
create index if not exists coverage_gaps_strategy_symbol_idx on public.coverage_gaps (strategy_id, asset_type, symbol, created_at desc);
create index if not exists coverage_gaps_state_idx on public.coverage_gaps (status, approval_status, decision, created_at desc);
create index if not exists coverage_gaps_confidence_band_idx on public.coverage_gaps (confidence_band, created_at desc);
create index if not exists research_briefs_tenant_created_idx on public.research_briefs (tenant_id, created_at desc);
create index if not exists research_briefs_strategy_symbol_idx on public.research_briefs (strategy_id, asset_type, symbol, created_at desc);
create index if not exists research_briefs_state_idx on public.research_briefs (status, approval_status, decision, created_at desc);
create index if not exists research_briefs_confidence_band_idx on public.research_briefs (confidence_band, created_at desc);
create index if not exists research_briefs_hypothesis_id_idx on public.research_briefs (hypothesis_id, created_at desc);
create index if not exists research_hypotheses_cluster_id_idx on public.research_hypotheses (cluster_id, created_at desc);
create index if not exists replay_results_run_id_idx on public.replay_results (paper_trade_run_id, created_at desc);
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'replay_results_paper_trade_run_id_fkey'
  ) then
    begin
      alter table public.replay_results
        add constraint replay_results_paper_trade_run_id_fkey
        foreign key (paper_trade_run_id) references public.paper_trade_runs(id)
        on delete set null;
    exception
      when undefined_column or datatype_mismatch or invalid_foreign_key then
        null;
    end;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'research_hypotheses_cluster_id_fkey'
  ) then
    begin
      alter table public.research_hypotheses
        add constraint research_hypotheses_cluster_id_fkey
        foreign key (cluster_id) references public.research_clusters(id)
        on delete set null;
    exception
      when undefined_column or datatype_mismatch or invalid_foreign_key then
        null;
    end;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'research_briefs_hypothesis_id_fkey'
  ) then
    begin
      alter table public.research_briefs
        add constraint research_briefs_hypothesis_id_fkey
        foreign key (hypothesis_id) references public.research_hypotheses(id)
        on delete set null;
    exception
      when undefined_column or datatype_mismatch or invalid_foreign_key then
        null;
    end;
  end if;
end $$;
commit;
