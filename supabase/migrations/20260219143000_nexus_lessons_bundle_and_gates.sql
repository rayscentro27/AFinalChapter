-- Nexus Lessons + Client Tasks + CRI Routing + Gate Evidence
-- Additive migration for bundle import, routing, and completion safeguards.

create extension if not exists pgcrypto;

DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('red', 'yellow', 'green');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_progress AS ENUM ('not_started', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create table if not exists public.training_modules (
  id uuid primary key default gen_random_uuid(),
  module_id text not null unique,
  module_name text not null,
  category text not null default 'general',
  compliance_level text not null default 'standard',
  source_refs text[] not null default '{}',
  risk_tier text not null default 'medium',
  key_risks text[] not null default '{}',
  prohibited_actions text[] not null default '{}',
  mandatory_human_review boolean not null default false,
  cri_impact_model jsonb not null default '{}'::jsonb,
  ai_lesson jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.training_tasks (
  id uuid primary key default gen_random_uuid(),
  task_id text not null unique,
  module_id text not null references public.training_modules(module_id) on delete cascade,
  task_name text not null,
  assigned_to text not null default 'Client',
  priority text not null default 'Medium',
  estimated_time_minutes int not null default 15,
  triggers text[] not null default '{}',
  steps text[] not null default '{}',
  success_metrics text[] not null default '{}',
  escalation_conditions jsonb not null default '{}'::jsonb,
  compliance_flags text[] not null default '{}',
  default_assignee_agent text not null default 'Nexus Analyst',
  created_at timestamptz not null default now()
);

create table if not exists public.cri_routing (
  id uuid primary key default gen_random_uuid(),
  singleton_key text not null unique default 'default',
  cri_tiers jsonb not null default '{}'::jsonb,
  tier_defaults jsonb not null default '{}'::jsonb,
  global_safeguards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.task_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid,
  task_id text not null,
  evidence_uploaded boolean not null default false,
  verification_flag boolean not null default false,
  human_approved boolean not null default false,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, task_id)
);

create index if not exists training_tasks_module_idx on public.training_tasks(module_id);
create index if not exists task_evidence_tenant_user_idx on public.task_evidence(tenant_id, user_id);

-- Compatibility fields used by both legacy and new client task board runtimes.
alter table public.client_tasks
  add column if not exists task_id text,
  add column if not exists signal text,
  add column if not exists assigned_employee text,
  add column if not exists due_date date,
  add column if not exists type text,
  add column if not exists group_key text,
  add column if not exists template_key text,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists assignee_agent text,
  add column if not exists progress public.task_progress not null default 'not_started',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists status_rg public.task_status not null default 'red';

create unique index if not exists client_tasks_tenant_user_task_uidx
on public.client_tasks (tenant_id, user_id, task_id)
where task_id is not null;

create index if not exists client_tasks_tenant_user_task_idx
on public.client_tasks (tenant_id, user_id, task_id);

create or replace function public.touch_updated_at_generic()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_cri_routing_updated_at on public.cri_routing;
create trigger trg_cri_routing_updated_at
before update on public.cri_routing
for each row execute function public.touch_updated_at_generic();

drop trigger if exists trg_task_evidence_updated_at on public.task_evidence;
create trigger trg_task_evidence_updated_at
before update on public.task_evidence
for each row execute function public.touch_updated_at_generic();

alter table public.training_modules enable row level security;
alter table public.training_tasks enable row level security;
alter table public.cri_routing enable row level security;
alter table public.task_evidence enable row level security;

drop policy if exists training_modules_select on public.training_modules;
create policy training_modules_select on public.training_modules
for select using (auth.role() = 'authenticated');

drop policy if exists training_modules_admin_write on public.training_modules;
create policy training_modules_admin_write on public.training_modules
for all using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists training_tasks_select on public.training_tasks;
create policy training_tasks_select on public.training_tasks
for select using (auth.role() = 'authenticated');

drop policy if exists training_tasks_admin_write on public.training_tasks;
create policy training_tasks_admin_write on public.training_tasks
for all using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists cri_routing_select on public.cri_routing;
create policy cri_routing_select on public.cri_routing
for select using (auth.role() = 'authenticated');

drop policy if exists cri_routing_admin_write on public.cri_routing;
create policy cri_routing_admin_write on public.cri_routing
for all using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists task_evidence_select on public.task_evidence;
create policy task_evidence_select on public.task_evidence
for select using (
  public.nexus_is_master_admin()
  or public.nexus_can_access_tenant(tenant_id)
  or user_id = auth.uid()
);

drop policy if exists task_evidence_insert on public.task_evidence;
create policy task_evidence_insert on public.task_evidence
for insert with check (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or public.nexus_can_access_tenant(tenant_id)
    or user_id = auth.uid()
  )
);

drop policy if exists task_evidence_update on public.task_evidence;
create policy task_evidence_update on public.task_evidence
for update using (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or public.nexus_can_access_tenant(tenant_id)
    or user_id = auth.uid()
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or public.nexus_can_access_tenant(tenant_id)
    or user_id = auth.uid()
  )
);

insert into public.cri_routing (singleton_key, cri_tiers, tier_defaults, global_safeguards)
values (
  'default',
  '{}'::jsonb,
  '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('code', 'SAFE-01', 'name', 'Backdating must be verifiable', 'enabled', true),
    jsonb_build_object('code', 'SAFE-02', 'name', 'Dispute tasks require evidence upload', 'enabled', true),
    jsonb_build_object('code', 'SAFE-03', 'name', 'Legal-sensitive workflows require human review', 'enabled', true)
  )
)
on conflict (singleton_key) do nothing;
