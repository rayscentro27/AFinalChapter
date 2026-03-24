begin;

create extension if not exists pgcrypto;

create table if not exists public.setup_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  domain_key text not null,
  display_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'ready', 'warn', 'blocked', 'optional')),
  severity text not null default 'medium'
    check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  blocking_level text not null default 'blocking'
    check (blocking_level in ('blocking', 'warning', 'optional')),
  missing_items jsonb not null default '[]'::jsonb,
  notes text,
  guidance text,
  owner text,
  action_path text,
  last_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, domain_key)
);

create index if not exists setup_domains_status_idx
  on public.setup_domains (tenant_id, status, severity, updated_at desc);

create table if not exists public.setup_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  domain_key text not null,
  credential_key text not null,
  label text not null,
  status text not null default 'missing'
    check (status in ('missing', 'configured', 'needs_review', 'optional', 'unknown')),
  connection_state text not null default 'unknown'
    check (connection_state in ('unknown', 'disconnected', 'connected', 'degraded', 'manual_check')),
  is_sensitive boolean not null default true,
  masked_value text,
  notes text,
  instructions text,
  action_path text,
  last_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, domain_key, credential_key)
);

create index if not exists setup_credentials_status_idx
  on public.setup_credentials (tenant_id, domain_key, status, updated_at desc);

create table if not exists public.activation_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  domain_key text not null,
  step_key text not null,
  label text not null,
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'blocked', 'waived')),
  required boolean not null default true,
  sort_order integer not null default 100,
  owner text,
  action_path text,
  notes text,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, step_key)
);

create index if not exists activation_steps_status_idx
  on public.activation_steps (tenant_id, status, required, sort_order asc, updated_at desc);

create table if not exists public.environment_readiness (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  readiness_key text not null,
  label text not null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'ready', 'warn', 'blocked', 'optional')),
  severity text not null default 'medium'
    check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  blocking_items jsonb not null default '[]'::jsonb,
  warning_items jsonb not null default '[]'::jsonb,
  recommended_order jsonb not null default '[]'::jsonb,
  notes text,
  last_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, readiness_key)
);

create index if not exists environment_readiness_status_idx
  on public.environment_readiness (tenant_id, status, severity, updated_at desc);

create or replace view public.setup_status as
select
  d.tenant_id,
  d.domain_key,
  d.display_name,
  d.status,
  d.severity,
  d.blocking_level,
  d.missing_items,
  d.last_checked_at,
  coalesce(c.credentials_total, 0) as credentials_total,
  coalesce(c.credentials_configured, 0) as credentials_configured,
  coalesce(s.steps_total, 0) as steps_total,
  coalesce(s.steps_completed, 0) as steps_completed
from public.setup_domains d
left join (
  select
    tenant_id,
    domain_key,
    count(*) as credentials_total,
    count(*) filter (where status = 'configured') as credentials_configured
  from public.setup_credentials
  group by tenant_id, domain_key
) c
  on c.tenant_id = d.tenant_id
 and c.domain_key = d.domain_key
left join (
  select
    tenant_id,
    domain_key,
    count(*) as steps_total,
    count(*) filter (where status = 'completed') as steps_completed
  from public.activation_steps
  group by tenant_id, domain_key
) s
  on s.tenant_id = d.tenant_id
 and s.domain_key = d.domain_key;

drop trigger if exists trg_setup_domains_set_updated_at on public.setup_domains;
create trigger trg_setup_domains_set_updated_at
before update on public.setup_domains
for each row execute function public.set_updated_at();

drop trigger if exists trg_setup_credentials_set_updated_at on public.setup_credentials;
create trigger trg_setup_credentials_set_updated_at
before update on public.setup_credentials
for each row execute function public.set_updated_at();

drop trigger if exists trg_activation_steps_set_updated_at on public.activation_steps;
create trigger trg_activation_steps_set_updated_at
before update on public.activation_steps
for each row execute function public.set_updated_at();

drop trigger if exists trg_environment_readiness_set_updated_at on public.environment_readiness;
create trigger trg_environment_readiness_set_updated_at
before update on public.environment_readiness
for each row execute function public.set_updated_at();

alter table public.setup_domains enable row level security;
alter table public.setup_credentials enable row level security;
alter table public.activation_steps enable row level security;
alter table public.environment_readiness enable row level security;

drop policy if exists setup_domains_admin_select on public.setup_domains;
create policy setup_domains_admin_select on public.setup_domains
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists setup_domains_admin_write on public.setup_domains;
create policy setup_domains_admin_write on public.setup_domains
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists setup_credentials_admin_select on public.setup_credentials;
create policy setup_credentials_admin_select on public.setup_credentials
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists setup_credentials_admin_write on public.setup_credentials;
create policy setup_credentials_admin_write on public.setup_credentials
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists activation_steps_admin_select on public.activation_steps;
create policy activation_steps_admin_select on public.activation_steps
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists activation_steps_admin_write on public.activation_steps;
create policy activation_steps_admin_write on public.activation_steps
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists environment_readiness_admin_select on public.environment_readiness;
create policy environment_readiness_admin_select on public.environment_readiness
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists environment_readiness_admin_write on public.environment_readiness;
create policy environment_readiness_admin_write on public.environment_readiness
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

commit;