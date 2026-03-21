create extension if not exists pgcrypto;
alter table if exists public.conversations
  add column if not exists assigned_to uuid null,
  add column if not exists assigned_at timestamptz null,
  add column if not exists sla_minutes int not null default 60,
  add column if not exists sla_due_at timestamptz null,
  add column if not exists sla_breached_at timestamptz null;
do $$
declare
  priority_type text;
begin
  select c.data_type
    into priority_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'conversations'
    and c.column_name = 'priority'
  limit 1;

  if priority_type is null then
    alter table public.conversations
      add column priority text not null default 'normal';
  elsif priority_type <> 'text' then
    alter table public.conversations
      add column if not exists priority_label text not null default 'normal';
  end if;
end $$;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'assignee_user_id'
  ) then
    update public.conversations
      set assigned_to = coalesce(assigned_to, assignee_user_id)
    where assigned_to is null
      and assignee_user_id is not null;
  end if;
end $$;
create index if not exists conversations_tenant_assigned_to_idx
  on public.conversations (tenant_id, assigned_to);
create index if not exists conversations_tenant_sla_due_idx
  on public.conversations (tenant_id, sla_due_at);
create index if not exists conversations_tenant_sla_breached_idx
  on public.conversations (tenant_id, sla_breached_at);
create table if not exists public.assignment_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  is_active boolean not null default true,
  match jsonb not null default '{}'::jsonb,
  action jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists assignment_rules_tenant_active_created_idx
  on public.assignment_rules (tenant_id, is_active, created_at desc);
create table if not exists public.agent_workload (
  tenant_id uuid not null,
  user_id uuid not null,
  open_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
