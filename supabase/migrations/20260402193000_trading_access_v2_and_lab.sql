-- Phase: Trading Access V2 + Strategy Lab scaffold (Windows-side).
-- Additive migration: trading access extensions + Mac Mini strategy lab storage + admin lab read support.

begin;

create extension if not exists pgcrypto;

-- Trading access V2 fields (additive, backward compatible).
alter table public.user_advanced_access
  add column if not exists trading_access_tier text not null default 'client_basic'
    check (trading_access_tier in ('super_admin','internal_operator','client_basic','client_intermediate','client_advanced'));

alter table public.user_advanced_access
  add column if not exists trading_stage text not null default 'education_only'
    check (trading_stage in ('education_only','paper_trading','strategy_view','demo_broker_enabled','admin_lab_full'));

alter table public.user_advanced_access
  add column if not exists admin_lab_enabled boolean not null default false;

alter table public.user_advanced_access
  add column if not exists strategy_access_allowed boolean not null default false;

alter table public.user_advanced_access
  add column if not exists demo_connection_allowed boolean not null default false;

alter table public.user_advanced_access
  add column if not exists trading_level integer not null default 0
    check (trading_level >= 0 and trading_level <= 100);

-- Update compatibility view to include new fields.
drop view if exists public.trading_opt_in_status;
create view public.trading_opt_in_status as
select
  uaa.id,
  uaa.tenant_id,
  uaa.user_id,
  uaa.feature_key,
  uaa.eligibility_status,
  uaa.unlocked_by_rule,
  uaa.opted_in,
  uaa.opted_in_at,
  uaa.intro_video_url,
  uaa.intro_video_watched_at,
  uaa.disclaimer_version,
  uaa.disclaimer_accepted_at,
  uaa.paper_trading_acknowledged,
  uaa.paper_trading_acknowledged_at,
  uaa.access_status,
  uaa.trading_access_tier,
  uaa.trading_stage,
  uaa.admin_lab_enabled,
  uaa.strategy_access_allowed,
  uaa.demo_connection_allowed,
  uaa.trading_level,
  uaa.metadata,
  uaa.created_at,
  uaa.updated_at
from public.user_advanced_access uaa
where uaa.feature_key = 'advanced_trading';

-- Admin/internal gate for trading lab data (fallback to role if master-admin function not available).
create or replace function public.nexus_is_trading_lab_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  allowed boolean := false;
begin
  if to_regprocedure('public.nexus_is_master_admin_compat()') is not null then
    execute 'select public.nexus_is_master_admin_compat()' into allowed;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if lower(coalesce(auth.jwt() ->> 'role', '')) in ('admin', 'super_admin', 'supervisor') then
    return true;
  end if;

  return false;
end;
$fn$;

grant execute on function public.nexus_is_trading_lab_admin() to authenticated;

-- Strategy ingestion + Hermes lab tables (written by Mac Mini, read by portal/admin).

create table if not exists public.strategy_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null references public.tenants(id) on delete set null,
  source_type text not null,
  source_url text null,
  source_title text null,
  source_author text null,
  asset_class text null,
  collected_by text null,
  collected_at timestamptz not null default now(),
  raw_reference jsonb not null default '{}'::jsonb
);

comment on table public.strategy_sources is
  'Mac Mini writes strategy source metadata; portal/admin reads for lab visibility.';

create index if not exists strategy_sources_tenant_type_idx
  on public.strategy_sources (tenant_id, source_type, collected_at desc);

create index if not exists strategy_sources_asset_class_idx
  on public.strategy_sources (asset_class, collected_at desc);

create table if not exists public.strategy_transcripts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.strategy_sources(id) on delete cascade,
  transcript_text text not null,
  cleaned_text text null,
  summary_text text null,
  created_at timestamptz not null default now()
);

comment on table public.strategy_transcripts is
  'Mac Mini writes transcript parsing for strategy sources; portal/admin reads.';

create index if not exists strategy_transcripts_source_idx
  on public.strategy_transcripts (source_id, created_at desc);

create table if not exists public.strategy_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null references public.tenants(id) on delete set null,
  source_id uuid null references public.strategy_sources(id) on delete set null,
  transcript_id uuid null references public.strategy_transcripts(id) on delete set null,
  candidate_name text not null,
  asset_class text not null,
  market_type text null,
  timeframe text null,
  entry_rules jsonb not null default '[]'::jsonb,
  exit_rules jsonb not null default '[]'::jsonb,
  risk_rules jsonb not null default '[]'::jsonb,
  filters_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_by text null,
  created_at timestamptz not null default now()
);

comment on table public.strategy_candidates is
  'Hermes/Mac Mini writes draft strategy candidates; portal/admin reads.';

create index if not exists strategy_candidates_tenant_status_idx
  on public.strategy_candidates (tenant_id, status, created_at desc);

create index if not exists strategy_candidates_asset_idx
  on public.strategy_candidates (asset_class, created_at desc);

create table if not exists public.strategy_scores (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references public.strategy_candidates(id) on delete cascade,
  clarity_score numeric null,
  replicability_score numeric null,
  risk_definition_score numeric null,
  asset_fit_score numeric null,
  complexity_score numeric null,
  data_availability_score numeric null,
  penalty_score numeric null,
  total_score numeric null,
  recommendation text null,
  reasoning text null,
  scored_by text not null default 'Hermes Core',
  created_at timestamptz not null default now()
);

comment on table public.strategy_scores is
  'Hermes scores for strategy candidates (Mac Mini writes; portal/admin reads).';

alter table public.strategy_scores
  add column if not exists candidate_id uuid references public.strategy_candidates(id) on delete cascade,
  add column if not exists clarity_score numeric null,
  add column if not exists replicability_score numeric null,
  add column if not exists risk_definition_score numeric null,
  add column if not exists asset_fit_score numeric null,
  add column if not exists complexity_score numeric null,
  add column if not exists data_availability_score numeric null,
  add column if not exists penalty_score numeric null,
  add column if not exists total_score numeric null,
  add column if not exists recommendation text null,
  add column if not exists reasoning text null,
  add column if not exists scored_by text not null default 'Hermes Core',
  add column if not exists created_at timestamptz not null default now();

create index if not exists strategy_scores_candidate_idx
  on public.strategy_scores (candidate_id, created_at desc);

create table if not exists public.strategy_versions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references public.strategy_candidates(id) on delete cascade,
  version_number int not null,
  rules_json jsonb not null default '{}'::jsonb,
  parameter_json jsonb not null default '{}'::jsonb,
  notes text null,
  status text not null default 'draft',
  created_by text not null default 'Hermes Core',
  created_at timestamptz not null default now()
);

comment on table public.strategy_versions is
  'Strategy version snapshots for backtests (Mac Mini writes; portal/admin reads).';

create unique index if not exists strategy_versions_candidate_version_uniq
  on public.strategy_versions (candidate_id, version_number);

create index if not exists strategy_versions_status_idx
  on public.strategy_versions (status, created_at desc);

create table if not exists public.strategy_backtest_runs (
  id uuid primary key default gen_random_uuid(),
  strategy_version_id uuid references public.strategy_versions(id) on delete cascade,
  asset_class text not null,
  symbol text null,
  timeframe text null,
  test_period_start date null,
  test_period_end date null,
  run_status text not null default 'queued',
  engine_name text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now()
);

comment on table public.strategy_backtest_runs is
  'Backtest runs written by Mac Mini; portal/admin reads.';

create index if not exists strategy_backtest_runs_status_idx
  on public.strategy_backtest_runs (run_status, created_at desc);

create index if not exists strategy_backtest_runs_version_idx
  on public.strategy_backtest_runs (strategy_version_id, created_at desc);

create table if not exists public.strategy_backtest_metrics (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.strategy_backtest_runs(id) on delete cascade,
  net_pnl numeric null,
  expectancy numeric null,
  profit_factor numeric null,
  win_rate numeric null,
  max_drawdown numeric null,
  sharpe_like numeric null,
  trade_count int null,
  robustness_score numeric null,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.strategy_backtest_metrics is
  'Metrics for backtest runs (Mac Mini writes; portal/admin reads).';

create index if not exists strategy_backtest_metrics_run_idx
  on public.strategy_backtest_metrics (run_id, created_at desc);

create table if not exists public.strategy_validation_reports (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.strategy_backtest_runs(id) on delete cascade,
  validation_score numeric null,
  out_of_sample_score numeric null,
  walk_forward_score numeric null,
  regime_consistency_score numeric null,
  recommendation text null,
  report_text text null,
  created_by text not null default 'Hermes Core',
  created_at timestamptz not null default now()
);

comment on table public.strategy_validation_reports is
  'Validation and regime checks for backtests (Mac Mini writes; portal/admin reads).';

create index if not exists strategy_validation_reports_run_idx
  on public.strategy_validation_reports (run_id, created_at desc);

create table if not exists public.demo_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_user_id uuid null references auth.users(id) on delete set null,
  provider text not null,
  account_label text not null,
  account_mode text not null default 'demo',
  connection_status text not null default 'disconnected',
  last_sync_at timestamptz null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.demo_accounts is
  'Demo broker accounts (admin/internal only). Mac Mini updates status; portal reads.';

create index if not exists demo_accounts_tenant_status_idx
  on public.demo_accounts (tenant_id, connection_status, created_at desc);

create table if not exists public.paper_trading_journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  strategy_version_id uuid null references public.strategy_versions(id) on delete set null,
  asset_class text not null,
  symbol text null,
  timeframe text null,
  thesis text null,
  entry_idea text null,
  stop_loss numeric null,
  target_price numeric null,
  risk_percent numeric null,
  screenshot_urls jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  entry_status text not null default 'draft',
  opened_at timestamptz null,
  closed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.paper_trading_journal_entries is
  'Client paper trading journal (client scoped, tenant-bound).';

create index if not exists paper_trading_journal_entries_tenant_status_idx
  on public.paper_trading_journal_entries (tenant_id, entry_status, created_at desc);

create index if not exists paper_trading_journal_entries_user_idx
  on public.paper_trading_journal_entries (user_id, created_at desc);

create table if not exists public.paper_trading_outcomes (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid references public.paper_trading_journal_entries(id) on delete cascade,
  result_label text null,
  pnl_amount numeric null,
  pnl_percent numeric null,
  max_favorable_excursion numeric null,
  max_adverse_excursion numeric null,
  notes text null,
  created_at timestamptz not null default now()
);

comment on table public.paper_trading_outcomes is
  'Outcome metrics for paper trading journals (client scoped).';

create index if not exists paper_trading_outcomes_entry_idx
  on public.paper_trading_outcomes (journal_entry_id, created_at desc);

create table if not exists public.demo_trade_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  strategy_version_id uuid references public.strategy_versions(id) on delete cascade,
  demo_account_id uuid null references public.demo_accounts(id) on delete set null,
  run_name text not null,
  asset_class text not null,
  run_status text not null default 'queued',
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now()
);

comment on table public.demo_trade_runs is
  'Demo trading runs (admin/internal only). Mac Mini writes; portal admin reads.';

create index if not exists demo_trade_runs_status_idx
  on public.demo_trade_runs (run_status, created_at desc);

create index if not exists demo_trade_runs_tenant_idx
  on public.demo_trade_runs (tenant_id, created_at desc);

create table if not exists public.demo_trade_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.demo_trade_runs(id) on delete cascade,
  event_type text not null,
  symbol text null,
  side text null,
  quantity numeric null,
  price numeric null,
  event_time timestamptz null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.demo_trade_events is
  'Demo trade event stream (admin/internal only).';

create index if not exists demo_trade_events_run_idx
  on public.demo_trade_events (run_id, created_at desc);

create table if not exists public.demo_trade_metrics (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.demo_trade_runs(id) on delete cascade,
  trade_count int null,
  net_pnl numeric null,
  win_rate numeric null,
  max_drawdown numeric null,
  stability_score numeric null,
  recommendation text null,
  created_at timestamptz not null default now()
);

comment on table public.demo_trade_metrics is
  'Metrics for demo trading runs (admin/internal only).';

create index if not exists demo_trade_metrics_run_idx
  on public.demo_trade_metrics (run_id, created_at desc);

create table if not exists public.hermes_review_queue (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  entity_type text not null,
  entity_id uuid not null,
  status text not null default 'pending',
  attempt_count int not null default 0,
  last_error text null,
  created_at timestamptz not null default now(),
  processed_at timestamptz null
);

comment on table public.hermes_review_queue is
  'Hermes/Mac Mini review queue (admin/internal only).';

create index if not exists hermes_review_queue_status_idx
  on public.hermes_review_queue (status, created_at desc);

create table if not exists public.hermes_reviews (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  entity_type text not null,
  entity_id uuid not null,
  review_type text not null,
  review_score numeric null,
  review_text text null,
  recommendations_json jsonb not null default '[]'::jsonb,
  created_by text not null default 'Hermes Core',
  created_at timestamptz not null default now()
);

comment on table public.hermes_reviews is
  'Hermes review outputs (admin/internal only).';

create index if not exists hermes_reviews_domain_idx
  on public.hermes_reviews (domain, created_at desc);

create table if not exists public.trading_lessons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null references public.tenants(id) on delete set null,
  lesson_type text not null,
  title text not null,
  description text not null,
  source_review_id uuid null references public.hermes_reviews(id) on delete set null,
  confidence_score numeric null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

comment on table public.trading_lessons is
  'Derived lessons for trading education (Mac Mini writes; portal/admin reads).';

create index if not exists trading_lessons_tenant_status_idx
  on public.trading_lessons (tenant_id, status, created_at desc);

create table if not exists public.founder_trading_summaries (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  summary_type text not null,
  headline text not null,
  summary text not null,
  wins_json jsonb not null default '[]'::jsonb,
  losses_json jsonb not null default '[]'::jsonb,
  recommended_actions_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.founder_trading_summaries is
  'Founder/internal trading summaries (admin/internal only).';

create index if not exists founder_trading_summaries_period_idx
  on public.founder_trading_summaries (period_end desc);

-- updated_at trigger for journal entries
drop trigger if exists trg_paper_trading_journal_entries_updated_at on public.paper_trading_journal_entries;
create trigger trg_paper_trading_journal_entries_updated_at
before update on public.paper_trading_journal_entries
for each row execute function public.nexus_trading_touch_updated_at();

-- RLS enablement
alter table public.strategy_sources enable row level security;
alter table public.strategy_transcripts enable row level security;
alter table public.strategy_candidates enable row level security;
alter table public.strategy_scores enable row level security;
alter table public.strategy_versions enable row level security;
alter table public.strategy_backtest_runs enable row level security;
alter table public.strategy_backtest_metrics enable row level security;
alter table public.strategy_validation_reports enable row level security;
alter table public.demo_accounts enable row level security;
alter table public.paper_trading_journal_entries enable row level security;
alter table public.paper_trading_outcomes enable row level security;
alter table public.demo_trade_runs enable row level security;
alter table public.demo_trade_events enable row level security;
alter table public.demo_trade_metrics enable row level security;
alter table public.hermes_review_queue enable row level security;
alter table public.hermes_reviews enable row level security;
alter table public.trading_lessons enable row level security;
alter table public.founder_trading_summaries enable row level security;

-- RLS policies: strategy sources (tenant scoped + admin override).
drop policy if exists strategy_sources_select_scope on public.strategy_sources;
create policy strategy_sources_select_scope
on public.strategy_sources
for select
using (
  (tenant_id is not null and public.nexus_trading_can_access_tenant(tenant_id))
  or (tenant_id is null and public.nexus_is_trading_lab_admin())
);

drop policy if exists strategy_sources_insert_scope on public.strategy_sources;
create policy strategy_sources_insert_scope
on public.strategy_sources
for insert
with check (
  public.nexus_is_trading_lab_admin()
  or (tenant_id is not null and public.nexus_trading_can_manage_tenant(tenant_id))
);

drop policy if exists strategy_sources_update_scope on public.strategy_sources;
create policy strategy_sources_update_scope
on public.strategy_sources
for update
using (
  public.nexus_is_trading_lab_admin()
  or (tenant_id is not null and public.nexus_trading_can_manage_tenant(tenant_id))
)
with check (
  public.nexus_is_trading_lab_admin()
  or (tenant_id is not null and public.nexus_trading_can_manage_tenant(tenant_id))
);

-- Strategy transcripts: admin/internal only.
drop policy if exists strategy_transcripts_select_scope on public.strategy_transcripts;
create policy strategy_transcripts_select_scope
on public.strategy_transcripts
for select
using (public.nexus_is_trading_lab_admin());

drop policy if exists strategy_transcripts_insert_scope on public.strategy_transcripts;
create policy strategy_transcripts_insert_scope
on public.strategy_transcripts
for insert
with check (public.nexus_is_trading_lab_admin());

drop policy if exists strategy_transcripts_update_scope on public.strategy_transcripts;
create policy strategy_transcripts_update_scope
on public.strategy_transcripts
for update
using (public.nexus_is_trading_lab_admin())
with check (public.nexus_is_trading_lab_admin());

-- Strategy candidates: tenant scoped + admin override.
drop policy if exists strategy_candidates_select_scope on public.strategy_candidates;
create policy strategy_candidates_select_scope
on public.strategy_candidates
for select
using (
  (tenant_id is not null and public.nexus_trading_can_access_tenant(tenant_id))
  or (tenant_id is null and public.nexus_is_trading_lab_admin())
);

drop policy if exists strategy_candidates_insert_scope on public.strategy_candidates;
create policy strategy_candidates_insert_scope
on public.strategy_candidates
for insert
with check (
  public.nexus_is_trading_lab_admin()
  or (tenant_id is not null and public.nexus_trading_can_manage_tenant(tenant_id))
);

drop policy if exists strategy_candidates_update_scope on public.strategy_candidates;
create policy strategy_candidates_update_scope
on public.strategy_candidates
for update
using (
  public.nexus_is_trading_lab_admin()
  or (tenant_id is not null and public.nexus_trading_can_manage_tenant(tenant_id))
)
with check (
  public.nexus_is_trading_lab_admin()
  or (tenant_id is not null and public.nexus_trading_can_manage_tenant(tenant_id))
);

-- Strategy scores: admin/internal only.
drop policy if exists strategy_scores_select_scope on public.strategy_scores;
create policy strategy_scores_select_scope
on public.strategy_scores
for select
using (public.nexus_is_trading_lab_admin());

drop policy if exists strategy_scores_insert_scope on public.strategy_scores;
create policy strategy_scores_insert_scope
on public.strategy_scores
for insert
with check (public.nexus_is_trading_lab_admin());

drop policy if exists strategy_scores_update_scope on public.strategy_scores;
create policy strategy_scores_update_scope
on public.strategy_scores
for update
using (public.nexus_is_trading_lab_admin())
with check (public.nexus_is_trading_lab_admin());

-- Strategy versions: admin/internal only.
drop policy if exists strategy_versions_select_scope on public.strategy_versions;
create policy strategy_versions_select_scope
on public.strategy_versions
for select
using (public.nexus_is_trading_lab_admin());

drop policy if exists strategy_versions_insert_scope on public.strategy_versions;
create policy strategy_versions_insert_scope
on public.strategy_versions
for insert
with check (public.nexus_is_trading_lab_admin());

drop policy if exists strategy_versions_update_scope on public.strategy_versions;
create policy strategy_versions_update_scope
on public.strategy_versions
for update
using (public.nexus_is_trading_lab_admin())
with check (public.nexus_is_trading_lab_admin());

-- Backtest runs/metrics/validation: admin/internal only.
drop policy if exists strategy_backtest_runs_select_scope on public.strategy_backtest_runs;
create policy strategy_backtest_runs_select_scope
on public.strategy_backtest_runs
for select
using (public.nexus_is_trading_lab_admin());

drop policy if exists strategy_backtest_runs_insert_scope on public.strategy_backtest_runs;
create policy strategy_backtest_runs_insert_scope
on public.strategy_backtest_runs
for insert
with check (public.nexus_is_trading_lab_admin());

drop policy if exists strategy_backtest_runs_update_scope on public.strategy_backtest_runs;
create policy strategy_backtest_runs_update_scope
on public.strategy_backtest_runs
for update
using (public.nexus_is_trading_lab_admin())
with check (public.nexus_is_trading_lab_admin());

drop policy if exists strategy_backtest_metrics_select_scope on public.strategy_backtest_metrics;
create policy strategy_backtest_metrics_select_scope
on public.strategy_backtest_metrics
for select
using (public.nexus_is_trading_lab_admin());

drop policy if exists strategy_backtest_metrics_insert_scope on public.strategy_backtest_metrics;
create policy strategy_backtest_metrics_insert_scope
on public.strategy_backtest_metrics
for insert
with check (public.nexus_is_trading_lab_admin());

drop policy if exists strategy_backtest_metrics_update_scope on public.strategy_backtest_metrics;
create policy strategy_backtest_metrics_update_scope
on public.strategy_backtest_metrics
for update
using (public.nexus_is_trading_lab_admin())
with check (public.nexus_is_trading_lab_admin());

drop policy if exists strategy_validation_reports_select_scope on public.strategy_validation_reports;
create policy strategy_validation_reports_select_scope
on public.strategy_validation_reports
for select
using (public.nexus_is_trading_lab_admin());

drop policy if exists strategy_validation_reports_insert_scope on public.strategy_validation_reports;
create policy strategy_validation_reports_insert_scope
on public.strategy_validation_reports
for insert
with check (public.nexus_is_trading_lab_admin());

drop policy if exists strategy_validation_reports_update_scope on public.strategy_validation_reports;
create policy strategy_validation_reports_update_scope
on public.strategy_validation_reports
for update
using (public.nexus_is_trading_lab_admin())
with check (public.nexus_is_trading_lab_admin());

-- Demo accounts and demo trade tables: admin/internal only.
drop policy if exists demo_accounts_select_scope on public.demo_accounts;
create policy demo_accounts_select_scope
on public.demo_accounts
for select
using (public.nexus_is_trading_lab_admin());

drop policy if exists demo_accounts_insert_scope on public.demo_accounts;
create policy demo_accounts_insert_scope
on public.demo_accounts
for insert
with check (public.nexus_is_trading_lab_admin());

drop policy if exists demo_accounts_update_scope on public.demo_accounts;
create policy demo_accounts_update_scope
on public.demo_accounts
for update
using (public.nexus_is_trading_lab_admin())
with check (public.nexus_is_trading_lab_admin());

drop policy if exists demo_trade_runs_select_scope on public.demo_trade_runs;
create policy demo_trade_runs_select_scope
on public.demo_trade_runs
for select
using (public.nexus_is_trading_lab_admin());

drop policy if exists demo_trade_runs_insert_scope on public.demo_trade_runs;
create policy demo_trade_runs_insert_scope
on public.demo_trade_runs
for insert
with check (public.nexus_is_trading_lab_admin());

drop policy if exists demo_trade_runs_update_scope on public.demo_trade_runs;
create policy demo_trade_runs_update_scope
on public.demo_trade_runs
for update
using (public.nexus_is_trading_lab_admin())
with check (public.nexus_is_trading_lab_admin());

drop policy if exists demo_trade_events_select_scope on public.demo_trade_events;
create policy demo_trade_events_select_scope
on public.demo_trade_events
for select
using (public.nexus_is_trading_lab_admin());

drop policy if exists demo_trade_events_insert_scope on public.demo_trade_events;
create policy demo_trade_events_insert_scope
on public.demo_trade_events
for insert
with check (public.nexus_is_trading_lab_admin());

drop policy if exists demo_trade_events_update_scope on public.demo_trade_events;
create policy demo_trade_events_update_scope
on public.demo_trade_events
for update
using (public.nexus_is_trading_lab_admin())
with check (public.nexus_is_trading_lab_admin());

drop policy if exists demo_trade_metrics_select_scope on public.demo_trade_metrics;
create policy demo_trade_metrics_select_scope
on public.demo_trade_metrics
for select
using (public.nexus_is_trading_lab_admin());

drop policy if exists demo_trade_metrics_insert_scope on public.demo_trade_metrics;
create policy demo_trade_metrics_insert_scope
on public.demo_trade_metrics
for insert
with check (public.nexus_is_trading_lab_admin());

drop policy if exists demo_trade_metrics_update_scope on public.demo_trade_metrics;
create policy demo_trade_metrics_update_scope
on public.demo_trade_metrics
for update
using (public.nexus_is_trading_lab_admin())
with check (public.nexus_is_trading_lab_admin());

-- Paper trading journals: tenant scoped (client allowed).
drop policy if exists paper_trading_journal_entries_select_scope on public.paper_trading_journal_entries;
create policy paper_trading_journal_entries_select_scope
on public.paper_trading_journal_entries
for select
using (public.nexus_trading_can_access_tenant(tenant_id));

drop policy if exists paper_trading_journal_entries_insert_scope on public.paper_trading_journal_entries;
create policy paper_trading_journal_entries_insert_scope
on public.paper_trading_journal_entries
for insert
with check (
  auth.role() = 'authenticated'
  and auth.uid() = user_id
  and public.nexus_trading_can_access_tenant(tenant_id)
);

drop policy if exists paper_trading_journal_entries_update_scope on public.paper_trading_journal_entries;
create policy paper_trading_journal_entries_update_scope
on public.paper_trading_journal_entries
for update
using (
  auth.role() = 'authenticated'
  and public.nexus_trading_can_access_tenant(tenant_id)
)
with check (
  auth.role() = 'authenticated'
  and public.nexus_trading_can_access_tenant(tenant_id)
);

drop policy if exists paper_trading_outcomes_select_scope on public.paper_trading_outcomes;
create policy paper_trading_outcomes_select_scope
on public.paper_trading_outcomes
for select
using (
  exists (
    select 1
    from public.paper_trading_journal_entries j
    where j.id = paper_trading_outcomes.journal_entry_id
      and public.nexus_trading_can_access_tenant(j.tenant_id)
  )
);

drop policy if exists paper_trading_outcomes_insert_scope on public.paper_trading_outcomes;
create policy paper_trading_outcomes_insert_scope
on public.paper_trading_outcomes
for insert
with check (
  exists (
    select 1
    from public.paper_trading_journal_entries j
    where j.id = paper_trading_outcomes.journal_entry_id
      and auth.uid() = j.user_id
      and public.nexus_trading_can_access_tenant(j.tenant_id)
  )
);

drop policy if exists paper_trading_outcomes_update_scope on public.paper_trading_outcomes;
create policy paper_trading_outcomes_update_scope
on public.paper_trading_outcomes
for update
using (
  exists (
    select 1
    from public.paper_trading_journal_entries j
    where j.id = paper_trading_outcomes.journal_entry_id
      and public.nexus_trading_can_access_tenant(j.tenant_id)
  )
)
with check (
  exists (
    select 1
    from public.paper_trading_journal_entries j
    where j.id = paper_trading_outcomes.journal_entry_id
      and public.nexus_trading_can_access_tenant(j.tenant_id)
  )
);

-- Hermes queue/reviews and founder summaries: admin/internal only.
drop policy if exists hermes_review_queue_select_scope on public.hermes_review_queue;
create policy hermes_review_queue_select_scope
on public.hermes_review_queue
for select
using (public.nexus_is_trading_lab_admin());

drop policy if exists hermes_review_queue_insert_scope on public.hermes_review_queue;
create policy hermes_review_queue_insert_scope
on public.hermes_review_queue
for insert
with check (public.nexus_is_trading_lab_admin());

drop policy if exists hermes_review_queue_update_scope on public.hermes_review_queue;
create policy hermes_review_queue_update_scope
on public.hermes_review_queue
for update
using (public.nexus_is_trading_lab_admin())
with check (public.nexus_is_trading_lab_admin());

drop policy if exists hermes_reviews_select_scope on public.hermes_reviews;
create policy hermes_reviews_select_scope
on public.hermes_reviews
for select
using (public.nexus_is_trading_lab_admin());

drop policy if exists hermes_reviews_insert_scope on public.hermes_reviews;
create policy hermes_reviews_insert_scope
on public.hermes_reviews
for insert
with check (public.nexus_is_trading_lab_admin());

drop policy if exists hermes_reviews_update_scope on public.hermes_reviews;
create policy hermes_reviews_update_scope
on public.hermes_reviews
for update
using (public.nexus_is_trading_lab_admin())
with check (public.nexus_is_trading_lab_admin());

drop policy if exists trading_lessons_select_scope on public.trading_lessons;
create policy trading_lessons_select_scope
on public.trading_lessons
for select
using (
  (tenant_id is not null and public.nexus_trading_can_access_tenant(tenant_id))
  or (tenant_id is null and public.nexus_is_trading_lab_admin())
);

drop policy if exists trading_lessons_insert_scope on public.trading_lessons;
create policy trading_lessons_insert_scope
on public.trading_lessons
for insert
with check (
  public.nexus_is_trading_lab_admin()
  or (tenant_id is not null and public.nexus_trading_can_manage_tenant(tenant_id))
);

drop policy if exists trading_lessons_update_scope on public.trading_lessons;
create policy trading_lessons_update_scope
on public.trading_lessons
for update
using (
  public.nexus_is_trading_lab_admin()
  or (tenant_id is not null and public.nexus_trading_can_manage_tenant(tenant_id))
)
with check (
  public.nexus_is_trading_lab_admin()
  or (tenant_id is not null and public.nexus_trading_can_manage_tenant(tenant_id))
);

drop policy if exists founder_trading_summaries_select_scope on public.founder_trading_summaries;
create policy founder_trading_summaries_select_scope
on public.founder_trading_summaries
for select
using (public.nexus_is_trading_lab_admin());

drop policy if exists founder_trading_summaries_insert_scope on public.founder_trading_summaries;
create policy founder_trading_summaries_insert_scope
on public.founder_trading_summaries
for insert
with check (public.nexus_is_trading_lab_admin());

drop policy if exists founder_trading_summaries_update_scope on public.founder_trading_summaries;
create policy founder_trading_summaries_update_scope
on public.founder_trading_summaries
for update
using (public.nexus_is_trading_lab_admin())
with check (public.nexus_is_trading_lab_admin());

commit;
