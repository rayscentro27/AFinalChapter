-- Tenant plan limits for usage enforcement
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.tenant_plans (
  tenant_id uuid primary key,
  plan_key text not null default 'pro',
  limits jsonb not null default jsonb_build_object(
    'messages_sent_per_month', 10000,
    'attachments_mb_per_month', 1024,
    'channels_max', 10
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenant_plans_plan_key_idx
  on public.tenant_plans (plan_key);
