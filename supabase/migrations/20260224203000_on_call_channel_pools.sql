-- On-call staffing and channel-aware escalation pools for SLA automation.

create table if not exists public.tenant_on_call (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  is_on_call boolean not null default true,
  channel text not null default 'all',
  starts_at timestamptz,
  ends_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_on_call_channel_check
    check (lower(channel) in ('all', 'twilio', 'whatsapp', 'meta', 'matrix', 'google_voice'))
);

create unique index if not exists tenant_on_call_tenant_user_channel_uidx
  on public.tenant_on_call (tenant_id, user_id, channel);

create index if not exists tenant_on_call_tenant_idx
  on public.tenant_on_call (tenant_id, is_on_call);

create table if not exists public.tenant_channel_pools (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  user_id uuid not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_channel_pools_provider_check
    check (lower(provider) in ('twilio', 'whatsapp', 'meta', 'matrix', 'google_voice'))
);

create unique index if not exists tenant_channel_pools_tenant_provider_user_uidx
  on public.tenant_channel_pools (tenant_id, provider, user_id);

create index if not exists tenant_channel_pools_tenant_provider_idx
  on public.tenant_channel_pools (tenant_id, provider, enabled);

alter table public.tenant_on_call enable row level security;
alter table public.tenant_channel_pools enable row level security;

drop policy if exists tenant_on_call_select on public.tenant_on_call;
create policy tenant_on_call_select on public.tenant_on_call
for select
using (public.is_tenant_member(tenant_id));

drop policy if exists tenant_on_call_insert on public.tenant_on_call;
create policy tenant_on_call_insert on public.tenant_on_call
for insert
with check (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = tenant_on_call.tenant_id
      and tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) in ('owner', 'admin')
  )
);

drop policy if exists tenant_on_call_update on public.tenant_on_call;
create policy tenant_on_call_update on public.tenant_on_call
for update
using (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = tenant_on_call.tenant_id
      and tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) in ('owner', 'admin')
  )
)
with check (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = tenant_on_call.tenant_id
      and tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) in ('owner', 'admin')
  )
);

drop policy if exists tenant_on_call_delete on public.tenant_on_call;
create policy tenant_on_call_delete on public.tenant_on_call
for delete
using (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = tenant_on_call.tenant_id
      and tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) in ('owner', 'admin')
  )
);

drop policy if exists tenant_channel_pools_select on public.tenant_channel_pools;
create policy tenant_channel_pools_select on public.tenant_channel_pools
for select
using (public.is_tenant_member(tenant_id));

drop policy if exists tenant_channel_pools_insert on public.tenant_channel_pools;
create policy tenant_channel_pools_insert on public.tenant_channel_pools
for insert
with check (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = tenant_channel_pools.tenant_id
      and tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) in ('owner', 'admin')
  )
);

drop policy if exists tenant_channel_pools_update on public.tenant_channel_pools;
create policy tenant_channel_pools_update on public.tenant_channel_pools
for update
using (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = tenant_channel_pools.tenant_id
      and tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) in ('owner', 'admin')
  )
)
with check (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = tenant_channel_pools.tenant_id
      and tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) in ('owner', 'admin')
  )
);

drop policy if exists tenant_channel_pools_delete on public.tenant_channel_pools;
create policy tenant_channel_pools_delete on public.tenant_channel_pools
for delete
using (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = tenant_channel_pools.tenant_id
      and tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) in ('owner', 'admin')
  )
);

drop trigger if exists trg_tenant_on_call_updated_at on public.tenant_on_call;
create trigger trg_tenant_on_call_updated_at
before update on public.tenant_on_call
for each row execute function public.set_updated_at();

drop trigger if exists trg_tenant_channel_pools_updated_at on public.tenant_channel_pools;
create trigger trg_tenant_channel_pools_updated_at
before update on public.tenant_channel_pools
for each row execute function public.set_updated_at();
