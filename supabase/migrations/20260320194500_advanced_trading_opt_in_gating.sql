-- Phase 9: Advanced Trading opt-in + gating foundation (educational-only, post-funding).
-- Additive migration: creates capital/trading access scaffolding used by portal gating endpoints.

begin;

create extension if not exists pgcrypto;

create or replace function public.nexus_trading_can_access_tenant(p_tenant_id uuid)
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

create or replace function public.nexus_trading_can_manage_tenant(p_tenant_id uuid)
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

create or replace function public.nexus_trading_touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create table if not exists public.capital_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  total_funding_received_cents bigint not null default 0 check (total_funding_received_cents >= 0),
  estimated_monthly_payment_cents bigint null check (estimated_monthly_payment_cents is null or estimated_monthly_payment_cents >= 0),
  recommended_reserve_amount_cents bigint null check (recommended_reserve_amount_cents is null or recommended_reserve_amount_cents >= 0),
  reserve_months_target integer not null default 6 check (reserve_months_target between 1 and 18),
  reserve_confirmed boolean not null default false,
  reserve_confirmed_at timestamptz null,
  business_growth_positioned boolean not null default false,
  capital_setup_status text not null default 'not_started' check (capital_setup_status in ('not_started', 'in_progress', 'ready', 'completed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists capital_profiles_tenant_user_status_idx
  on public.capital_profiles (tenant_id, user_id, capital_setup_status, updated_at desc);

create table if not exists public.capital_allocation_choices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  selected_path text not null check (selected_path in ('business_growth', 'trading_education', 'grant_funding')),
  selected_at timestamptz not null default now(),
  current_state text not null default 'active' check (current_state in ('locked', 'active', 'paused', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists capital_allocation_choices_tenant_user_state_idx
  on public.capital_allocation_choices (tenant_id, user_id, current_state, updated_at desc);

create table if not exists public.user_advanced_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null,
  eligibility_status text not null default 'unknown' check (eligibility_status in ('unknown', 'eligible', 'ineligible')),
  unlocked_by_rule boolean not null default false,
  opted_in boolean not null default false,
  opted_in_at timestamptz null,
  intro_video_url text null,
  intro_video_watched_at timestamptz null,
  disclaimer_version text not null default 'trading-v1',
  disclaimer_accepted_at timestamptz null,
  paper_trading_acknowledged boolean not null default false,
  paper_trading_acknowledged_at timestamptz null,
  access_status text not null default 'locked' check (access_status in ('locked', 'eligible_pending', 'in_progress', 'ready', 'unlocked')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, feature_key)
);

create index if not exists user_advanced_access_tenant_feature_status_idx
  on public.user_advanced_access (tenant_id, feature_key, access_status, updated_at desc);

create index if not exists user_advanced_access_user_feature_idx
  on public.user_advanced_access (user_id, feature_key, updated_at desc);

-- Compatibility alias for prompt terminology.
create or replace view public.trading_opt_in_status as
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
  uaa.metadata,
  uaa.created_at,
  uaa.updated_at
from public.user_advanced_access uaa
where uaa.feature_key = 'advanced_trading';

alter table public.capital_profiles enable row level security;
alter table public.capital_allocation_choices enable row level security;
alter table public.user_advanced_access enable row level security;

-- capital_profiles policies

drop policy if exists capital_profiles_select_scope on public.capital_profiles;
create policy capital_profiles_select_scope
on public.capital_profiles
for select
using (public.nexus_trading_can_access_tenant(tenant_id));

drop policy if exists capital_profiles_insert_scope on public.capital_profiles;
create policy capital_profiles_insert_scope
on public.capital_profiles
for insert
with check (
  auth.role() = 'authenticated'
  and auth.uid() = user_id
  and public.nexus_trading_can_access_tenant(tenant_id)
);

drop policy if exists capital_profiles_update_scope on public.capital_profiles;
create policy capital_profiles_update_scope
on public.capital_profiles
for update
using (
  auth.role() = 'authenticated'
  and public.nexus_trading_can_access_tenant(tenant_id)
)
with check (
  auth.role() = 'authenticated'
  and public.nexus_trading_can_access_tenant(tenant_id)
);

-- capital_allocation_choices policies

drop policy if exists capital_allocation_choices_select_scope on public.capital_allocation_choices;
create policy capital_allocation_choices_select_scope
on public.capital_allocation_choices
for select
using (public.nexus_trading_can_access_tenant(tenant_id));

drop policy if exists capital_allocation_choices_insert_scope on public.capital_allocation_choices;
create policy capital_allocation_choices_insert_scope
on public.capital_allocation_choices
for insert
with check (
  auth.role() = 'authenticated'
  and auth.uid() = user_id
  and public.nexus_trading_can_access_tenant(tenant_id)
);

drop policy if exists capital_allocation_choices_update_scope on public.capital_allocation_choices;
create policy capital_allocation_choices_update_scope
on public.capital_allocation_choices
for update
using (
  auth.role() = 'authenticated'
  and public.nexus_trading_can_access_tenant(tenant_id)
)
with check (
  auth.role() = 'authenticated'
  and public.nexus_trading_can_access_tenant(tenant_id)
);

-- user_advanced_access policies

drop policy if exists user_advanced_access_select_scope on public.user_advanced_access;
create policy user_advanced_access_select_scope
on public.user_advanced_access
for select
using (public.nexus_trading_can_access_tenant(tenant_id));

drop policy if exists user_advanced_access_insert_scope on public.user_advanced_access;
create policy user_advanced_access_insert_scope
on public.user_advanced_access
for insert
with check (
  auth.role() = 'authenticated'
  and auth.uid() = user_id
  and public.nexus_trading_can_access_tenant(tenant_id)
);

drop policy if exists user_advanced_access_update_scope on public.user_advanced_access;
create policy user_advanced_access_update_scope
on public.user_advanced_access
for update
using (
  auth.role() = 'authenticated'
  and public.nexus_trading_can_access_tenant(tenant_id)
)
with check (
  auth.role() = 'authenticated'
  and public.nexus_trading_can_access_tenant(tenant_id)
);

-- updated_at triggers

drop trigger if exists trg_capital_profiles_updated_at on public.capital_profiles;
create trigger trg_capital_profiles_updated_at
before update on public.capital_profiles
for each row execute function public.nexus_trading_touch_updated_at();

drop trigger if exists trg_capital_allocation_choices_updated_at on public.capital_allocation_choices;
create trigger trg_capital_allocation_choices_updated_at
before update on public.capital_allocation_choices
for each row execute function public.nexus_trading_touch_updated_at();

drop trigger if exists trg_user_advanced_access_updated_at on public.user_advanced_access;
create trigger trg_user_advanced_access_updated_at
before update on public.user_advanced_access
for each row execute function public.nexus_trading_touch_updated_at();

grant execute on function public.nexus_trading_can_access_tenant(uuid) to authenticated;
grant execute on function public.nexus_trading_can_manage_tenant(uuid) to authenticated;

commit;
