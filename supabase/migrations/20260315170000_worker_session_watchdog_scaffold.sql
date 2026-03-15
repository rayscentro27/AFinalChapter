-- Phase 8 (Watchdog v1): worker browser/session monitoring tables
-- Additive scaffold only; no automatic worker restarts.

begin;

create table if not exists public.worker_sessions (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null,
  worker_type text not null,
  host_name text null,
  session_state text not null default 'healthy'
    check (session_state in ('healthy', 'degraded', 'login_required', 'browser_crashed', 'rate_limited', 'stuck', 'restarting', 'paused', 'quarantined')),
  browser_state text not null default 'unknown',
  process_state text not null default 'unknown',
  last_heartbeat_at timestamptz null,
  last_success_at timestamptz null,
  last_error_at timestamptz null,
  current_job_id text null,
  current_job_started_at timestamptz null,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  recovery_attempt_count integer not null default 0 check (recovery_attempt_count >= 0),
  last_page_signature text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists worker_sessions_worker_id_uniq
  on public.worker_sessions (worker_id);

create index if not exists worker_sessions_state_updated_idx
  on public.worker_sessions (session_state, updated_at desc);

create index if not exists worker_sessions_worker_type_updated_idx
  on public.worker_sessions (worker_type, updated_at desc);

create table if not exists public.worker_session_events (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null,
  worker_type text null,
  event_type text not null,
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'critical')),
  details jsonb not null default '{}'::jsonb,
  trace_id text null,
  created_at timestamptz not null default now()
);

create index if not exists worker_session_events_worker_created_idx
  on public.worker_session_events (worker_id, created_at desc);

create index if not exists worker_session_events_severity_created_idx
  on public.worker_session_events (severity, created_at desc);

create index if not exists worker_session_events_type_created_idx
  on public.worker_session_events (event_type, created_at desc);

create table if not exists public.worker_recovery_policies (
  id uuid primary key default gen_random_uuid(),
  worker_type text not null,
  max_consecutive_failures integer not null default 3 check (max_consecutive_failures >= 1),
  max_job_minutes integer not null default 20 check (max_job_minutes >= 1),
  max_recovery_attempts integer not null default 2 check (max_recovery_attempts >= 0),
  auto_restart_enabled boolean not null default false,
  quarantine_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists worker_recovery_policies_worker_type_uniq
  on public.worker_recovery_policies (worker_type);

drop trigger if exists trg_worker_sessions_set_updated_at on public.worker_sessions;
create trigger trg_worker_sessions_set_updated_at
before update on public.worker_sessions
for each row execute function public.set_updated_at();

drop trigger if exists trg_worker_recovery_policies_set_updated_at on public.worker_recovery_policies;
create trigger trg_worker_recovery_policies_set_updated_at
before update on public.worker_recovery_policies
for each row execute function public.set_updated_at();

alter table public.worker_sessions enable row level security;
alter table public.worker_session_events enable row level security;
alter table public.worker_recovery_policies enable row level security;

commit;
