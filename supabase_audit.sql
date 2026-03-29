-- Audit and compliance expansion
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.audit_events (
  id bigserial primary key,
  tenant_id uuid not null,
  actor_user_id uuid,
  actor_type text not null default 'user',
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_events_tenant_occurred_idx
  on public.audit_events (tenant_id, occurred_at desc);

create index if not exists audit_events_tenant_action_occurred_idx
  on public.audit_events (tenant_id, action, occurred_at desc);

create table if not exists public.retention_settings (
  tenant_id uuid primary key,
  retain_days int not null default 365,
  updated_at timestamptz not null default now()
);
