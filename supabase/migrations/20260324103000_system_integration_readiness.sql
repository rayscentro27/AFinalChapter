begin;

create extension if not exists pgcrypto;

create table if not exists public.system_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  integration_key text not null,
  display_name text not null,
  category text not null default 'operations',
  status text not null default 'missing'
    check (status in ('missing', 'configured', 'ready', 'degraded', 'blocked', 'optional')),
  verification_state text not null default 'pending'
    check (verification_state in ('pending', 'passed', 'failed', 'manual_review', 'not_applicable')),
  secret_handling text not null default 'descriptor_only'
    check (secret_handling in ('env_only', 'vault_reference', 'descriptor_only', 'hybrid')),
  required_pilot boolean not null default false,
  required_launch boolean not null default false,
  description text,
  instructions text,
  action_path text,
  masked_hint text,
  last_verified_at timestamptz,
  last_verification_summary text,
  last_verification_error text,
  last_signal_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, integration_key)
);

create index if not exists system_integrations_tenant_status_idx
  on public.system_integrations (tenant_id, status, updated_at desc);

create table if not exists public.system_integration_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  integration_key text not null,
  check_key text not null,
  label text not null,
  status text not null default 'pending'
    check (status in ('pending', 'passed', 'warn', 'failed', 'manual_review', 'not_applicable')),
  severity text not null default 'medium'
    check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  source text not null default 'system',
  summary text,
  details jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, integration_key, check_key)
);

create index if not exists system_integration_checks_tenant_status_idx
  on public.system_integration_checks (tenant_id, integration_key, status, updated_at desc);

create table if not exists public.system_integration_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  integration_key text not null,
  event_type text not null default 'status_changed'
    check (event_type in ('seeded', 'status_changed', 'verification_requested', 'verification_result', 'note')),
  status text,
  summary text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists system_integration_events_tenant_created_idx
  on public.system_integration_events (tenant_id, integration_key, created_at desc);

drop trigger if exists trg_system_integrations_set_updated_at on public.system_integrations;
create trigger trg_system_integrations_set_updated_at
before update on public.system_integrations
for each row execute function public.set_updated_at();

drop trigger if exists trg_system_integration_checks_set_updated_at on public.system_integration_checks;
create trigger trg_system_integration_checks_set_updated_at
before update on public.system_integration_checks
for each row execute function public.set_updated_at();

alter table public.system_integrations enable row level security;
alter table public.system_integration_checks enable row level security;
alter table public.system_integration_events enable row level security;

drop policy if exists system_integrations_admin_select on public.system_integrations;
create policy system_integrations_admin_select on public.system_integrations
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists system_integrations_admin_write on public.system_integrations;
create policy system_integrations_admin_write on public.system_integrations
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists system_integration_checks_admin_select on public.system_integration_checks;
create policy system_integration_checks_admin_select on public.system_integration_checks
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists system_integration_checks_admin_write on public.system_integration_checks;
create policy system_integration_checks_admin_write on public.system_integration_checks
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists system_integration_events_admin_select on public.system_integration_events;
create policy system_integration_events_admin_select on public.system_integration_events
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists system_integration_events_admin_write on public.system_integration_events;
create policy system_integration_events_admin_write on public.system_integration_events
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

insert into public.system_integrations (
  tenant_id,
  integration_key,
  display_name,
  category,
  status,
  verification_state,
  secret_handling,
  required_pilot,
  required_launch,
  description,
  instructions,
  action_path
)
select
  t.id,
  seed.integration_key,
  seed.display_name,
  seed.category,
  seed.status,
  seed.verification_state,
  seed.secret_handling,
  seed.required_pilot,
  seed.required_launch,
  seed.description,
  seed.instructions,
  seed.action_path
from public.tenants t
cross join (
  values
    ('supabase', 'Supabase', 'foundation', 'missing', 'pending', 'env_only', true, true, 'Core database, auth, and admin access state.', 'Confirm project URL and service-role readiness without exposing raw secrets.', '/admin/control-plane'),
    ('oracle_api', 'Oracle API', 'foundation', 'missing', 'pending', 'env_only', true, true, 'Internal API/gateway runtime backing admin operations.', 'Confirm internal API key presence and route health.', '/admin/control-plane'),
    ('telegram_bot', 'Telegram Bot', 'communications', 'missing', 'pending', 'env_only', false, true, 'Inbound Telegram command and operator messaging readiness.', 'Confirm token, routing, and live bot verification.', '/admin/nexus-one'),
    ('google_ai_gemini', 'Google AI Gemini', 'providers', 'missing', 'pending', 'env_only', true, true, 'Primary AI provider readiness for admin and agent workflows.', 'Confirm Gemini API key presence and live API verification.', '/admin/control-plane'),
    ('portal_api_key', 'Portal API Key', 'foundation', 'missing', 'pending', 'env_only', true, true, 'Internal portal-to-gateway secret alignment.', 'Confirm the internal API key path is configured without revealing the value.', '/admin/control-plane'),
    ('nexus_one', 'Nexus One', 'readiness', 'missing', 'pending', 'descriptor_only', true, true, 'Executive readiness layer and activation control surface.', 'Confirm activation tables and executive briefings are visible.', '/admin/nexus-one'),
    ('command_center', 'Command Center', 'operations', 'missing', 'pending', 'descriptor_only', true, true, 'Admin command lifecycle, queue, and event visibility.', 'Confirm admin command tables and queue linkage are healthy.', '/admin/ai-command-center'),
    ('review_control_plane', 'Review Control Plane', 'operations', 'missing', 'pending', 'descriptor_only', true, true, 'Research/review approval and policy-backed governance surfaces.', 'Confirm approval queue and tenant policy visibility are healthy.', '/admin/research-approvals'),
    ('worker_connectivity', 'Worker Connectivity', 'operations', 'missing', 'pending', 'descriptor_only', true, true, 'Mac Mini worker freshness and queue readiness.', 'Confirm fresh worker heartbeats and admin-command queue support.', '/admin/control-plane')
) as seed(
  integration_key,
  display_name,
  category,
  status,
  verification_state,
  secret_handling,
  required_pilot,
  required_launch,
  description,
  instructions,
  action_path
)
on conflict (tenant_id, integration_key) do nothing;

commit;