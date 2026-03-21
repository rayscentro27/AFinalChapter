create extension if not exists pgcrypto;
create table if not exists public.channel_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('twilio', 'meta', 'whatsapp')),
  external_account_id text not null,
  label text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_account_id)
);
create index if not exists channel_accounts_tenant_provider_idx
on public.channel_accounts (tenant_id, provider, is_active);
create table if not exists public.provider_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  provider text not null check (provider in ('twilio', 'meta', 'whatsapp')),
  provider_event_id text not null,
  channel_external_id text,
  event_type text not null,
  payload jsonb not null,
  normalized jsonb not null default '{}'::jsonb,
  signature_valid boolean not null default false,
  source_ip inet,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);
create index if not exists provider_events_tenant_received_idx
on public.provider_events (tenant_id, received_at desc);
create index if not exists provider_events_provider_channel_idx
on public.provider_events (provider, channel_external_id, received_at desc);
create index if not exists provider_events_unresolved_idx
on public.provider_events (received_at desc)
where tenant_id is null;
create or replace function public.channel_accounts_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_channel_accounts_updated_at on public.channel_accounts;
create trigger trg_channel_accounts_updated_at
before update on public.channel_accounts
for each row execute function public.channel_accounts_touch_updated_at();
alter table public.channel_accounts enable row level security;
alter table public.provider_events enable row level security;
drop policy if exists channel_accounts_select on public.channel_accounts;
create policy channel_accounts_select on public.channel_accounts
for select
using (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = channel_accounts.tenant_id
      and tm.user_id = auth.uid()
      and tm.role in ('admin', 'supervisor', 'sales')
  )
);
drop policy if exists channel_accounts_insert on public.channel_accounts;
create policy channel_accounts_insert on public.channel_accounts
for insert
with check (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = channel_accounts.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'supervisor')
    )
  )
);
drop policy if exists channel_accounts_update on public.channel_accounts;
create policy channel_accounts_update on public.channel_accounts
for update
using (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = channel_accounts.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'supervisor')
    )
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = channel_accounts.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'supervisor')
    )
  )
);
drop policy if exists channel_accounts_delete on public.channel_accounts;
create policy channel_accounts_delete on public.channel_accounts
for delete
using (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = channel_accounts.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'supervisor')
    )
  )
);
drop policy if exists provider_events_select on public.provider_events;
create policy provider_events_select on public.provider_events
for select
using (
  public.nexus_is_master_admin()
  or (
    provider_events.tenant_id is not null
    and exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = provider_events.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'supervisor', 'sales')
    )
  )
);
drop policy if exists provider_events_update on public.provider_events;
create policy provider_events_update on public.provider_events
for update
using (
  public.nexus_is_master_admin()
  or (
    provider_events.tenant_id is not null
    and exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = provider_events.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'supervisor')
    )
  )
)
with check (
  public.nexus_is_master_admin()
  or (
    provider_events.tenant_id is not null
    and exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = provider_events.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'supervisor')
    )
  )
);
