-- NEXUS Phase 1-3 additive foundation for AFinalChapter
-- Covers: credit, business foundation, funding roadmap/loop, next-step task brain, and capital setup progress.

begin;

create extension if not exists pgcrypto;

create or replace function public.nexus_ff_can_access_tenant(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  allowed boolean := false;
begin
  if p_tenant_id is null then
    return false;
  end if;

  if lower(coalesce(auth.jwt() ->> 'role', '')) in ('admin', 'super_admin') then
    return true;
  end if;

  if to_regprocedure('public.nexus_can_access_tenant(uuid)') is not null then
    execute 'select public.nexus_can_access_tenant($1)' into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regprocedure('public.nexus_can_access_tenant_compat(uuid)') is not null then
    execute 'select public.nexus_can_access_tenant_compat($1)' into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.tenant_id = $1
          and tm.user_id = auth.uid()
      )
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_members tm
        where tm.tenant_id = $1
          and tm.user_id = auth.uid()
      )
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;

grant execute on function public.nexus_ff_can_access_tenant(uuid) to authenticated;

create or replace function public.nexus_ff_touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- ==================================================
-- CREDIT SYSTEM
-- ==================================================
create table if not exists public.credit_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  report_source text,
  bureau text,
  report_status text not null default 'uploaded' check (report_status in ('uploaded','processing','parsed','failed','archived')),
  report_period_start date,
  report_period_end date,
  report_payload jsonb not null default '{}'::jsonb,
  parsed_payload jsonb not null default '{}'::jsonb,
  file_upload_id uuid null references public.uploads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credit_reports_tenant_idx on public.credit_reports (tenant_id);
create index if not exists credit_reports_user_idx on public.credit_reports (user_id);
create index if not exists credit_reports_status_idx on public.credit_reports (report_status);
create index if not exists credit_reports_created_idx on public.credit_reports (created_at desc);

create table if not exists public.credit_analysis (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  credit_report_id uuid null references public.credit_reports(id) on delete set null,
  analysis_status text not null default 'pending' check (analysis_status in ('pending','completed','failed','archived')),
  overall_score int,
  utilization_pct numeric(5,2),
  inquiry_count int,
  derogatory_count int,
  analysis_summary jsonb not null default '{}'::jsonb,
  analysis_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credit_analysis_tenant_idx on public.credit_analysis (tenant_id);
create index if not exists credit_analysis_user_idx on public.credit_analysis (user_id);
create index if not exists credit_analysis_status_idx on public.credit_analysis (analysis_status);
create index if not exists credit_analysis_created_idx on public.credit_analysis (created_at desc);

create table if not exists public.dispute_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  credit_analysis_id uuid null references public.credit_analysis(id) on delete set null,
  recommendation_status text not null default 'recommended' check (recommendation_status in ('recommended','accepted','dismissed','completed')),
  priority text not null default 'recommended' check (priority in ('urgent','recommended','low')),
  item_key text,
  title text not null,
  reasoning text,
  recommended_action text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dispute_recommendations_tenant_idx on public.dispute_recommendations (tenant_id);
create index if not exists dispute_recommendations_user_idx on public.dispute_recommendations (user_id);
create index if not exists dispute_recommendations_status_idx on public.dispute_recommendations (recommendation_status);
create index if not exists dispute_recommendations_created_idx on public.dispute_recommendations (created_at desc);

-- Existing table compatibility hardening
alter table public.dispute_letters
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists credit_report_id uuid references public.credit_reports(id) on delete set null,
  add column if not exists dispute_recommendation_id uuid references public.dispute_recommendations(id) on delete set null,
  add column if not exists document_upload_id uuid references public.uploads(id) on delete set null,
  add column if not exists letter_status text;

update public.dispute_letters
set user_id = coalesce(user_id, created_by_user_id)
where user_id is null;

update public.dispute_letters
set letter_status = coalesce(letter_status, status)
where letter_status is null;

create index if not exists dispute_letters_tenant_idx on public.dispute_letters (tenant_id);
create index if not exists dispute_letters_user_idx on public.dispute_letters (user_id);
create index if not exists dispute_letters_status_idx on public.dispute_letters (letter_status);
create index if not exists dispute_letters_created_idx on public.dispute_letters (created_at desc);

-- ==================================================
-- BUSINESS FOUNDATION
-- ==================================================
create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_path text check (business_path in ('new_business','existing_business_optimization')),
  legal_name text,
  entity_type text,
  ein text,
  business_address text,
  business_phone text,
  business_website text,
  naics_code text,
  profile_status text not null default 'not_started' check (profile_status in ('not_started','in_progress','ready','completed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists business_profiles_tenant_idx on public.business_profiles (tenant_id);
create index if not exists business_profiles_user_idx on public.business_profiles (user_id);
create index if not exists business_profiles_status_idx on public.business_profiles (profile_status);
create index if not exists business_profiles_created_idx on public.business_profiles (created_at desc);

create table if not exists public.business_setup_progress (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_profile_id uuid null references public.business_profiles(id) on delete set null,
  step_key text not null,
  step_status text not null default 'not_started' check (step_status in ('not_started','in_progress','completed','blocked')),
  is_required boolean not null default true,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, step_key)
);

create index if not exists business_setup_progress_tenant_idx on public.business_setup_progress (tenant_id);
create index if not exists business_setup_progress_user_idx on public.business_setup_progress (user_id);
create index if not exists business_setup_progress_status_idx on public.business_setup_progress (step_status);
create index if not exists business_setup_progress_created_idx on public.business_setup_progress (created_at desc);

create table if not exists public.business_classification (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_profile_id uuid null references public.business_profiles(id) on delete set null,
  naics_code text,
  sic_code text,
  industry text,
  classification_status text not null default 'not_started' check (classification_status in ('not_started','in_progress','completed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists business_classification_tenant_idx on public.business_classification (tenant_id);
create index if not exists business_classification_user_idx on public.business_classification (user_id);
create index if not exists business_classification_status_idx on public.business_classification (classification_status);
create index if not exists business_classification_created_idx on public.business_classification (created_at desc);

create table if not exists public.business_tax_profile (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_profile_id uuid null references public.business_profiles(id) on delete set null,
  ein text,
  irs_alignment_status text not null default 'not_started' check (irs_alignment_status in ('not_started','in_progress','completed')),
  tax_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists business_tax_profile_tenant_idx on public.business_tax_profile (tenant_id);
create index if not exists business_tax_profile_user_idx on public.business_tax_profile (user_id);
create index if not exists business_tax_profile_status_idx on public.business_tax_profile (status);
create index if not exists business_tax_profile_created_idx on public.business_tax_profile (created_at desc);

create table if not exists public.business_banking_profile (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_profile_id uuid null references public.business_profiles(id) on delete set null,
  bank_name text,
  account_type text,
  bank_profile_status text not null default 'not_started' check (bank_profile_status in ('not_started','in_progress','completed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists business_banking_profile_tenant_idx on public.business_banking_profile (tenant_id);
create index if not exists business_banking_profile_user_idx on public.business_banking_profile (user_id);
create index if not exists business_banking_profile_status_idx on public.business_banking_profile (bank_profile_status);
create index if not exists business_banking_profile_created_idx on public.business_banking_profile (created_at desc);

create table if not exists public.business_optimization_profile (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_profile_id uuid null references public.business_profiles(id) on delete set null,
  optimization_status text not null default 'not_started' check (optimization_status in ('not_started','in_progress','completed')),
  address_aligned boolean,
  irs_ein_aligned boolean,
  bank_aligned boolean,
  consistency_review_complete boolean,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists business_optimization_profile_tenant_idx on public.business_optimization_profile (tenant_id);
create index if not exists business_optimization_profile_user_idx on public.business_optimization_profile (user_id);
create index if not exists business_optimization_profile_status_idx on public.business_optimization_profile (optimization_status);
create index if not exists business_optimization_profile_created_idx on public.business_optimization_profile (created_at desc);

create table if not exists public.business_update_tracking (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_profile_id uuid null references public.business_profiles(id) on delete set null,
  update_type text not null,
  update_status text not null default 'logged' check (update_status in ('logged','in_progress','completed','cancelled')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_update_tracking_tenant_idx on public.business_update_tracking (tenant_id);
create index if not exists business_update_tracking_user_idx on public.business_update_tracking (user_id);
create index if not exists business_update_tracking_status_idx on public.business_update_tracking (update_status);
create index if not exists business_update_tracking_created_idx on public.business_update_tracking (created_at desc);

-- ==================================================
-- FUNDING ENGINE
-- ==================================================
create table if not exists public.funding_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  current_stage text not null default 'credit_optimization' check (
    current_stage in ('credit_optimization','business_foundation','funding_roadmap','application_loop','post_funding_capital')
  ),
  readiness_status text not null default 'not_ready' check (readiness_status in ('not_ready','ready','blocked')),
  profile_status text not null default 'active' check (profile_status in ('active','paused','archived')),
  last_recommendation jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists funding_profiles_tenant_idx on public.funding_profiles (tenant_id);
create index if not exists funding_profiles_user_idx on public.funding_profiles (user_id);
create index if not exists funding_profiles_status_idx on public.funding_profiles (readiness_status);
create index if not exists funding_profiles_created_idx on public.funding_profiles (created_at desc);

create table if not exists public.funding_strategy_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  funding_profile_id uuid null references public.funding_profiles(id) on delete set null,
  step_key text not null,
  step_title text not null,
  step_description text,
  step_status text not null default 'pending' check (step_status in ('pending','active','completed','skipped','blocked')),
  sort_order int not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, step_key)
);

create index if not exists funding_strategy_steps_tenant_idx on public.funding_strategy_steps (tenant_id);
create index if not exists funding_strategy_steps_user_idx on public.funding_strategy_steps (user_id);
create index if not exists funding_strategy_steps_status_idx on public.funding_strategy_steps (step_status);
create index if not exists funding_strategy_steps_created_idx on public.funding_strategy_steps (created_at desc);

create table if not exists public.funding_applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  funding_profile_id uuid null references public.funding_profiles(id) on delete set null,
  strategy_step_id uuid null references public.funding_strategy_steps(id) on delete set null,
  provider_name text,
  product_name text,
  bureau_used text,
  submitted_at timestamptz,
  decision_status text not null default 'submitted' check (decision_status in ('submitted','approved','denied','pending','cancelled')),
  approved_amount_cents bigint,
  inquiry_detected boolean,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists funding_applications_tenant_idx on public.funding_applications (tenant_id);
create index if not exists funding_applications_user_idx on public.funding_applications (user_id);
create index if not exists funding_applications_status_idx on public.funding_applications (decision_status);
create index if not exists funding_applications_created_idx on public.funding_applications (created_at desc);

create table if not exists public.funding_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  funding_application_id uuid null references public.funding_applications(id) on delete set null,
  result_status text not null default 'pending' check (result_status in ('submitted','approved','denied','pending','cancelled')),
  approved_amount_cents bigint,
  result_notes text,
  outcome_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists funding_results_tenant_idx on public.funding_results (tenant_id);
create index if not exists funding_results_user_idx on public.funding_results (user_id);
create index if not exists funding_results_status_idx on public.funding_results (result_status);
create index if not exists funding_results_created_idx on public.funding_results (created_at desc);

-- ==================================================
-- NEXT STEP ENGINE EXTENSIONS
-- ==================================================
alter table public.client_tasks
  add column if not exists task_category text,
  add column if not exists priority text not null default 'recommended' check (priority in ('urgent','recommended','low')),
  add column if not exists dismissed_at timestamptz;

create index if not exists client_tasks_tenant_priority_idx
  on public.client_tasks (tenant_id, priority, status);

create index if not exists client_tasks_dismissed_idx
  on public.client_tasks (tenant_id, dismissed_at);

-- ==================================================
-- CAPITAL FUTURE-SAFE EXTENSION
-- ==================================================
create table if not exists public.capital_setup_progress (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  capital_profile_id uuid null references public.capital_profiles(id) on delete set null,
  step_key text not null,
  step_status text not null default 'not_started' check (step_status in ('not_started','in_progress','completed','blocked')),
  is_required boolean not null default true,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, step_key)
);

create index if not exists capital_setup_progress_tenant_idx on public.capital_setup_progress (tenant_id);
create index if not exists capital_setup_progress_user_idx on public.capital_setup_progress (user_id);
create index if not exists capital_setup_progress_status_idx on public.capital_setup_progress (step_status);
create index if not exists capital_setup_progress_created_idx on public.capital_setup_progress (created_at desc);

-- ==================================================
-- updated_at triggers
-- ==================================================
drop trigger if exists trg_credit_reports_updated_at on public.credit_reports;
create trigger trg_credit_reports_updated_at
before update on public.credit_reports
for each row execute procedure public.nexus_ff_touch_updated_at();

drop trigger if exists trg_credit_analysis_updated_at on public.credit_analysis;
create trigger trg_credit_analysis_updated_at
before update on public.credit_analysis
for each row execute procedure public.nexus_ff_touch_updated_at();

drop trigger if exists trg_dispute_recommendations_updated_at on public.dispute_recommendations;
create trigger trg_dispute_recommendations_updated_at
before update on public.dispute_recommendations
for each row execute procedure public.nexus_ff_touch_updated_at();

drop trigger if exists trg_business_profiles_updated_at on public.business_profiles;
create trigger trg_business_profiles_updated_at
before update on public.business_profiles
for each row execute procedure public.nexus_ff_touch_updated_at();

drop trigger if exists trg_business_setup_progress_updated_at on public.business_setup_progress;
create trigger trg_business_setup_progress_updated_at
before update on public.business_setup_progress
for each row execute procedure public.nexus_ff_touch_updated_at();

drop trigger if exists trg_business_classification_updated_at on public.business_classification;
create trigger trg_business_classification_updated_at
before update on public.business_classification
for each row execute procedure public.nexus_ff_touch_updated_at();

drop trigger if exists trg_business_tax_profile_updated_at on public.business_tax_profile;
create trigger trg_business_tax_profile_updated_at
before update on public.business_tax_profile
for each row execute procedure public.nexus_ff_touch_updated_at();

drop trigger if exists trg_business_banking_profile_updated_at on public.business_banking_profile;
create trigger trg_business_banking_profile_updated_at
before update on public.business_banking_profile
for each row execute procedure public.nexus_ff_touch_updated_at();

drop trigger if exists trg_business_optimization_profile_updated_at on public.business_optimization_profile;
create trigger trg_business_optimization_profile_updated_at
before update on public.business_optimization_profile
for each row execute procedure public.nexus_ff_touch_updated_at();

drop trigger if exists trg_business_update_tracking_updated_at on public.business_update_tracking;
create trigger trg_business_update_tracking_updated_at
before update on public.business_update_tracking
for each row execute procedure public.nexus_ff_touch_updated_at();

drop trigger if exists trg_funding_profiles_updated_at on public.funding_profiles;
create trigger trg_funding_profiles_updated_at
before update on public.funding_profiles
for each row execute procedure public.nexus_ff_touch_updated_at();

drop trigger if exists trg_funding_strategy_steps_updated_at on public.funding_strategy_steps;
create trigger trg_funding_strategy_steps_updated_at
before update on public.funding_strategy_steps
for each row execute procedure public.nexus_ff_touch_updated_at();

drop trigger if exists trg_funding_applications_updated_at on public.funding_applications;
create trigger trg_funding_applications_updated_at
before update on public.funding_applications
for each row execute procedure public.nexus_ff_touch_updated_at();

drop trigger if exists trg_funding_results_updated_at on public.funding_results;
create trigger trg_funding_results_updated_at
before update on public.funding_results
for each row execute procedure public.nexus_ff_touch_updated_at();

drop trigger if exists trg_capital_setup_progress_updated_at on public.capital_setup_progress;
create trigger trg_capital_setup_progress_updated_at
before update on public.capital_setup_progress
for each row execute procedure public.nexus_ff_touch_updated_at();

-- ==================================================
-- RLS scaffolding
-- ==================================================
alter table public.credit_reports enable row level security;
alter table public.credit_analysis enable row level security;
alter table public.dispute_recommendations enable row level security;
alter table public.business_profiles enable row level security;
alter table public.business_setup_progress enable row level security;
alter table public.business_classification enable row level security;
alter table public.business_tax_profile enable row level security;
alter table public.business_banking_profile enable row level security;
alter table public.business_optimization_profile enable row level security;
alter table public.business_update_tracking enable row level security;
alter table public.funding_profiles enable row level security;
alter table public.funding_strategy_steps enable row level security;
alter table public.funding_applications enable row level security;
alter table public.funding_results enable row level security;
alter table public.capital_setup_progress enable row level security;

-- Credit policies

drop policy if exists credit_reports_select_scope on public.credit_reports;
create policy credit_reports_select_scope on public.credit_reports
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists credit_reports_insert_scope on public.credit_reports;
create policy credit_reports_insert_scope on public.credit_reports
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists credit_reports_update_scope on public.credit_reports;
create policy credit_reports_update_scope on public.credit_reports
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists credit_analysis_select_scope on public.credit_analysis;
create policy credit_analysis_select_scope on public.credit_analysis
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists credit_analysis_insert_scope on public.credit_analysis;
create policy credit_analysis_insert_scope on public.credit_analysis
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists credit_analysis_update_scope on public.credit_analysis;
create policy credit_analysis_update_scope on public.credit_analysis
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists dispute_recommendations_select_scope on public.dispute_recommendations;
create policy dispute_recommendations_select_scope on public.dispute_recommendations
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists dispute_recommendations_insert_scope on public.dispute_recommendations;
create policy dispute_recommendations_insert_scope on public.dispute_recommendations
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists dispute_recommendations_update_scope on public.dispute_recommendations;
create policy dispute_recommendations_update_scope on public.dispute_recommendations
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

-- Business policies

drop policy if exists business_profiles_select_scope on public.business_profiles;
create policy business_profiles_select_scope on public.business_profiles
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_profiles_insert_scope on public.business_profiles;
create policy business_profiles_insert_scope on public.business_profiles
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_profiles_update_scope on public.business_profiles;
create policy business_profiles_update_scope on public.business_profiles
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_setup_progress_select_scope on public.business_setup_progress;
create policy business_setup_progress_select_scope on public.business_setup_progress
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_setup_progress_insert_scope on public.business_setup_progress;
create policy business_setup_progress_insert_scope on public.business_setup_progress
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_setup_progress_update_scope on public.business_setup_progress;
create policy business_setup_progress_update_scope on public.business_setup_progress
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_classification_select_scope on public.business_classification;
create policy business_classification_select_scope on public.business_classification
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_classification_insert_scope on public.business_classification;
create policy business_classification_insert_scope on public.business_classification
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_classification_update_scope on public.business_classification;
create policy business_classification_update_scope on public.business_classification
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_tax_profile_select_scope on public.business_tax_profile;
create policy business_tax_profile_select_scope on public.business_tax_profile
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_tax_profile_insert_scope on public.business_tax_profile;
create policy business_tax_profile_insert_scope on public.business_tax_profile
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_tax_profile_update_scope on public.business_tax_profile;
create policy business_tax_profile_update_scope on public.business_tax_profile
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_banking_profile_select_scope on public.business_banking_profile;
create policy business_banking_profile_select_scope on public.business_banking_profile
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_banking_profile_insert_scope on public.business_banking_profile;
create policy business_banking_profile_insert_scope on public.business_banking_profile
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_banking_profile_update_scope on public.business_banking_profile;
create policy business_banking_profile_update_scope on public.business_banking_profile
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_optimization_profile_select_scope on public.business_optimization_profile;
create policy business_optimization_profile_select_scope on public.business_optimization_profile
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_optimization_profile_insert_scope on public.business_optimization_profile;
create policy business_optimization_profile_insert_scope on public.business_optimization_profile
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_optimization_profile_update_scope on public.business_optimization_profile;
create policy business_optimization_profile_update_scope on public.business_optimization_profile
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_update_tracking_select_scope on public.business_update_tracking;
create policy business_update_tracking_select_scope on public.business_update_tracking
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_update_tracking_insert_scope on public.business_update_tracking;
create policy business_update_tracking_insert_scope on public.business_update_tracking
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists business_update_tracking_update_scope on public.business_update_tracking;
create policy business_update_tracking_update_scope on public.business_update_tracking
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

-- Funding policies

drop policy if exists funding_profiles_select_scope on public.funding_profiles;
create policy funding_profiles_select_scope on public.funding_profiles
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists funding_profiles_insert_scope on public.funding_profiles;
create policy funding_profiles_insert_scope on public.funding_profiles
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists funding_profiles_update_scope on public.funding_profiles;
create policy funding_profiles_update_scope on public.funding_profiles
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists funding_strategy_steps_select_scope on public.funding_strategy_steps;
create policy funding_strategy_steps_select_scope on public.funding_strategy_steps
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists funding_strategy_steps_insert_scope on public.funding_strategy_steps;
create policy funding_strategy_steps_insert_scope on public.funding_strategy_steps
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists funding_strategy_steps_update_scope on public.funding_strategy_steps;
create policy funding_strategy_steps_update_scope on public.funding_strategy_steps
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists funding_applications_select_scope on public.funding_applications;
create policy funding_applications_select_scope on public.funding_applications
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists funding_applications_insert_scope on public.funding_applications;
create policy funding_applications_insert_scope on public.funding_applications
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists funding_applications_update_scope on public.funding_applications;
create policy funding_applications_update_scope on public.funding_applications
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists funding_results_select_scope on public.funding_results;
create policy funding_results_select_scope on public.funding_results
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists funding_results_insert_scope on public.funding_results;
create policy funding_results_insert_scope on public.funding_results
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists funding_results_update_scope on public.funding_results;
create policy funding_results_update_scope on public.funding_results
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

-- Capital setup progress policies

drop policy if exists capital_setup_progress_select_scope on public.capital_setup_progress;
create policy capital_setup_progress_select_scope on public.capital_setup_progress
for select to authenticated
using (public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists capital_setup_progress_insert_scope on public.capital_setup_progress;
create policy capital_setup_progress_insert_scope on public.capital_setup_progress
for insert to authenticated
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

drop policy if exists capital_setup_progress_update_scope on public.capital_setup_progress;
create policy capital_setup_progress_update_scope on public.capital_setup_progress
for update to authenticated
using (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id))
with check (auth.uid() = user_id and public.nexus_ff_can_access_tenant(tenant_id));

commit;
