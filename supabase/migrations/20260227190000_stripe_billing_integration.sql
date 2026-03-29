-- Prompt 8: Stripe subscriptions integration
-- Adds customer mapping, webhook idempotency fields, and invoice receipt fields.

create extension if not exists pgcrypto;
create table if not exists public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid null,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists stripe_customers_user_uidx
  on public.stripe_customers (user_id);
create index if not exists stripe_customers_tenant_idx
  on public.stripe_customers (tenant_id, created_at desc);
alter table public.subscription_events
  add column if not exists provider text not null default 'manual' check (provider in ('manual', 'stripe'));
alter table public.subscription_events
  add column if not exists provider_event_id text;
create unique index if not exists subscription_events_provider_event_uidx
  on public.subscription_events (provider, provider_event_id)
  where provider_event_id is not null;
alter table public.subscriptions
  add column if not exists last_invoice_status text;
alter table public.subscriptions
  add column if not exists last_invoice_hosted_url text;
alter table public.subscriptions
  add column if not exists last_invoice_pdf_url text;
create or replace function public.nexus_stripe_customers_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
drop trigger if exists trg_stripe_customers_set_updated_at on public.stripe_customers;
create trigger trg_stripe_customers_set_updated_at
before update on public.stripe_customers
for each row execute procedure public.nexus_stripe_customers_set_updated_at();
alter table public.stripe_customers enable row level security;
drop policy if exists stripe_customers_select_own_or_admin on public.stripe_customers;
create policy stripe_customers_select_own_or_admin
on public.stripe_customers
for select to authenticated
using (public.nexus_can_manage_subscription(user_id));
drop policy if exists stripe_customers_insert_own_or_admin on public.stripe_customers;
create policy stripe_customers_insert_own_or_admin
on public.stripe_customers
for insert to authenticated
with check (public.nexus_can_manage_subscription(user_id));
drop policy if exists stripe_customers_update_own_or_admin on public.stripe_customers;
create policy stripe_customers_update_own_or_admin
on public.stripe_customers
for update to authenticated
using (public.nexus_can_manage_subscription(user_id))
with check (public.nexus_can_manage_subscription(user_id));
