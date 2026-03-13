-- Task board compatibility layer + starter template seed
-- Keeps existing tenant task engine intact while supporting red/yellow/green UI + onboarding auto-assignment.

create extension if not exists pgcrypto;
-- 1) Status/progress enums (requested)
do $$ begin
  create type public.task_status as enum ('red', 'yellow', 'green');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.task_progress as enum ('not_started', 'in_progress', 'completed');
exception when duplicate_object then null; end $$;
-- 2) Task template compatibility columns
alter table public.task_templates
  add column if not exists category text not null default 'general',
  add column if not exists default_assignee_agent text;
update public.task_templates
set default_assignee_agent = coalesce(default_assignee_agent, default_employee, 'Nexus Analyst')
where default_assignee_agent is null;
alter table public.task_templates
  alter column default_assignee_agent set default 'Nexus Analyst';
-- 3) Client task compatibility columns
alter table public.client_tasks
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists template_id uuid references public.task_templates(id) on delete set null,
  add column if not exists assignee_agent text,
  add column if not exists progress public.task_progress not null default 'not_started',
  add column if not exists due_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists client_tasks_id_uidx on public.client_tasks(id);
create index if not exists client_tasks_user_idx on public.client_tasks(user_id);
create index if not exists client_tasks_signal_idx on public.client_tasks(signal);
update public.client_tasks
set assignee_agent = coalesce(assignee_agent, assigned_employee, 'Nexus Analyst')
where assignee_agent is null;
update public.client_tasks
set metadata = coalesce(meta, '{}'::jsonb)
where metadata = '{}'::jsonb and meta is not null;
update public.client_tasks ct
set template_id = tt.id
from public.task_templates tt
where ct.template_id is null
  and ct.template_key is not null
  and ct.template_key = tt.key;
-- 4) Keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;
drop trigger if exists trg_touch_client_tasks on public.client_tasks;
create trigger trg_touch_client_tasks
before update on public.client_tasks
for each row execute function public.touch_updated_at();
-- 5) Starter template seeds (requested titles)
insert into public.task_groups (key, title, description)
values
  ('foundation', 'Foundation', 'Core setup tasks'),
  ('sales', 'Sales', 'Pipeline and follow-up tasks')
on conflict (key) do nothing;
insert into public.task_templates (
  group_id,
  key,
  title,
  description,
  category,
  default_employee,
  default_assignee_agent,
  default_signal,
  default_type,
  sort_order,
  required,
  assign_if
)
select
  tg.id,
  'starter_form_fundable_business',
  'Form a fundable business',
  'Register entity, EIN, bank account, NAICS alignment, professional contact stack.',
  'foundation',
  'Nexus Founder',
  'Nexus Founder',
  'red',
  'action',
  5,
  true,
  '{}'::jsonb
from public.task_groups tg
where tg.key = 'foundation'
on conflict (key) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  default_employee = excluded.default_employee,
  default_assignee_agent = excluded.default_assignee_agent,
  default_signal = excluded.default_signal,
  default_type = excluded.default_type;
insert into public.task_templates (
  group_id,
  key,
  title,
  description,
  category,
  default_employee,
  default_assignee_agent,
  default_signal,
  default_type,
  sort_order,
  required,
  assign_if
)
select
  tg.id,
  'starter_upload_credit_reports',
  'Upload credit reports',
  'Upload reports from AnnualCreditReport.com and confirm all bureaus.',
  'credit',
  'Lex Ledger',
  'Lex Ledger',
  'red',
  'upload',
  10,
  true,
  '{}'::jsonb
from public.task_groups tg
where tg.key = 'credit_repair'
on conflict (key) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  default_employee = excluded.default_employee,
  default_assignee_agent = excluded.default_assignee_agent,
  default_signal = excluded.default_signal,
  default_type = excluded.default_type;
insert into public.task_templates (
  group_id,
  key,
  title,
  description,
  category,
  default_employee,
  default_assignee_agent,
  default_signal,
  default_type,
  sort_order,
  required,
  assign_if
)
select
  tg.id,
  'starter_credit_optimization_plan',
  'Credit optimization plan',
  'Educational review of utilization/derogatories + dispute education resources.',
  'credit',
  'Lex Ledger',
  'Lex Ledger',
  'yellow',
  'review',
  15,
  true,
  '{}'::jsonb
from public.task_groups tg
where tg.key = 'credit_repair'
on conflict (key) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  default_employee = excluded.default_employee,
  default_assignee_agent = excluded.default_assignee_agent,
  default_signal = excluded.default_signal,
  default_type = excluded.default_type;
insert into public.task_templates (
  group_id,
  key,
  title,
  description,
  category,
  default_employee,
  default_assignee_agent,
  default_signal,
  default_type,
  sort_order,
  required,
  assign_if
)
select
  tg.id,
  'starter_grant_match_shortlist',
  'Grant match shortlist',
  'Find grants aligned to entity eligibility and prepare docs checklist.',
  'grants',
  'Nova Grant',
  'Nova Grant',
  'red',
  'review',
  10,
  true,
  jsonb_build_object('any', jsonb_build_array(jsonb_build_object('field','wants_grants','eq',true)))
from public.task_groups tg
where tg.key = 'grants'
on conflict (key) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  default_employee = excluded.default_employee,
  default_assignee_agent = excluded.default_assignee_agent,
  default_signal = excluded.default_signal,
  default_type = excluded.default_type;
insert into public.task_templates (
  group_id,
  key,
  title,
  description,
  category,
  default_employee,
  default_assignee_agent,
  default_signal,
  default_type,
  sort_order,
  required,
  assign_if
)
select
  tg.id,
  'reengage_stale_leads',
  'Re-engage stale leads',
  'Ethical follow-up sequences and next-step scheduling.',
  'sales',
  'Ghost Hunter',
  'Ghost Hunter',
  'yellow',
  'action',
  10,
  false,
  '{}'::jsonb
from public.task_groups tg
where tg.key = 'sales'
on conflict (key) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  default_employee = excluded.default_employee,
  default_assignee_agent = excluded.default_assignee_agent,
  default_signal = excluded.default_signal,
  default_type = excluded.default_type;
