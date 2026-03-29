-- Stripe subscription runtime alignment
-- Adds Stripe-native plan table and compatibility columns while preserving existing plan_code/provider fields.

create extension if not exists pgcrypto;
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  stripe_price_id text unique,
  tier text not null check (tier in ('free', 'growth', 'premium')),
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists subscription_plans_tier_uidx
  on public.subscription_plans (tier);
insert into public.subscription_plans (tier, stripe_price_id, monthly_price_cents, is_active)
values
  ('free', null, 0, true),
  ('growth', null, 5000, true),
  ('premium', null, 10000, true)
on conflict (tier) do update
set monthly_price_cents = excluded.monthly_price_cents,
    is_active = excluded.is_active;
do $do$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'subscription_status'
  ) and not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'subscription_status'
      and e.enumlabel = 'incomplete'
  ) then
    alter type public.subscription_status add value 'incomplete';
  end if;
end $do$;
alter table public.subscriptions
  add column if not exists tier text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists cancel_at_period_end boolean not null default false;
do $do$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_tier_check'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_tier_check
      check (tier in ('free', 'growth', 'premium'));
  end if;
end $do$;
update public.subscriptions
set
  tier = coalesce(tier, lower(plan_code)),
  stripe_customer_id = coalesce(stripe_customer_id, provider_customer_id),
  stripe_subscription_id = coalesce(stripe_subscription_id, provider_subscription_id);
create unique index if not exists subscriptions_stripe_subscription_uidx
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;
create index if not exists subscriptions_tenant_tier_status_idx
  on public.subscriptions (tenant_id, tier, status, updated_at desc);
create or replace function public.nexus_sync_subscription_compat_columns()
returns trigger
language plpgsql
as $fn$
begin
  if new.tier is null and new.plan_code is not null then
    new.tier := lower(new.plan_code);
  end if;

  if new.plan_code is null and new.tier is not null then
    new.plan_code := upper(new.tier);
  end if;

  if new.stripe_customer_id is null and new.provider_customer_id is not null then
    new.stripe_customer_id := new.provider_customer_id;
  end if;

  if new.provider_customer_id is null and new.stripe_customer_id is not null then
    new.provider_customer_id := new.stripe_customer_id;
  end if;

  if new.stripe_subscription_id is null and new.provider_subscription_id is not null then
    new.stripe_subscription_id := new.provider_subscription_id;
  end if;

  if new.provider_subscription_id is null and new.stripe_subscription_id is not null then
    new.provider_subscription_id := new.stripe_subscription_id;
  end if;

  if new.tier is null then
    new.tier := 'free';
  end if;

  return new;
end;
$fn$;
drop trigger if exists trg_subscriptions_sync_compat on public.subscriptions;
create trigger trg_subscriptions_sync_compat
before insert or update on public.subscriptions
for each row execute procedure public.nexus_sync_subscription_compat_columns();
create or replace function public.nexus_can_manage_subscription_scope(
  p_user_id uuid,
  p_tenant_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  can_manage boolean := false;
begin
  if auth.uid() = p_user_id then
    return true;
  end if;

  if public.nexus_is_master_admin_compat() then
    return true;
  end if;

  if p_tenant_id is null then
    return false;
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
          and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'super_admin')
      )
    $sql$ into can_manage using p_tenant_id;

    if coalesce(can_manage, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
          and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'super_admin')
      )
    $sql$ into can_manage using p_tenant_id;

    if coalesce(can_manage, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;
grant execute on function public.nexus_can_manage_subscription_scope(uuid, uuid) to authenticated;
alter table public.subscription_plans enable row level security;
drop policy if exists subscription_plans_select_all on public.subscription_plans;
create policy subscription_plans_select_all
on public.subscription_plans
for select to authenticated
using (true);
drop policy if exists subscription_plans_admin_write on public.subscription_plans;
create policy subscription_plans_admin_write
on public.subscription_plans
for all to authenticated
using (public.nexus_is_master_admin_compat())
with check (public.nexus_is_master_admin_compat());
drop policy if exists subscriptions_select_own_or_admin on public.subscriptions;
create policy subscriptions_select_own_or_admin
on public.subscriptions
for select to authenticated
using (public.nexus_can_manage_subscription_scope(user_id, tenant_id));
drop policy if exists subscriptions_insert_own_or_admin on public.subscriptions;
create policy subscriptions_insert_own_or_admin
on public.subscriptions
for insert to authenticated
with check (public.nexus_can_manage_subscription_scope(user_id, tenant_id));
drop policy if exists subscriptions_update_own_or_admin on public.subscriptions;
create policy subscriptions_update_own_or_admin
on public.subscriptions
for update to authenticated
using (public.nexus_can_manage_subscription_scope(user_id, tenant_id))
with check (public.nexus_can_manage_subscription_scope(user_id, tenant_id));
drop policy if exists subscription_events_select_own_or_admin on public.subscription_events;
create policy subscription_events_select_own_or_admin
on public.subscription_events
for select to authenticated
using (
  exists (
    select 1
    from public.subscriptions s
    where s.id = subscription_events.subscription_id
      and public.nexus_can_manage_subscription_scope(s.user_id, s.tenant_id)
  )
);
drop policy if exists subscription_events_insert_own_or_admin on public.subscription_events;
create policy subscription_events_insert_own_or_admin
on public.subscription_events
for insert to authenticated
with check (
  exists (
    select 1
    from public.subscriptions s
    where s.id = subscription_events.subscription_id
      and public.nexus_can_manage_subscription_scope(s.user_id, s.tenant_id)
  )
);
