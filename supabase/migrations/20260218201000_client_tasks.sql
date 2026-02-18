-- Persistent client tasks (linked to tenants)
-- Minimal, queryable task storage for CRM/Portal.

create extension if not exists pgcrypto;

create table if not exists public.client_tasks (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  task_id text not null,

  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending','completed')),
  due_date date not null,
  type text not null default 'action' check (type in ('upload','action','education','review','meeting','legal')),

  link text,
  meeting_time timestamptz,
  linked_to_goal boolean,
  meta jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (tenant_id, task_id)
);

create index if not exists client_tasks_tenant_status_idx
on public.client_tasks (tenant_id, status);

create index if not exists client_tasks_due_date_idx
on public.client_tasks (due_date);

alter table public.client_tasks enable row level security;

-- RLS: tenant members (or master admin) can CRUD tasks for tenants they can access.
drop policy if exists client_tasks_select on public.client_tasks;
create policy client_tasks_select on public.client_tasks
for select
using (public.nexus_is_master_admin() or public.nexus_can_access_tenant(tenant_id));

drop policy if exists client_tasks_insert on public.client_tasks;
create policy client_tasks_insert on public.client_tasks
for insert
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));

drop policy if exists client_tasks_update on public.client_tasks;
create policy client_tasks_update on public.client_tasks
for update
using (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id))
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));

drop policy if exists client_tasks_delete on public.client_tasks;
create policy client_tasks_delete on public.client_tasks
for delete
using (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));

-- updated_at maintenance
-- public.set_updated_at() is defined in 20260215055403_eval_scores_updated_at.sql
-- If that migration isn't present in a fresh DB, this trigger will fail; keep it guarded.
do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'set_updated_at'
      and pg_function_is_visible(oid)
  ) then
    drop trigger if exists trg_client_tasks_updated_at on public.client_tasks;
    create trigger trg_client_tasks_updated_at
    before update on public.client_tasks
    for each row execute procedure public.set_updated_at();
  end if;
exception
  when undefined_function then
    null;
end $$;
