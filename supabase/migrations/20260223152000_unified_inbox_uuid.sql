create extension if not exists pgcrypto;
do $$ begin
  create type public.conversation_status as enum ('open','pending','closed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.message_direction as enum ('in','out');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.channel_provider as enum ('twilio','meta','whatsapp','matrix','google_voice');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.participant_role as enum ('contact','agent','ai');
exception when duplicate_object then null; end $$;
create or replace function public.is_tenant_member(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = p_tenant
      and tm.user_id = auth.uid()
  );
$$;
grant execute on function public.is_tenant_member(uuid) to authenticated;
alter table if exists public.channel_accounts
  add column if not exists display_name text;
update public.channel_accounts
set display_name = coalesce(display_name, label)
where display_name is null;
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid,
  display_name text,
  name text,
  first_name text,
  last_name text,
  email text,
  phone text,
  phone_e164 text,
  phone_raw text,
  title text,
  status text not null default 'active',
  notes text,
  ig_handle text,
  fb_psid text,
  wa_number text,
  matrix_user_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.contacts
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists client_id uuid,
  add column if not exists display_name text,
  add column if not exists ig_handle text,
  add column if not exists fb_psid text,
  add column if not exists wa_number text,
  add column if not exists matrix_user_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'active';
update public.contacts
set tenant_id = coalesce(tenant_id, client_id)
where tenant_id is null;
update public.contacts
set display_name = coalesce(
  display_name,
  name,
  nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
)
where display_name is null;
create index if not exists contacts_tenant_idx on public.contacts(tenant_id);
create index if not exists contacts_tenant_phone_idx on public.contacts(tenant_id, phone_e164);
create index if not exists contacts_tenant_email_idx on public.contacts(tenant_id, email);
create index if not exists contacts_tenant_fb_psid_idx on public.contacts(tenant_id, fb_psid);
create index if not exists contacts_tenant_wa_number_idx on public.contacts(tenant_id, wa_number);
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel_account_id uuid not null references public.channel_accounts(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete set null,
  status public.conversation_status not null default 'open',
  priority int not null default 3,
  tags text[] not null default '{}',
  subject text,
  assignee_user_id uuid,
  assignee_type public.participant_role not null default 'agent',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_tenant_last_idx
on public.conversations(tenant_id, last_message_at desc nulls last);
create index if not exists conversations_tenant_status_idx
on public.conversations(tenant_id, status);
create index if not exists conversations_tenant_assignee_idx
on public.conversations(tenant_id, assignee_user_id);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction public.message_direction not null,
  provider public.channel_provider not null,
  provider_message_id text not null,
  from_id text,
  to_id text,
  body text,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  error jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, provider, provider_message_id)
);
create index if not exists messages_conversation_received_idx
on public.messages(conversation_id, received_at desc);
create index if not exists messages_tenant_received_idx
on public.messages(tenant_id, received_at desc);
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  provider public.channel_provider not null,
  provider_media_id text,
  mime_type text,
  size_bytes bigint,
  filename text,
  storage_bucket text,
  storage_path text,
  created_at timestamptz not null default now()
);
create index if not exists attachments_message_idx on public.attachments(message_id);
create table if not exists public.routing_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  match_type text not null default 'tag_or_keyword',
  match_value text not null,
  target_type public.participant_role not null default 'ai',
  target_user_id uuid,
  target_ai_key text,
  priority int not null default 100,
  created_at timestamptz not null default now()
);
create index if not exists routing_rules_tenant_priority_idx
on public.routing_rules(tenant_id, priority);
create table if not exists public.routing_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  rule_id uuid references public.routing_rules(id) on delete set null,
  applied boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists routing_runs_conversation_idx on public.routing_runs(conversation_id);
create or replace function public.bump_conversation_last_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
    set last_message_at = greatest(coalesce(last_message_at, 'epoch'::timestamptz), new.received_at),
        updated_at = now()
  where id = new.conversation_id;
  return new;
end $$;
drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();
drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();
drop trigger if exists trg_bump_last_message on public.messages;
create trigger trg_bump_last_message
after insert on public.messages
for each row execute function public.bump_conversation_last_message();
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.routing_rules enable row level security;
alter table public.routing_runs enable row level security;
drop policy if exists contacts_tenant_select_uuid on public.contacts;
create policy contacts_tenant_select_uuid on public.contacts
for select using (public.is_tenant_member(tenant_id));
drop policy if exists contacts_tenant_insert_uuid on public.contacts;
create policy contacts_tenant_insert_uuid on public.contacts
for insert with check (public.is_tenant_member(tenant_id));
drop policy if exists contacts_tenant_update_uuid on public.contacts;
create policy contacts_tenant_update_uuid on public.contacts
for update using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));
drop policy if exists conversations_tenant_select_uuid on public.conversations;
create policy conversations_tenant_select_uuid on public.conversations
for select using (public.is_tenant_member(tenant_id));
drop policy if exists conversations_tenant_insert_uuid on public.conversations;
create policy conversations_tenant_insert_uuid on public.conversations
for insert with check (public.is_tenant_member(tenant_id));
drop policy if exists conversations_tenant_update_uuid on public.conversations;
create policy conversations_tenant_update_uuid on public.conversations
for update using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));
drop policy if exists messages_tenant_select_uuid on public.messages;
create policy messages_tenant_select_uuid on public.messages
for select using (public.is_tenant_member(tenant_id));
drop policy if exists messages_tenant_insert_uuid on public.messages;
create policy messages_tenant_insert_uuid on public.messages
for insert with check (public.is_tenant_member(tenant_id));
drop policy if exists attachments_tenant_select_uuid on public.attachments;
create policy attachments_tenant_select_uuid on public.attachments
for select using (public.is_tenant_member(tenant_id));
drop policy if exists routing_rules_tenant_select_uuid on public.routing_rules;
create policy routing_rules_tenant_select_uuid on public.routing_rules
for select using (public.is_tenant_member(tenant_id));
drop policy if exists routing_runs_tenant_select_uuid on public.routing_runs;
create policy routing_runs_tenant_select_uuid on public.routing_runs
for select using (public.is_tenant_member(tenant_id));
