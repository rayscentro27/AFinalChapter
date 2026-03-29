-- Phase 6: worker heartbeats + legacy-compatible system errors

begin;
create table if not exists public.worker_heartbeats (
  worker_id text primary key,
  worker_type text not null,
  status text not null default 'running'
    check (status in ('starting','running','degraded','paused','stopped')),
  system_mode text not null default 'development'
    check (system_mode in ('development','research','production','maintenance')),
  current_job_id uuid null,
  last_heartbeat_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  -- Compatibility helpers for existing gateway scaffold code.
  tenant_scope text null,
  queue_scope jsonb not null default '[]'::jsonb,
  in_flight_jobs integer not null default 0,
  max_concurrency integer not null default 1,
  host text null,
  pid integer null,
  last_seen_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists worker_heartbeats_last_heartbeat_idx
  on public.worker_heartbeats (last_heartbeat_at desc);
create index if not exists worker_heartbeats_mode_status_idx
  on public.worker_heartbeats (system_mode, status, last_heartbeat_at desc);
create index if not exists worker_heartbeats_last_seen_idx
  on public.worker_heartbeats (last_seen_at desc);
create table if not exists public.system_errors (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  worker_id text null,
  tenant_id uuid null,
  severity text not null default 'error' check (severity in ('warn','error','critical')),
  error_code text null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists system_errors_created_at_idx
  on public.system_errors (created_at desc);
create index if not exists system_errors_source_severity_idx
  on public.system_errors (source, severity, created_at desc);
create index if not exists system_errors_tenant_created_idx
  on public.system_errors (tenant_id, created_at desc);
commit;
