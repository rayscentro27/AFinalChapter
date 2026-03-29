-- Outbound reliability: idempotent outbox queue + normalized delivery events.

create table if not exists public.outbox_messages (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  provider text not null check (provider in ('twilio', 'whatsapp', 'meta', 'matrix', 'google_voice')),
  channel_account_id uuid references public.channel_accounts(id) on delete set null,
  to_address text not null,
  from_address text,
  body text,
  content jsonb not null default '{}'::jsonb,
  client_request_id text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'canceled')),
  provider_message_id text,
  last_error text,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists outbox_messages_tenant_client_req_uidx
  on public.outbox_messages (tenant_id, client_request_id);
create index if not exists outbox_messages_status_due_idx
  on public.outbox_messages (tenant_id, status, next_attempt_at);
create index if not exists outbox_messages_conversation_idx
  on public.outbox_messages (tenant_id, conversation_id, created_at desc);
drop trigger if exists trg_outbox_messages_updated_at on public.outbox_messages;
create trigger trg_outbox_messages_updated_at
before update on public.outbox_messages
for each row execute function public.set_updated_at();
create table if not exists public.message_delivery_events (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('twilio', 'whatsapp', 'meta', 'matrix', 'google_voice')),
  provider_message_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists message_delivery_events_lookup_idx
  on public.message_delivery_events (tenant_id, provider, provider_message_id, created_at desc);
alter table public.outbox_messages enable row level security;
alter table public.message_delivery_events enable row level security;
drop policy if exists outbox_messages_select on public.outbox_messages;
create policy outbox_messages_select on public.outbox_messages
for select using (public.is_tenant_member(tenant_id));
drop policy if exists outbox_messages_insert on public.outbox_messages;
create policy outbox_messages_insert on public.outbox_messages
for insert with check (public.is_tenant_member(tenant_id));
drop policy if exists outbox_messages_update on public.outbox_messages;
create policy outbox_messages_update on public.outbox_messages
for update using (
  public.nexus_is_master_admin()
  or public.nexus_can_manage_tenant_members(tenant_id)
)
with check (
  public.nexus_is_master_admin()
  or public.nexus_can_manage_tenant_members(tenant_id)
);
drop policy if exists message_delivery_events_select on public.message_delivery_events;
create policy message_delivery_events_select on public.message_delivery_events
for select using (public.is_tenant_member(tenant_id));
drop policy if exists message_delivery_events_insert on public.message_delivery_events;
create policy message_delivery_events_insert on public.message_delivery_events
for insert with check (
  public.nexus_is_master_admin()
  or public.nexus_can_manage_tenant_members(tenant_id)
);
