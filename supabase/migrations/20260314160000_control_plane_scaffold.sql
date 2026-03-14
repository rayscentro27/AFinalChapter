-- Phase 1 scaffold: control plane tables (additive, no runtime activation)

begin;

create table if not exists public.system_config (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'global' check (scope in ('global', 'tenant', 'worker_group')),
  scope_id text null,
  system_mode text not null default 'development'
    check (system_mode in ('development','research','production','maintenance','degraded','emergency_stop')),
  queue_enabled boolean not null default false,
  ai_jobs_enabled boolean not null default true,
  research_jobs_enabled boolean not null default true,
  notifications_enabled boolean not null default true,
  updated_by text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists system_config_scope_scope_id_uniq
  on public.system_config (scope, coalesce(scope_id, ''));

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null,
  enabled boolean not null default false,
  scope text not null default 'global' check (scope in ('global', 'tenant', 'worker_group')),
  scope_id text null,
  rollout_pct integer null check (rollout_pct is null or (rollout_pct >= 0 and rollout_pct <= 100)),
  expires_at timestamptz null,
  updated_by text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists feature_flags_key_scope_scope_id_uniq
  on public.feature_flags (flag_key, scope, coalesce(scope_id, ''));

create index if not exists feature_flags_scope_enabled_idx
  on public.feature_flags (scope, enabled, updated_at desc);

create table if not exists public.worker_controls (
  id uuid primary key default gen_random_uuid(),
  worker_type text not null,
  worker_id text null,
  paused boolean not null default false,
  max_concurrency integer not null default 1 check (max_concurrency >= 1 and max_concurrency <= 128),
  job_types_disabled text[] not null default '{}'::text[],
  quarantine_reason text null,
  quarantine_until timestamptz null,
  updated_by text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists worker_controls_worker_type_worker_id_uniq
  on public.worker_controls (worker_type, coalesce(worker_id, ''));

create index if not exists worker_controls_paused_quarantine_idx
  on public.worker_controls (paused, quarantine_until, updated_at desc);

create table if not exists public.queue_controls (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  intake_paused boolean not null default false,
  queue_depth_cap integer null check (queue_depth_cap is null or queue_depth_cap >= 1),
  retry_multiplier numeric(6,3) not null default 1.0 check (retry_multiplier >= 0.1 and retry_multiplier <= 20.0),
  max_attempts_override integer null check (max_attempts_override is null or max_attempts_override >= 1),
  dead_letter_on_error_rate numeric(6,3) null check (dead_letter_on_error_rate is null or (dead_letter_on_error_rate >= 0 and dead_letter_on_error_rate <= 1)),
  updated_by text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists queue_controls_job_type_uniq
  on public.queue_controls (job_type);

create table if not exists public.ai_usage_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'global' check (scope in ('global', 'tenant', 'worker_group')),
  scope_id text null,
  provider text not null default 'openrouter',
  task_type text not null default 'general',
  daily_request_limit integer null check (daily_request_limit is null or daily_request_limit >= 1),
  daily_token_limit integer null check (daily_token_limit is null or daily_token_limit >= 1),
  force_cache_only boolean not null default false,
  fallback_allowed boolean not null default true,
  updated_by text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_usage_limits_scope_scope_id_provider_task_uniq
  on public.ai_usage_limits (scope, coalesce(scope_id, ''), provider, task_type);

create table if not exists public.incident_events (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'investigating', 'mitigated', 'resolved')),
  title text not null,
  details jsonb not null default '{}'::jsonb,
  owner_user_id text null,
  started_at timestamptz not null default now(),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incident_events_status_started_idx
  on public.incident_events (status, started_at desc);

create table if not exists public.control_plane_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text null,
  actor_role text null,
  action text not null,
  target_type text not null,
  target_id text null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists control_plane_audit_log_created_idx
  on public.control_plane_audit_log (created_at desc);

create index if not exists control_plane_audit_log_action_target_idx
  on public.control_plane_audit_log (action, target_type, created_at desc);

-- updated_at trigger support
drop trigger if exists trg_system_config_set_updated_at on public.system_config;
create trigger trg_system_config_set_updated_at
before update on public.system_config
for each row execute function public.set_updated_at();

drop trigger if exists trg_feature_flags_set_updated_at on public.feature_flags;
create trigger trg_feature_flags_set_updated_at
before update on public.feature_flags
for each row execute function public.set_updated_at();

drop trigger if exists trg_worker_controls_set_updated_at on public.worker_controls;
create trigger trg_worker_controls_set_updated_at
before update on public.worker_controls
for each row execute function public.set_updated_at();

drop trigger if exists trg_queue_controls_set_updated_at on public.queue_controls;
create trigger trg_queue_controls_set_updated_at
before update on public.queue_controls
for each row execute function public.set_updated_at();

drop trigger if exists trg_ai_usage_limits_set_updated_at on public.ai_usage_limits;
create trigger trg_ai_usage_limits_set_updated_at
before update on public.ai_usage_limits
for each row execute function public.set_updated_at();

drop trigger if exists trg_incident_events_set_updated_at on public.incident_events;
create trigger trg_incident_events_set_updated_at
before update on public.incident_events
for each row execute function public.set_updated_at();

alter table public.system_config enable row level security;
alter table public.feature_flags enable row level security;
alter table public.worker_controls enable row level security;
alter table public.queue_controls enable row level security;
alter table public.ai_usage_limits enable row level security;
alter table public.incident_events enable row level security;
alter table public.control_plane_audit_log enable row level security;

commit;
