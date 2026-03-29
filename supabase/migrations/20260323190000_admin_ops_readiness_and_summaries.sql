begin;

create extension if not exists pgcrypto;

create table if not exists public.executive_briefings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  briefing_type text not null default 'ceo',
  title text not null,
  summary text not null,
  top_updates jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  recommended_actions jsonb not null default '[]'::jsonb,
  critical_alerts jsonb not null default '[]'::jsonb,
  source_run_ids uuid[] not null default '{}'::uuid[],
  published_by text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists executive_briefings_type_created_idx
  on public.executive_briefings (briefing_type, created_at desc);

create index if not exists executive_briefings_tenant_created_idx
  on public.executive_briefings (tenant_id, created_at desc);

create table if not exists public.agent_run_summaries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  client_id text,
  command_id uuid,
  agent_name text not null,
  source_kind text,
  source_id text,
  run_status text not null default 'completed'
    check (run_status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  risk_level text not null default 'normal'
    check (risk_level in ('low', 'normal', 'moderate', 'high', 'critical')),
  headline text,
  summary text not null,
  prompt_tokens integer,
  completion_tokens integer,
  duration_ms integer,
  estimated_cost_usd numeric(12,4),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_run_summaries_agent_created_idx
  on public.agent_run_summaries (agent_name, created_at desc);

create index if not exists agent_run_summaries_tenant_created_idx
  on public.agent_run_summaries (tenant_id, created_at desc);

create index if not exists agent_run_summaries_status_risk_idx
  on public.agent_run_summaries (run_status, risk_level, created_at desc);

create table if not exists public.admin_commands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  issuer_user_id uuid,
  command_text text not null,
  command_type text not null default 'general',
  target_scope text not null default 'global'
    check (target_scope in ('global', 'tenant', 'worker_group', 'source', 'simulation')),
  target_scope_id text,
  parsed_intent jsonb not null default '{}'::jsonb,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'valid', 'rejected', 'needs_review')),
  approval_required boolean not null default true,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected', 'not_required')),
  queue_handoff_state text not null default 'not_queued'
    check (queue_handoff_state in ('not_queued', 'queued', 'running', 'completed', 'failed', 'cancelled')),
  execution_outcome text not null default 'pending'
    check (execution_outcome in ('pending', 'completed', 'failed', 'cancelled', 'rejected')),
  execution_summary text,
  related_source_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_commands_tenant_created_idx
  on public.admin_commands (tenant_id, created_at desc);

create index if not exists admin_commands_status_idx
  on public.admin_commands (approval_status, queue_handoff_state, execution_outcome, created_at desc);

create index if not exists admin_commands_issuer_idx
  on public.admin_commands (issuer_user_id, created_at desc);

create table if not exists public.admin_command_approvals (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null references public.admin_commands(id) on delete cascade,
  approver_user_id uuid,
  decision text not null check (decision in ('approved', 'rejected')),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  approved_at timestamptz not null default now()
);

create index if not exists admin_command_approvals_command_idx
  on public.admin_command_approvals (command_id, approved_at desc);

create table if not exists public.launch_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  checklist_key text not null,
  area text not null,
  label text not null,
  status text not null default 'pending'
    check (status in ('pending', 'pass', 'warn', 'blocked', 'waived')),
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  owner text,
  evidence jsonb not null default '[]'::jsonb,
  notes text,
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists launch_readiness_checks_tenant_key_uniq
  on public.launch_readiness_checks (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), checklist_key);

create index if not exists launch_readiness_checks_status_idx
  on public.launch_readiness_checks (status, severity, updated_at desc);

create table if not exists public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  simulation_type text not null default '100_user',
  status text not null default 'draft'
    check (status in ('draft', 'running', 'completed', 'failed', 'cancelled')),
  target_users integer not null default 100 check (target_users >= 1),
  actual_users integer,
  incident_count integer not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  summary text,
  metrics jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists simulation_runs_status_created_idx
  on public.simulation_runs (status, created_at desc);

create index if not exists simulation_runs_tenant_created_idx
  on public.simulation_runs (tenant_id, created_at desc);

drop trigger if exists trg_admin_commands_set_updated_at on public.admin_commands;
create trigger trg_admin_commands_set_updated_at
before update on public.admin_commands
for each row execute function public.set_updated_at();

drop trigger if exists trg_launch_readiness_checks_set_updated_at on public.launch_readiness_checks;
create trigger trg_launch_readiness_checks_set_updated_at
before update on public.launch_readiness_checks
for each row execute function public.set_updated_at();

drop trigger if exists trg_simulation_runs_set_updated_at on public.simulation_runs;
create trigger trg_simulation_runs_set_updated_at
before update on public.simulation_runs
for each row execute function public.set_updated_at();

alter table public.executive_briefings enable row level security;
alter table public.agent_run_summaries enable row level security;
alter table public.admin_commands enable row level security;
alter table public.admin_command_approvals enable row level security;
alter table public.launch_readiness_checks enable row level security;
alter table public.simulation_runs enable row level security;

drop policy if exists executive_briefings_admin_select on public.executive_briefings;
create policy executive_briefings_admin_select on public.executive_briefings
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists executive_briefings_admin_write on public.executive_briefings;
create policy executive_briefings_admin_write on public.executive_briefings
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists agent_run_summaries_admin_select on public.agent_run_summaries;
create policy agent_run_summaries_admin_select on public.agent_run_summaries
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists agent_run_summaries_admin_write on public.agent_run_summaries;
create policy agent_run_summaries_admin_write on public.agent_run_summaries
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists admin_commands_admin_select on public.admin_commands;
create policy admin_commands_admin_select on public.admin_commands
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists admin_commands_admin_write on public.admin_commands;
create policy admin_commands_admin_write on public.admin_commands
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists admin_command_approvals_admin_select on public.admin_command_approvals;
create policy admin_command_approvals_admin_select on public.admin_command_approvals
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists admin_command_approvals_admin_write on public.admin_command_approvals;
create policy admin_command_approvals_admin_write on public.admin_command_approvals
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists launch_readiness_checks_admin_select on public.launch_readiness_checks;
create policy launch_readiness_checks_admin_select on public.launch_readiness_checks
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists launch_readiness_checks_admin_write on public.launch_readiness_checks;
create policy launch_readiness_checks_admin_write on public.launch_readiness_checks
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists simulation_runs_admin_select on public.simulation_runs;
create policy simulation_runs_admin_select on public.simulation_runs
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists simulation_runs_admin_write on public.simulation_runs;
create policy simulation_runs_admin_write on public.simulation_runs
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

commit;