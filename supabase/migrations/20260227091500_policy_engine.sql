-- supabase_policy_engine.sql

create extension if not exists pgcrypto;

create table if not exists public.tenant_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  is_active boolean not null default true,
  priority integer not null default 100,
  effect text not null,
  action text not null,
  conditions jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists tenant_policies_tenant_action_priority_idx
  on public.tenant_policies (tenant_id, action, priority);
