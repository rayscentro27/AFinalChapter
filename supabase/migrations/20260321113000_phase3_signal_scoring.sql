-- Phase 3 signal scoring + approval/publish pipeline.
-- Additive and idempotent migration for candidate -> scoring -> review -> published flow.

begin;

create extension if not exists pgcrypto;

create or replace function public.nexus_signal_touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create or replace function public.nexus_signal_can_access_tenant(p_tenant_id uuid)
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

  if to_regprocedure('public.nexus_trading_can_access_tenant(uuid)') is not null then
    execute 'select public.nexus_trading_can_access_tenant($1)' into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regprocedure('public.nexus_can_access_tenant(uuid)') is not null then
    execute 'select public.nexus_can_access_tenant($1)' into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regprocedure('public.nexus_can_read_tenant(uuid)') is not null then
    execute 'select public.nexus_can_read_tenant($1)' into allowed using p_tenant_id;
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

create or replace function public.nexus_signal_can_manage_tenant(p_tenant_id uuid)
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

  if to_regprocedure('public.nexus_trading_can_manage_tenant(uuid)') is not null then
    execute 'select public.nexus_trading_can_manage_tenant($1)' into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regprocedure('public.nexus_can_manage_tenant(uuid)') is not null then
    execute 'select public.nexus_can_manage_tenant($1)' into allowed using p_tenant_id;
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
          and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'super_admin')
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
          and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'super_admin')
      )
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;

create table if not exists public.signal_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  normalized_signal_id uuid null references public.tv_normalized_signals(id) on delete set null,
  user_id uuid null references auth.users(id) on delete set null,
  symbol text not null,
  market_type text not null default 'forex',
  setup_type text null,
  direction text not null,
  timeframe text not null,
  entry_price numeric null,
  stop_loss numeric null,
  take_profit numeric null,
  rr_ratio numeric null,
  confidence numeric null,
  status text not null default 'new' check (status in ('new', 'scoring', 'scored', 'approved', 'rejected', 'expired', 'published')),
  rejection_reason text null,
  ai_review jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  published_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists signal_candidates_tenant_normalized_uniq
  on public.signal_candidates (tenant_id, normalized_signal_id)
  where normalized_signal_id is not null;

create index if not exists signal_candidates_tenant_status_created_idx
  on public.signal_candidates (tenant_id, status, created_at desc);

create index if not exists signal_candidates_symbol_market_timeframe_idx
  on public.signal_candidates (symbol, market_type, timeframe, created_at desc);

create table if not exists public.signal_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  candidate_id uuid not null references public.signal_candidates(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  score_total numeric(6,2) not null default 0,
  market_score numeric(6,2) not null default 0,
  technical_score numeric(6,2) not null default 0,
  risk_score numeric(6,2) not null default 0,
  quality_score numeric(6,2) not null default 0,
  rr_ratio numeric(8,4) null,
  confidence_label text null,
  risk_label text null,
  scoring_version text not null default 'v1',
  scoring_notes text null,
  score_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id)
);

create index if not exists signal_scores_tenant_total_created_idx
  on public.signal_scores (tenant_id, score_total desc, created_at desc);

create index if not exists signal_scores_candidate_idx
  on public.signal_scores (candidate_id);

create table if not exists public.signal_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  candidate_id uuid not null references public.signal_candidates(id) on delete cascade,
  score_id uuid null references public.signal_scores(id) on delete set null,
  reviewer_user_id uuid null references auth.users(id) on delete set null,
  review_status text not null check (review_status in ('approved', 'rejected', 'expired')),
  decision_reason text null,
  threshold_score numeric(6,2) not null default 50,
  min_rr_ratio numeric(8,4) not null default 1.5,
  require_medium_confidence boolean not null default true,
  reviewed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id)
);

create index if not exists signal_reviews_tenant_status_reviewed_idx
  on public.signal_reviews (tenant_id, review_status, reviewed_at desc);

create index if not exists signal_reviews_candidate_idx
  on public.signal_reviews (candidate_id);

create table if not exists public.approved_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  candidate_id uuid not null references public.signal_candidates(id) on delete cascade,
  score_id uuid null references public.signal_scores(id) on delete set null,
  review_id uuid null references public.signal_reviews(id) on delete set null,
  user_id uuid null references auth.users(id) on delete set null,
  symbol text not null,
  market_type text not null default 'forex',
  setup_type text null,
  direction text not null,
  timeframe text not null,
  headline text null,
  client_summary text null,
  why_it_matters text null,
  invalidation_note text null,
  confidence_label text null,
  risk_label text null,
  score_total numeric(6,2) null,
  review_status text not null default 'published' check (review_status in ('approved', 'published', 'rejected', 'expired')),
  is_published boolean not null default true,
  published_at timestamptz not null default now(),
  expires_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id)
);

create index if not exists approved_signals_tenant_published_expires_idx
  on public.approved_signals (tenant_id, is_published, review_status, expires_at, published_at desc);

create index if not exists approved_signals_symbol_market_timeframe_idx
  on public.approved_signals (symbol, market_type, timeframe, published_at desc);

-- Keep updated_at current.
drop trigger if exists trg_signal_candidates_updated_at on public.signal_candidates;
create trigger trg_signal_candidates_updated_at
before update on public.signal_candidates
for each row execute function public.nexus_signal_touch_updated_at();

drop trigger if exists trg_signal_scores_updated_at on public.signal_scores;
create trigger trg_signal_scores_updated_at
before update on public.signal_scores
for each row execute function public.nexus_signal_touch_updated_at();

drop trigger if exists trg_signal_reviews_updated_at on public.signal_reviews;
create trigger trg_signal_reviews_updated_at
before update on public.signal_reviews
for each row execute function public.nexus_signal_touch_updated_at();

drop trigger if exists trg_approved_signals_updated_at on public.approved_signals;
create trigger trg_approved_signals_updated_at
before update on public.approved_signals
for each row execute function public.nexus_signal_touch_updated_at();

alter table public.signal_candidates enable row level security;
alter table public.signal_scores enable row level security;
alter table public.signal_reviews enable row level security;
alter table public.approved_signals enable row level security;

-- signal_candidates policies

drop policy if exists signal_candidates_select_scope on public.signal_candidates;
create policy signal_candidates_select_scope
on public.signal_candidates
for select
using (public.nexus_signal_can_access_tenant(tenant_id));

drop policy if exists signal_candidates_insert_scope on public.signal_candidates;
create policy signal_candidates_insert_scope
on public.signal_candidates
for insert
with check (
  auth.role() = 'authenticated'
  and public.nexus_signal_can_manage_tenant(tenant_id)
);

drop policy if exists signal_candidates_update_scope on public.signal_candidates;
create policy signal_candidates_update_scope
on public.signal_candidates
for update
using (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id))
with check (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id));

drop policy if exists signal_candidates_delete_scope on public.signal_candidates;
create policy signal_candidates_delete_scope
on public.signal_candidates
for delete
using (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id));

-- signal_scores policies

drop policy if exists signal_scores_select_scope on public.signal_scores;
create policy signal_scores_select_scope
on public.signal_scores
for select
using (public.nexus_signal_can_access_tenant(tenant_id));

drop policy if exists signal_scores_insert_scope on public.signal_scores;
create policy signal_scores_insert_scope
on public.signal_scores
for insert
with check (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id));

drop policy if exists signal_scores_update_scope on public.signal_scores;
create policy signal_scores_update_scope
on public.signal_scores
for update
using (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id))
with check (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id));

drop policy if exists signal_scores_delete_scope on public.signal_scores;
create policy signal_scores_delete_scope
on public.signal_scores
for delete
using (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id));

-- signal_reviews policies

drop policy if exists signal_reviews_select_scope on public.signal_reviews;
create policy signal_reviews_select_scope
on public.signal_reviews
for select
using (public.nexus_signal_can_access_tenant(tenant_id));

drop policy if exists signal_reviews_insert_scope on public.signal_reviews;
create policy signal_reviews_insert_scope
on public.signal_reviews
for insert
with check (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id));

drop policy if exists signal_reviews_update_scope on public.signal_reviews;
create policy signal_reviews_update_scope
on public.signal_reviews
for update
using (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id))
with check (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id));

drop policy if exists signal_reviews_delete_scope on public.signal_reviews;
create policy signal_reviews_delete_scope
on public.signal_reviews
for delete
using (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id));

-- approved_signals policies

drop policy if exists approved_signals_select_scope on public.approved_signals;
create policy approved_signals_select_scope
on public.approved_signals
for select
using (
  public.nexus_signal_can_access_tenant(tenant_id)
  and is_published = true
  and review_status in ('approved', 'published')
  and (expires_at is null or expires_at > now())
);

drop policy if exists approved_signals_insert_scope on public.approved_signals;
create policy approved_signals_insert_scope
on public.approved_signals
for insert
with check (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id));

drop policy if exists approved_signals_update_scope on public.approved_signals;
create policy approved_signals_update_scope
on public.approved_signals
for update
using (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id))
with check (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id));

drop policy if exists approved_signals_delete_scope on public.approved_signals;
create policy approved_signals_delete_scope
on public.approved_signals
for delete
using (auth.role() = 'authenticated' and public.nexus_signal_can_manage_tenant(tenant_id));

commit;
