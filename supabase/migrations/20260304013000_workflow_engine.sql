-- Workflow engine foundation: templates, instances, events, and task linkage.

create extension if not exists pgcrypto;
create table if not exists public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  template_key text not null references public.workflow_templates(key) on delete restrict,
  status text not null default 'active' check (status in ('active', 'completed', 'paused')),
  current_step int not null default 1 check (current_step >= 1),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.workflow_events (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.workflow_instances(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists workflow_instances_tenant_user_idx
  on public.workflow_instances (tenant_id, user_id, status, updated_at desc);
create index if not exists workflow_instances_template_idx
  on public.workflow_instances (template_key, status, updated_at desc);
create index if not exists workflow_events_instance_created_idx
  on public.workflow_events (instance_id, created_at desc);
alter table public.client_tasks
  add column if not exists workflow_instance_id uuid references public.workflow_instances(id) on delete set null,
  add column if not exists workflow_step_number int,
  add column if not exists workflow_step_key text;
create index if not exists client_tasks_workflow_instance_idx
  on public.client_tasks (workflow_instance_id, status, due_date);
create index if not exists client_tasks_workflow_step_idx
  on public.client_tasks (workflow_instance_id, workflow_step_number);
create or replace function public.nexus_workflow_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
drop trigger if exists trg_workflow_instances_set_updated_at on public.workflow_instances;
create trigger trg_workflow_instances_set_updated_at
before update on public.workflow_instances
for each row execute procedure public.nexus_workflow_set_updated_at();
create or replace function public.nexus_workflow_can_access_tenant(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  allowed boolean := false;
begin
  if p_tenant_id is null then
    return false;
  end if;

  if to_regprocedure('public.nexus_is_master_admin_compat()') is not null and public.nexus_is_master_admin_compat() then
    return true;
  end if;

  if to_regprocedure('public.nexus_can_access_tenant(uuid)') is not null then
    execute 'select public.nexus_can_access_tenant($1)' into allowed using p_tenant_id;
    return coalesce(allowed, false);
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
      )
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
      )
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;
create or replace function public.nexus_workflow_can_manage_tenant(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  allowed boolean := false;
begin
  if p_tenant_id is null then
    return false;
  end if;

  if to_regprocedure('public.nexus_is_master_admin_compat()') is not null and public.nexus_is_master_admin_compat() then
    return true;
  end if;

  if to_regprocedure('public.nexus_can_manage_tenant(uuid)') is not null then
    execute 'select public.nexus_can_manage_tenant($1)' into allowed using p_tenant_id;
    return coalesce(allowed, false);
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
          and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'super_admin')
      )
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
          and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'super_admin')
      )
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;
grant execute on function public.nexus_workflow_can_access_tenant(uuid) to authenticated;
grant execute on function public.nexus_workflow_can_manage_tenant(uuid) to authenticated;
alter table public.workflow_templates enable row level security;
alter table public.workflow_instances enable row level security;
alter table public.workflow_events enable row level security;
drop policy if exists workflow_templates_select_auth on public.workflow_templates;
create policy workflow_templates_select_auth
on public.workflow_templates
for select to authenticated
using (true);
drop policy if exists workflow_templates_super_admin_write on public.workflow_templates;
create policy workflow_templates_super_admin_write
on public.workflow_templates
for all to authenticated
using (public.nexus_is_master_admin_compat())
with check (public.nexus_is_master_admin_compat());
drop policy if exists workflow_instances_select_scope on public.workflow_instances;
create policy workflow_instances_select_scope
on public.workflow_instances
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_workflow_can_access_tenant(tenant_id)
);
drop policy if exists workflow_instances_insert_scope on public.workflow_instances;
create policy workflow_instances_insert_scope
on public.workflow_instances
for insert to authenticated
with check (
  auth.uid() = user_id
  and public.nexus_workflow_can_access_tenant(tenant_id)
);
drop policy if exists workflow_instances_update_scope on public.workflow_instances;
create policy workflow_instances_update_scope
on public.workflow_instances
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_workflow_can_manage_tenant(tenant_id)
)
with check (
  auth.uid() = user_id
  or public.nexus_workflow_can_manage_tenant(tenant_id)
);
drop policy if exists workflow_events_select_scope on public.workflow_events;
create policy workflow_events_select_scope
on public.workflow_events
for select to authenticated
using (
  exists (
    select 1
    from public.workflow_instances wi
    where wi.id = workflow_events.instance_id
      and (
        wi.user_id = auth.uid()
        or public.nexus_workflow_can_access_tenant(wi.tenant_id)
      )
  )
);
drop policy if exists workflow_events_insert_scope on public.workflow_events;
create policy workflow_events_insert_scope
on public.workflow_events
for insert to authenticated
with check (
  exists (
    select 1
    from public.workflow_instances wi
    where wi.id = workflow_events.instance_id
      and (
        wi.user_id = auth.uid()
        or public.nexus_workflow_can_manage_tenant(wi.tenant_id)
      )
  )
);
insert into public.workflow_templates (key, description, steps)
values
  (
    'FUNDING_ONBOARDING',
    'Client funding onboarding workflow from report upload through outcome summary.',
    $$[
      {
        "order": 1,
        "key": "upload_credit_report",
        "title": "Upload credit report",
        "task": {
          "title": "Upload AnnualCreditReport PDF",
          "description": "Upload your latest AnnualCreditReport file for guided workflow review.",
          "type": "upload"
        },
        "required_tier": "free",
        "email_event": "workflow.step_started"
      },
      {
        "order": 2,
        "key": "ai_credit_analysis",
        "title": "AI credit analysis",
        "task": {
          "title": "Review AI credit analysis",
          "description": "Review AI-generated educational analysis and confirm next actions.",
          "type": "review"
        },
        "required_tier": "growth",
        "requires_ai_consent": true,
        "ai_trigger": {
          "type": "credit_analysis"
        },
        "email_event": "workflow.milestone"
      },
      {
        "order": 3,
        "key": "dispute_letter_draft",
        "title": "Dispute letter draft",
        "task": {
          "title": "Generate dispute letter draft",
          "description": "Generate educational dispute draft and review placeholders before finalization.",
          "type": "legal"
        },
        "required_tier": "growth",
        "requires_ai_consent": true,
        "ai_trigger": {
          "type": "dispute_letter_generate",
          "function": "dispute-letter-generate",
          "path": "generate",
          "context_key": "sanitized_facts_id"
        },
        "email_event": "workflow.milestone"
      },
      {
        "order": 4,
        "key": "business_formation_check",
        "title": "Business formation check",
        "task": {
          "title": "Complete business formation readiness check",
          "description": "Confirm entity structure and documentation readiness.",
          "type": "review"
        },
        "required_tier": "growth",
        "email_event": "workflow.milestone"
      },
      {
        "order": 5,
        "key": "funding_research",
        "title": "Funding research",
        "task": {
          "title": "Complete funding research package",
          "description": "Review premium funding research tools and compile options.",
          "type": "education"
        },
        "required_tier": "premium",
        "email_event": "workflow.milestone"
      },
      {
        "order": 6,
        "key": "report_outcome",
        "title": "Report outcome",
        "task": {
          "title": "Publish workflow outcome report",
          "description": "Finalize educational outcome report and client notes.",
          "type": "review"
        },
        "required_tier": "growth",
        "email_event": "workflow.completed"
      }
    ]$$::jsonb
  ),
  (
    'GRANTS_FLOW',
    'Grants workflow from shortlist through submission tracking.',
    $$[
      {
        "order": 1,
        "key": "shortlist",
        "title": "Shortlist",
        "task": {
          "title": "Build grants shortlist",
          "description": "Create a grants shortlist aligned to eligibility.",
          "type": "review"
        },
        "required_tier": "premium",
        "email_event": "workflow.step_started"
      },
      {
        "order": 2,
        "key": "draft",
        "title": "Draft",
        "task": {
          "title": "Draft grant package",
          "description": "Draft supporting narrative and checklist.",
          "type": "education"
        },
        "required_tier": "premium",
        "email_event": "workflow.milestone"
      },
      {
        "order": 3,
        "key": "approval",
        "title": "Approval",
        "task": {
          "title": "Approval review",
          "description": "Review and approve submission package.",
          "type": "review"
        },
        "required_tier": "premium",
        "email_event": "workflow.milestone"
      },
      {
        "order": 4,
        "key": "submission_tracking",
        "title": "Submission tracking",
        "task": {
          "title": "Track grant submissions",
          "description": "Track grant submission outcomes and next actions.",
          "type": "action"
        },
        "required_tier": "premium",
        "email_event": "workflow.completed"
      }
    ]$$::jsonb
  ),
  (
    'SBA_FLOW',
    'SBA workflow from plan creation through monthly readiness checks.',
    $$[
      {
        "order": 1,
        "key": "create_plan",
        "title": "Create plan",
        "task": {
          "title": "Create SBA plan",
          "description": "Create an SBA preparation plan and baseline checklist.",
          "type": "education"
        },
        "required_tier": "premium",
        "email_event": "workflow.step_started"
      },
      {
        "order": 2,
        "key": "upload_docs",
        "title": "Upload docs",
        "task": {
          "title": "Upload SBA documentation",
          "description": "Upload required docs for monthly readiness tracking.",
          "type": "upload"
        },
        "required_tier": "premium",
        "email_event": "workflow.milestone"
      },
      {
        "order": 3,
        "key": "readiness_score",
        "title": "Readiness score",
        "task": {
          "title": "Review SBA readiness score",
          "description": "Review readiness score and required improvements.",
          "type": "review"
        },
        "required_tier": "premium",
        "requires_ai_consent": true,
        "ai_trigger": {
          "type": "sba_readiness_score"
        },
        "email_event": "workflow.milestone"
      },
      {
        "order": 4,
        "key": "monthly_checkin",
        "title": "Monthly check-in",
        "task": {
          "title": "Complete monthly SBA check-in",
          "description": "Log monthly updates and next cycle goals.",
          "type": "meeting"
        },
        "required_tier": "premium",
        "email_event": "workflow.completed"
      }
    ]$$::jsonb
  )
on conflict (key) do update
set
  description = excluded.description,
  steps = excluded.steps;
