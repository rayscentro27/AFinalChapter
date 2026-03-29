-- Production hardening layer for Unified Inbox.
-- Safe to run multiple times.

create extension if not exists pgcrypto;

-- 1) Webhook idempotency + replay protection
create table if not exists public.webhook_events (
  id bigserial primary key,
  tenant_id uuid not null,
  provider text not null,
  external_event_id text not null,
  received_at timestamptz not null default now(),
  payload jsonb,
  status text not null default 'accepted',
  error text,
  unique (provider, external_event_id, tenant_id)
);

create index if not exists webhook_events_tenant_received_idx
  on public.webhook_events (tenant_id, received_at desc);

create index if not exists webhook_events_tenant_provider_status_idx
  on public.webhook_events (tenant_id, provider, status, received_at desc);

-- 2) Outbox queue + retries
create table if not exists public.outbox_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contact_id uuid not null,
  conversation_id uuid,
  provider text not null,
  identity_id bigint,
  idempotency_key text not null,
  body_text text not null,
  attachments jsonb,
  status text not null default 'queued',
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

alter table public.outbox_messages
  add column if not exists contact_id uuid;

alter table public.outbox_messages
  add column if not exists identity_id bigint;

alter table public.outbox_messages
  add column if not exists idempotency_key text;

alter table public.outbox_messages
  add column if not exists body_text text;

alter table public.outbox_messages
  add column if not exists attachments jsonb;

-- Existing deployments may use body/client_request_id from prior schema.
update public.outbox_messages
set body_text = coalesce(body_text, body, '')
where body_text is null;

update public.outbox_messages
set idempotency_key = coalesce(idempotency_key, client_request_id, md5(coalesce(id::text, gen_random_uuid()::text)))
where idempotency_key is null;

alter table public.outbox_messages
  alter column body_text set default '';

alter table public.outbox_messages
  alter column body_text set not null;

alter table public.outbox_messages
  alter column idempotency_key set not null;

create unique index if not exists outbox_messages_tenant_idempotency_key_uidx
  on public.outbox_messages (tenant_id, idempotency_key);

create index if not exists outbox_messages_tenant_status_due_idx
  on public.outbox_messages (tenant_id, status, next_attempt_at);

create index if not exists outbox_messages_tenant_contact_created_idx
  on public.outbox_messages (tenant_id, contact_id, created_at desc);

-- 3) Delivery status events
create table if not exists public.message_delivery_events (
  id bigserial primary key,
  tenant_id uuid not null,
  provider text not null,
  provider_message_id text not null,
  status text not null,
  occurred_at timestamptz not null default now(),
  payload jsonb
);

alter table public.message_delivery_events
  add column if not exists status text;

alter table public.message_delivery_events
  add column if not exists occurred_at timestamptz;

-- Backfill from prior schema where event_type/created_at existed.
update public.message_delivery_events
set status = coalesce(status, event_type, 'pending')
where status is null;

update public.message_delivery_events
set occurred_at = coalesce(occurred_at, created_at, now())
where occurred_at is null;

alter table public.message_delivery_events
  alter column status set not null;

alter table public.message_delivery_events
  alter column occurred_at set default now();

alter table public.message_delivery_events
  alter column occurred_at set not null;

create index if not exists message_delivery_events_tenant_provider_status_occurred_idx
  on public.message_delivery_events (tenant_id, provider, status, occurred_at desc);

create index if not exists message_delivery_events_tenant_provider_message_idx
  on public.message_delivery_events (tenant_id, provider_message_id);

-- 4) messages delivery columns
alter table public.messages
  add column if not exists delivery_status text default 'pending';

alter table public.messages
  add column if not exists last_status_at timestamptz;

alter table public.messages
  add column if not exists provider_message_id text;

alter table public.messages
  add column if not exists contact_id uuid;

create index if not exists messages_status_idx
  on public.messages (tenant_id, delivery_status);

create index if not exists messages_tenant_contact_received_idx
  on public.messages (tenant_id, contact_id, received_at desc);
