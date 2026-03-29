begin;

create extension if not exists pgcrypto;

create table if not exists public.operational_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_type text not null,
  scope_key text not null default 'global',
  tenant_id uuid null references public.tenants(id) on delete cascade,
  window_hours integer not null check (window_hours > 0),
  bucket_start_at timestamptz not null,
  summary_json jsonb not null default '{}'::jsonb,
  metrics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (snapshot_type, scope_key, window_hours, bucket_start_at)
);

alter table public.operational_snapshots
  add column if not exists snapshot_type text,
  add column if not exists scope_key text default 'global',
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists window_hours integer,
  add column if not exists bucket_start_at timestamptz,
  add column if not exists summary_json jsonb default '{}'::jsonb,
  add column if not exists metrics_json jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.operational_snapshots alter column scope_key set default 'global';
alter table public.operational_snapshots alter column summary_json set default '{}'::jsonb;
alter table public.operational_snapshots alter column metrics_json set default '{}'::jsonb;
alter table public.operational_snapshots alter column created_at set default now();
alter table public.operational_snapshots alter column updated_at set default now();

update public.operational_snapshots
set scope_key = coalesce(nullif(scope_key, ''), 'global'),
    summary_json = coalesce(summary_json, '{}'::jsonb),
    metrics_json = coalesce(metrics_json, '{}'::jsonb),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, created_at, now())
where scope_key is null
   or scope_key = ''
   or summary_json is null
   or metrics_json is null
   or created_at is null
   or updated_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'operational_snapshots_type_check'
      and conrelid = 'public.operational_snapshots'::regclass
  ) then
    alter table public.operational_snapshots
      add constraint operational_snapshots_type_check
      check (snapshot_type in ('command_center', 'deal_escalations'));
  end if;
end
$$;

create index if not exists operational_snapshots_type_scope_idx
  on public.operational_snapshots (snapshot_type, scope_key, bucket_start_at desc);

create index if not exists operational_snapshots_tenant_idx
  on public.operational_snapshots (tenant_id, bucket_start_at desc);

create index if not exists operational_snapshots_window_idx
  on public.operational_snapshots (window_hours, bucket_start_at desc);

create or replace function public.nexus_operational_snapshots_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_operational_snapshots_set_updated_at on public.operational_snapshots;
create trigger trg_operational_snapshots_set_updated_at
before update on public.operational_snapshots
for each row execute procedure public.nexus_operational_snapshots_set_updated_at();

alter table public.operational_snapshots enable row level security;

drop policy if exists operational_snapshots_select_admin on public.operational_snapshots;
create policy operational_snapshots_select_admin
on public.operational_snapshots
for select
to authenticated
using (public.nexus_is_master_admin());

commit;