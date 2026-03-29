create extension if not exists pgcrypto;
create table if not exists public.tenant_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  provider text not null check (provider in ('facebook', 'whatsapp', 'mailerlite', 'stripe')),
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error')),

  credentials jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  connected_at timestamptz,
  last_tested_at timestamptz,
  last_test_result jsonb,
  last_error text,

  created_by_user_id uuid,
  updated_by_user_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id, provider)
);
create index if not exists tenant_integrations_tenant_provider_idx
on public.tenant_integrations (tenant_id, provider);
create index if not exists tenant_integrations_tenant_status_idx
on public.tenant_integrations (tenant_id, status);
alter table public.tenant_integrations enable row level security;
drop policy if exists tenant_integrations_select on public.tenant_integrations;
create policy tenant_integrations_select on public.tenant_integrations
for select
using (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = tenant_integrations.tenant_id
      and tm.user_id = auth.uid()
      and tm.role in ('admin', 'supervisor', 'sales')
  )
);
drop policy if exists tenant_integrations_insert on public.tenant_integrations;
create policy tenant_integrations_insert on public.tenant_integrations
for insert
with check (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = tenant_integrations.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'supervisor', 'sales')
    )
  )
);
drop policy if exists tenant_integrations_update on public.tenant_integrations;
create policy tenant_integrations_update on public.tenant_integrations
for update
using (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = tenant_integrations.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'supervisor', 'sales')
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
      where tm.tenant_id = tenant_integrations.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'supervisor', 'sales')
    )
  )
);
drop policy if exists tenant_integrations_delete on public.tenant_integrations;
create policy tenant_integrations_delete on public.tenant_integrations
for delete
using (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = tenant_integrations.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'supervisor', 'sales')
    )
  )
);
create or replace function public.tenant_integrations_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_tenant_integrations_updated_at on public.tenant_integrations;
create trigger trg_tenant_integrations_updated_at
before update on public.tenant_integrations
for each row execute function public.tenant_integrations_touch_updated_at();
