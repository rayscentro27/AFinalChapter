-- Membership + payments contract framework (Prompt 2)
-- Adds plan, subscription, event, and commission disclosure records.

create extension if not exists pgcrypto;

-- Compatibility helper (safe re-definition across environments).
create or replace function public.nexus_is_master_admin_compat()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  is_admin boolean := false;
begin
  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and tm.role = 'admin'
      )
    $sql$ into is_admin;
    return coalesce(is_admin, false);
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.role = 'admin'
      )
    $sql$ into is_admin;
    return coalesce(is_admin, false);
  end if;

  return coalesce((auth.jwt() ->> 'role') = 'admin', false);
end;
$fn$;

grant execute on function public.nexus_is_master_admin_compat() to authenticated;

create or replace function public.nexus_can_manage_subscription(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select auth.uid() = p_user_id or public.nexus_is_master_admin_compat();
$fn$;

grant execute on function public.nexus_can_manage_subscription(uuid) to authenticated;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'subscription_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.subscription_status AS ENUM ('active', 'trialing', 'past_due', 'canceled');
  END IF;
END $do$;

create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('FREE', 'GROWTH', 'PREMIUM')),
  price_cents integer not null check (price_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid null,
  plan_code text not null references public.membership_plans(code),
  status public.subscription_status not null default 'active',
  provider text not null default 'manual' check (provider in ('stripe', 'manual')),
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_user_tenant_uidx
  on public.subscriptions (user_id, tenant_id);

create index if not exists subscriptions_tenant_status_idx
  on public.subscriptions (tenant_id, status, plan_code);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists subscription_events_sub_created_idx
  on public.subscription_events (subscription_id, created_at desc);

create table if not exists public.commission_disclosures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid null,
  version text not null,
  accepted_at timestamptz not null default now(),
  ip_hash text,
  user_agent text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists commission_disclosures_user_idx
  on public.commission_disclosures (user_id, accepted_at desc);

create unique index if not exists commission_disclosures_user_version_uidx
  on public.commission_disclosures (user_id, version);

create or replace function public.nexus_subscriptions_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_subscriptions_set_updated_at on public.subscriptions;
create trigger trg_subscriptions_set_updated_at
before update on public.subscriptions
for each row execute procedure public.nexus_subscriptions_set_updated_at();

insert into public.membership_plans (code, price_cents, is_active)
values
  ('FREE', 0, true),
  ('GROWTH', 5000, true),
  ('PREMIUM', 10000, true)
on conflict (code) do update
set price_cents = excluded.price_cents,
    is_active = excluded.is_active,
    updated_at = now();

alter table public.membership_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.commission_disclosures enable row level security;

-- membership_plans
DROP POLICY IF EXISTS membership_plans_select_all ON public.membership_plans;
create policy membership_plans_select_all
on public.membership_plans
for select to authenticated
using (true);

DROP POLICY IF EXISTS membership_plans_admin_write ON public.membership_plans;
create policy membership_plans_admin_write
on public.membership_plans
for all to authenticated
using (public.nexus_is_master_admin_compat())
with check (public.nexus_is_master_admin_compat());

-- subscriptions
DROP POLICY IF EXISTS subscriptions_select_own_or_admin ON public.subscriptions;
create policy subscriptions_select_own_or_admin
on public.subscriptions
for select to authenticated
using (public.nexus_can_manage_subscription(user_id));

DROP POLICY IF EXISTS subscriptions_insert_own_or_admin ON public.subscriptions;
create policy subscriptions_insert_own_or_admin
on public.subscriptions
for insert to authenticated
with check (public.nexus_can_manage_subscription(user_id));

DROP POLICY IF EXISTS subscriptions_update_own_or_admin ON public.subscriptions;
create policy subscriptions_update_own_or_admin
on public.subscriptions
for update to authenticated
using (public.nexus_can_manage_subscription(user_id))
with check (public.nexus_can_manage_subscription(user_id));

-- subscription_events
DROP POLICY IF EXISTS subscription_events_select_own_or_admin ON public.subscription_events;
create policy subscription_events_select_own_or_admin
on public.subscription_events
for select to authenticated
using (
  exists (
    select 1
    from public.subscriptions s
    where s.id = subscription_id
      and public.nexus_can_manage_subscription(s.user_id)
  )
);

DROP POLICY IF EXISTS subscription_events_insert_own_or_admin ON public.subscription_events;
create policy subscription_events_insert_own_or_admin
on public.subscription_events
for insert to authenticated
with check (
  exists (
    select 1
    from public.subscriptions s
    where s.id = subscription_id
      and public.nexus_can_manage_subscription(s.user_id)
  )
);

-- commission_disclosures
DROP POLICY IF EXISTS commission_disclosures_select_own_or_admin ON public.commission_disclosures;
create policy commission_disclosures_select_own_or_admin
on public.commission_disclosures
for select to authenticated
using (public.nexus_can_manage_subscription(user_id));

DROP POLICY IF EXISTS commission_disclosures_insert_own_or_admin ON public.commission_disclosures;
create policy commission_disclosures_insert_own_or_admin
on public.commission_disclosures
for insert to authenticated
with check (public.nexus_can_manage_subscription(user_id));
