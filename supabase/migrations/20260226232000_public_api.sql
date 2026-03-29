-- Public API keys and outgoing webhook subscriptions
-- Safe to run multiple times.

create extension if not exists pgcrypto;
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  key_hash text not null,
  scopes jsonb not null default '["read","write"]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists api_keys_tenant_hash_uq
  on public.api_keys (tenant_id, key_hash);
create index if not exists api_keys_tenant_active_idx
  on public.api_keys (tenant_id, is_active, created_at desc);
create table if not exists public.webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  url text not null,
  secret text not null,
  events jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists webhook_subscriptions_tenant_active_idx
  on public.webhook_subscriptions (tenant_id, is_active, created_at desc);
-- Retry queue for outgoing tenant webhooks
create table if not exists public.webhook_dispatch_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  subscription_id uuid not null,
  event_type text not null,
  event_key text not null,
  payload jsonb not null,
  status text not null default 'queued',
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, subscription_id, event_key)
);
create index if not exists webhook_dispatch_queue_tenant_status_due_idx
  on public.webhook_dispatch_queue (tenant_id, status, next_attempt_at);
