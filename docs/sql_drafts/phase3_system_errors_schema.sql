-- PHASE 3 DRAFT ONLY (do not apply without explicit approval)
-- Purpose: unified operational error tracking for gateway + workers.

begin;

create table if not exists public.system_errors (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  component text not null,
  error_type text not null,
  error_message text not null,
  error_stack text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Compatibility for environments that already created a legacy shape.
alter table public.system_errors add column if not exists service text;
alter table public.system_errors add column if not exists component text;
alter table public.system_errors add column if not exists error_type text;
alter table public.system_errors add column if not exists error_message text;
alter table public.system_errors add column if not exists error_stack text;
alter table public.system_errors add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Optional backfill from legacy columns when present.
update public.system_errors
set
  service = coalesce(nullif(service, ''), split_part(coalesce(source, ''), ':', 1), 'nexus-gateway'),
  component = coalesce(nullif(component, ''), split_part(coalesce(source, ''), ':', 2), 'unknown_component'),
  error_type = coalesce(nullif(error_type, ''), nullif(error_code, ''), nullif(severity, ''), 'error'),
  error_message = coalesce(nullif(error_message, ''), nullif(message, ''), 'unknown_error'),
  metadata = coalesce(metadata, details, '{}'::jsonb)
where
  service is null
  or component is null
  or error_type is null
  or error_message is null
  or metadata is null;

create index if not exists system_errors_created_at_idx
  on public.system_errors (created_at desc);

create index if not exists system_errors_service_component_created_idx
  on public.system_errors (service, component, created_at desc);

create index if not exists system_errors_error_type_created_idx
  on public.system_errors (error_type, created_at desc);

create index if not exists system_errors_job_type_created_idx
  on public.system_errors ((metadata->>'job_type'), created_at desc);

commit;
