-- Tenant-based task templates, intake profile, notifications, and RPC task generator.
-- Builds on public.client_tasks (tenant_id, task_id) table.

create extension if not exists pgcrypto;

-- ------------------------
-- Extend client_tasks for richer UI/querying
-- ------------------------
alter table public.client_tasks
  add column if not exists signal text not null default 'yellow' check (signal in ('red','yellow','green')),
  add column if not exists assigned_employee text,
  add column if not exists group_key text,
  add column if not exists template_key text;

create index if not exists client_tasks_tenant_signal_idx
on public.client_tasks (tenant_id, signal);

create index if not exists client_tasks_tenant_employee_idx
on public.client_tasks (tenant_id, assigned_employee);

-- ------------------------
-- Intake profile (tenant-scoped)
-- ------------------------
create table if not exists public.tenant_profiles (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  has_registered_business boolean,
  credit_report_uploaded boolean default false,

  credit_score_est int,
  has_major_derog boolean default false,
  utilization_pct int,
  months_reserves int,
  docs_ready boolean default false,

  wants_grants boolean default false,
  wants_sba boolean default false,
  wants_tier1 boolean default true
);

alter table public.tenant_profiles enable row level security;

drop policy if exists tenant_profiles_select on public.tenant_profiles;
create policy tenant_profiles_select on public.tenant_profiles
for select
using (public.nexus_is_master_admin() or public.nexus_can_access_tenant(tenant_id));

drop policy if exists tenant_profiles_insert on public.tenant_profiles;
create policy tenant_profiles_insert on public.tenant_profiles
for insert
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));

drop policy if exists tenant_profiles_update on public.tenant_profiles;
create policy tenant_profiles_update on public.tenant_profiles
for update
using (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id))
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));

-- ------------------------
-- Task groups + templates (global)
-- ------------------------
create table if not exists public.task_groups (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  title text not null,
  description text not null default ''
);

alter table public.task_groups enable row level security;

drop policy if exists task_groups_select on public.task_groups;
create policy task_groups_select on public.task_groups
for select
using (auth.role() = 'authenticated');

drop policy if exists task_groups_admin_write on public.task_groups;
create policy task_groups_admin_write on public.task_groups
for all
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.task_groups(id) on delete cascade,

  key text unique not null,
  title text not null,
  description text not null default '',
  default_employee text not null,
  default_signal text not null default 'yellow' check (default_signal in ('red','yellow','green')),
  default_type text not null default 'action' check (default_type in ('upload','action','education','review','meeting','legal')),
  sort_order int not null default 100,
  required boolean not null default true,
  assign_if jsonb not null default '{}'::jsonb
);

alter table public.task_templates enable row level security;

create index if not exists task_templates_group_sort_idx
on public.task_templates (group_id, sort_order);

-- Readable by any authenticated user (generator + UI)
drop policy if exists task_templates_select on public.task_templates;
create policy task_templates_select on public.task_templates
for select
using (auth.role() = 'authenticated');

-- Only master admin can mutate templates
drop policy if exists task_templates_admin_write on public.task_templates;
create policy task_templates_admin_write on public.task_templates
for all
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

-- ------------------------
-- Task events (tenant-scoped)
-- ------------------------
create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  task_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint task_events_task_fk
    foreign key (tenant_id, task_id)
    references public.client_tasks(tenant_id, task_id)
    on delete cascade
);

alter table public.task_events enable row level security;

create index if not exists task_events_tenant_created_idx
on public.task_events (tenant_id, created_at desc);

-- Member-readable

drop policy if exists task_events_select on public.task_events;
create policy task_events_select on public.task_events
for select
using (public.nexus_is_master_admin() or public.nexus_can_access_tenant(tenant_id));

-- Member-insertable (used by triggers/RPC)
drop policy if exists task_events_insert on public.task_events;
create policy task_events_insert on public.task_events
for insert
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));

-- ------------------------
-- Notifications (tenant-scoped)
-- ------------------------
create table if not exists public.tenant_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null,
  severity text not null default 'info' check (severity in ('info','warn','danger')),
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.tenant_notifications enable row level security;

create index if not exists tenant_notifications_tenant_read_idx
on public.tenant_notifications (tenant_id, read, created_at desc);

-- Member-readable

drop policy if exists tenant_notifications_select on public.tenant_notifications;
create policy tenant_notifications_select on public.tenant_notifications
for select
using (public.nexus_is_master_admin() or public.nexus_can_access_tenant(tenant_id));

-- Member-updatable (mark read)
drop policy if exists tenant_notifications_update on public.tenant_notifications;
create policy tenant_notifications_update on public.tenant_notifications
for update
using (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id))
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));

-- Member-insertable (used by triggers/RPC)
drop policy if exists tenant_notifications_insert on public.tenant_notifications;
create policy tenant_notifications_insert on public.tenant_notifications
for insert
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));

-- ------------------------
-- updated_at triggers
-- ------------------------
create or replace function public.touch_updated_at_generic()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_tenant_profiles_updated_at on public.tenant_profiles;
create trigger trg_tenant_profiles_updated_at
before update on public.tenant_profiles
for each row execute function public.touch_updated_at_generic();

-- ------------------------
-- Rule evaluation helpers
-- ------------------------
create or replace function public.rule_matches_profile(rule jsonb, profile jsonb)
returns boolean language plpgsql as $$
declare
  cond jsonb;
  field text;
  eqv jsonb;
  pv jsonb;
begin
  if rule is null or rule = '{}'::jsonb then return true; end if;

  if rule ? 'all' then
    for cond in select * from jsonb_array_elements(rule->'all') loop
      field := cond->>'field';
      eqv := cond->'eq';
      pv := profile->field;
      if pv is null or pv <> eqv then return false; end if;
    end loop;
    return true;
  end if;

  if rule ? 'any' then
    for cond in select * from jsonb_array_elements(rule->'any') loop
      field := cond->>'field';
      eqv := cond->'eq';
      pv := profile->field;
      if pv is not null and pv = eqv then return true; end if;
    end loop;
    return false;
  end if;

  return true;
end $$;

-- ------------------------
-- RPC: Generate tasks based on tenant profile + templates
-- ------------------------
create or replace function public.generate_tasks_for_tenant(p_tenant_id uuid)
returns jsonb
language plpgsql
as $$
declare
  prof jsonb;
  t record;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_today date := current_date;
  v_due date;
begin
  if not public.nexus_can_access_tenant(p_tenant_id) and not public.nexus_is_master_admin() then
    raise exception 'unauthorized for tenant_id=%', p_tenant_id;
  end if;

  select to_jsonb(tp.*) into prof
  from public.tenant_profiles tp
  where tp.tenant_id = p_tenant_id;

  if prof is null then
    -- Create a default profile row if missing.
    insert into public.tenant_profiles (tenant_id)
    values (p_tenant_id)
    on conflict (tenant_id) do nothing;

    select to_jsonb(tp.*) into prof
    from public.tenant_profiles tp
    where tp.tenant_id = p_tenant_id;
  end if;

  for t in
    select tt.*, tg.key as gk
    from public.task_templates tt
    join public.task_groups tg on tg.id = tt.group_id
    order by tg.key, tt.sort_order
  loop
    if public.rule_matches_profile(t.assign_if, prof) then
      v_due := v_today + 7;

      -- Insert or update descriptive fields. Never reset completion state.
      insert into public.client_tasks (
        tenant_id,
        task_id,
        title,
        description,
        status,
        due_date,
        type,
        signal,
        assigned_employee,
        group_key,
        template_key,
        meta
      )
      values (
        p_tenant_id,
        'tpl:' || t.key,
        t.title,
        nullif(t.description, ''),
        'pending',
        v_due,
        t.default_type,
        t.default_signal,
        t.default_employee,
        t.gk,
        t.key,
        jsonb_build_object('generated', true)
      )
      on conflict (tenant_id, task_id) do update set
        title = excluded.title,
        description = excluded.description,
        type = excluded.type,
        signal = excluded.signal,
        assigned_employee = excluded.assigned_employee,
        group_key = excluded.group_key,
        template_key = excluded.template_key,
        meta = coalesce(public.client_tasks.meta, '{}'::jsonb) || excluded.meta,
        updated_at = now();

      -- Crude accounting (cannot distinguish insert vs update in plain SQL; infer from existence)
      if found then
        -- In plpgsql, FOUND is true for both insert and upsert update; so compute by checking prior existence.
        if exists (select 1 from public.client_tasks where tenant_id = p_tenant_id and task_id = 'tpl:' || t.key and created_at >= now() - interval '2 seconds') then
          v_inserted := v_inserted + 1;
        else
          v_updated := v_updated + 1;
        end if;
      end if;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  insert into public.tenant_notifications(tenant_id, type, severity, title, message)
  values (
    p_tenant_id,
    'tasks_updated',
    'info',
    'Tasks updated',
    'Your task list was generated/updated from your current intake signals.'
  );

  return jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped
  );
end $$;

grant execute on function public.generate_tasks_for_tenant(uuid) to authenticated;

-- ------------------------
-- Triggers: status changes create events + notifications
-- ------------------------
create or replace function public.on_client_task_status_change()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    insert into public.tenant_notifications(tenant_id, type, severity, title, message)
    values (new.tenant_id, 'task_completed', 'info', 'Task completed', new.title);

    insert into public.task_events(tenant_id, task_id, event_type, payload)
    values (new.tenant_id, new.task_id, 'completed', jsonb_build_object('from', old.status, 'to', new.status));
  elsif new.status <> old.status then
    insert into public.task_events(tenant_id, task_id, event_type, payload)
    values (new.tenant_id, new.task_id, 'status_changed', jsonb_build_object('from', old.status, 'to', new.status));
  end if;

  return new;
end $$;

drop trigger if exists trg_client_task_status_change on public.client_tasks;
create trigger trg_client_task_status_change
before update of status on public.client_tasks
for each row execute function public.on_client_task_status_change();

-- ------------------------
-- Seeds: groups + templates (idempotent)
-- ------------------------
insert into public.task_groups (key, title, description)
values
  ('fundable_business', 'Fundable Business Setup', 'Entity + infrastructure tasks for bankability'),
  ('credit_repair', 'Credit Review & Optimization', 'Upload report, analyze, education + dispute workflow'),
  ('tier1_capital', 'Tier 1 Capital Prep', '0% intro APR cards/LOC readiness and discipline'),
  ('grants', 'Grant Readiness', 'Eligibility + narrative + document assembly')
on conflict (key) do nothing;

-- Fundable business templates
insert into public.task_templates (group_id, key, title, description, default_employee, default_signal, default_type, sort_order, assign_if)
select tg.id, 'form_entity', 'Create/Confirm Business Entity', 'Register business or confirm existing entity + good standing.', 'Nexus Founder', 'red', 'action', 10,
  jsonb_build_object('all', jsonb_build_array(jsonb_build_object('field','has_registered_business','eq',false)))
from public.task_groups tg where tg.key='fundable_business'
on conflict (key) do nothing;

insert into public.task_templates (group_id, key, title, description, default_employee, default_signal, default_type, sort_order, assign_if)
select tg.id, 'setup_infrastructure', 'Set up Fundable Infrastructure', 'Domain email, business phone, website, business bank account, EIN.', 'Nexus Founder', 'yellow', 'action', 20,
  '{}'::jsonb
from public.task_groups tg where tg.key='fundable_business'
on conflict (key) do nothing;

-- Credit repair templates
insert into public.task_templates (group_id, key, title, description, default_employee, default_signal, default_type, sort_order, assign_if)
select tg.id, 'upload_credit_report', 'Upload Credit Reports', 'Download from AnnualCreditReport.com and upload all 3 bureaus.', 'Lex Ledger', 'red', 'upload', 10,
  '{}'::jsonb
from public.task_groups tg where tg.key='credit_repair'
on conflict (key) do nothing;

insert into public.task_templates (group_id, key, title, description, default_employee, default_signal, default_type, sort_order, assign_if)
select tg.id, 'review_credit_report', 'Credit Report Review', 'Categorize negatives, utilization, inaccuracies; create plan (no guarantees).', 'Lex Ledger', 'yellow', 'review', 20,
  '{}'::jsonb
from public.task_groups tg where tg.key='credit_repair'
on conflict (key) do nothing;

insert into public.task_templates (group_id, key, title, description, default_employee, default_signal, default_type, sort_order, assign_if)
select tg.id, 'draft_dispute_letters', 'Draft Dispute Letters (Educational)', 'Generate compliant dispute templates for inaccuracies only.', 'Lex Ledger', 'yellow', 'education', 30,
  jsonb_build_object('any', jsonb_build_array(jsonb_build_object('field','has_major_derog','eq',true)))
from public.task_groups tg where tg.key='credit_repair'
on conflict (key) do nothing;

-- Tier 1 templates
insert into public.task_templates (group_id, key, title, description, default_employee, default_signal, default_type, sort_order, assign_if)
select tg.id, 'tier1_readiness', 'Tier 1 Readiness Check', 'Assess probability for 0% intro APR products based on profile (no guarantees).', 'Nexus Analyst', 'yellow', 'review', 10,
  jsonb_build_object('any', jsonb_build_array(jsonb_build_object('field','wants_tier1','eq',true)))
from public.task_groups tg where tg.key='tier1_capital'
on conflict (key) do nothing;

insert into public.task_templates (group_id, key, title, description, default_employee, default_signal, default_type, sort_order, assign_if)
select tg.id, 'autopay_reserves', 'Set Autopay + Reserve Discipline', 'Build reserves and enable autopay; avoid overextension.', 'Nexus Analyst', 'green', 'action', 20,
  '{}'::jsonb
from public.task_groups tg where tg.key='tier1_capital'
on conflict (key) do nothing;

-- Grants templates
insert into public.task_templates (group_id, key, title, description, default_employee, default_signal, default_type, sort_order, assign_if)
select tg.id, 'grant_match', 'Find Eligible Grants', 'Match based on eligibility; no award guarantees.', 'Nova Grant', 'yellow', 'review', 10,
  jsonb_build_object('any', jsonb_build_array(jsonb_build_object('field','wants_grants','eq',true)))
from public.task_groups tg where tg.key='grants'
on conflict (key) do nothing;

insert into public.task_templates (group_id, key, title, description, default_employee, default_signal, default_type, sort_order, assign_if)
select tg.id, 'grant_narrative', 'Draft Grant Narrative', 'Structured impact narrative + line-item use of funds.', 'Nova Grant', 'yellow', 'action', 20,
  jsonb_build_object('any', jsonb_build_array(jsonb_build_object('field','wants_grants','eq',true)))
from public.task_groups tg where tg.key='grants'
on conflict (key) do nothing;
