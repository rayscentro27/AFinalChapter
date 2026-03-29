-- Phase 1-3 portal messaging foundation layered onto existing unified inbox schema.
-- Additive migration: extends conversations/messages/attachments rather than replacing them.

create extension if not exists pgcrypto;

-- -------------------------------------------------
-- Status model extension for richer thread lifecycle
-- -------------------------------------------------
do $$
begin
  begin
    alter type public.conversation_status add value if not exists 'pending_client';
  exception when duplicate_object then null; end;

  begin
    alter type public.conversation_status add value if not exists 'pending_staff';
  exception when duplicate_object then null; end;

  begin
    alter type public.conversation_status add value if not exists 'escalated';
  exception when duplicate_object then null; end;
end $$;

-- -------------------------------------------------
-- Staff helper scoped to tenant
-- -------------------------------------------------
create or replace function public.nexus_is_staff_for_tenant(p_tenant_id uuid)
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
      where tm.tenant_id = p_tenant_id
        and tm.user_id = auth.uid()
        and lower(coalesce(tm.role, '')) in ('owner', 'super_admin', 'admin', 'supervisor', 'agent', 'sales', 'salesperson')
    );
$$;

grant execute on function public.nexus_is_staff_for_tenant(uuid) to authenticated;

-- -------------------------------------------------
-- Conversation and message extensions
-- -------------------------------------------------
alter table if exists public.conversations
  add column if not exists thread_type text not null default 'client_portal',
  add column if not exists created_by uuid null,
  add column if not exists assigned_staff_user_id uuid null,
  add column if not exists follow_up_at timestamptz null,
  add column if not exists summary_text text null,
  add column if not exists summary_updated_at timestamptz null,
  add column if not exists internal_notes jsonb not null default '[]'::jsonb;

update public.conversations
set assigned_staff_user_id = coalesce(assigned_staff_user_id, assigned_to, assignee_user_id)
where assigned_staff_user_id is null;

create index if not exists conversations_tenant_thread_type_idx
  on public.conversations (tenant_id, thread_type);

create index if not exists conversations_tenant_follow_up_idx
  on public.conversations (tenant_id, follow_up_at);

create index if not exists conversations_tenant_assigned_staff_idx
  on public.conversations (tenant_id, assigned_staff_user_id);

alter table if exists public.messages
  add column if not exists sender_user_id uuid null,
  add column if not exists sender_role text null,
  add column if not exists message_type text not null default 'text',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists edited_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_sender_role_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_sender_role_check
      check (sender_role is null or sender_role in ('client','staff','admin','system','ai'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_message_type_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_message_type_check
      check (message_type in ('text','system','file'));
  end if;
end $$;

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

create index if not exists messages_tenant_sender_user_idx
  on public.messages (tenant_id, sender_user_id);

-- -------------------------------------------------
-- Participant and read tracking
-- -------------------------------------------------
create table if not exists public.conversation_user_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('client','staff','admin')),
  joined_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create index if not exists conversation_user_participants_tenant_conversation_idx
  on public.conversation_user_participants (tenant_id, conversation_id);

create index if not exists conversation_user_participants_tenant_user_idx
  on public.conversation_user_participants (tenant_id, user_id);

create table if not exists public.message_reads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null,
  last_read_message_id uuid null references public.messages(id) on delete set null,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create index if not exists message_reads_tenant_user_idx
  on public.message_reads (tenant_id, user_id, updated_at desc);

create index if not exists message_reads_tenant_conversation_idx
  on public.message_reads (tenant_id, conversation_id, updated_at desc);

-- -------------------------------------------------
-- Notification preference and log tables
-- -------------------------------------------------
create table if not exists public.message_notification_preferences (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  email_enabled boolean not null default true,
  portal_enabled boolean not null default true,
  messenger_enabled boolean not null default true,
  cooldown_minutes int not null default 15,
  last_notified_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table if not exists public.message_notification_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  recipient_user_id uuid not null,
  channel text not null check (channel in ('email','portal_message','facebook_messenger','instagram_messenger')),
  status text not null default 'queued',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists message_notification_log_dedupe_idx
  on public.message_notification_log (tenant_id, conversation_id, message_id, recipient_user_id, channel);

create index if not exists message_notification_log_tenant_created_idx
  on public.message_notification_log (tenant_id, created_at desc);

-- -------------------------------------------------
-- Attachment metadata upgrades (portal attachment support)
-- -------------------------------------------------
alter table if exists public.attachments
  add column if not exists conversation_id uuid null references public.conversations(id) on delete cascade,
  add column if not exists uploaded_by uuid null;

update public.attachments a
set conversation_id = m.conversation_id
from public.messages m
where a.message_id = m.id
  and a.conversation_id is null;

create index if not exists attachments_tenant_conversation_idx
  on public.attachments (tenant_id, conversation_id, created_at desc);

-- -------------------------------------------------
-- Participant access helpers
-- -------------------------------------------------
create or replace function public.nexus_is_conversation_participant(p_conversation_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_user_participants cup
    where cup.conversation_id = p_conversation_id
      and cup.user_id = p_user_id
  );
$$;

grant execute on function public.nexus_is_conversation_participant(uuid, uuid) to authenticated;

create or replace function public.nexus_can_access_conversation(p_tenant_id uuid, p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.nexus_is_staff_for_tenant(p_tenant_id)
    or public.nexus_is_conversation_participant(p_conversation_id, auth.uid());
$$;

grant execute on function public.nexus_can_access_conversation(uuid, uuid) to authenticated;

create or replace function public.nexus_default_sender_role_for_tenant(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.nexus_is_staff_for_tenant(p_tenant_id) then
      case
        when exists (
          select 1
          from public.tenant_memberships tm
          where tm.tenant_id = p_tenant_id
            and tm.user_id = auth.uid()
            and lower(coalesce(tm.role, '')) in ('owner','super_admin','admin')
        ) then 'admin'
        else 'staff'
      end
    else 'client'
  end;
$$;

grant execute on function public.nexus_default_sender_role_for_tenant(uuid) to authenticated;

-- -------------------------------------------------
-- Triggers to keep participant/read state in sync
-- -------------------------------------------------
create or replace function public.messaging_conversation_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null and auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_messaging_conversation_before_insert on public.conversations;
create trigger trg_messaging_conversation_before_insert
before insert on public.conversations
for each row execute function public.messaging_conversation_before_insert();

create or replace function public.messaging_conversation_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return new;
  end if;

  v_role := public.nexus_default_sender_role_for_tenant(new.tenant_id);

  insert into public.conversation_user_participants (tenant_id, conversation_id, user_id, role)
  values (
    new.tenant_id,
    new.id,
    auth.uid(),
    case when v_role = 'client' then 'client' when v_role = 'admin' then 'admin' else 'staff' end
  )
  on conflict (conversation_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_messaging_conversation_after_insert on public.conversations;
create trigger trg_messaging_conversation_after_insert
after insert on public.conversations
for each row execute function public.messaging_conversation_after_insert();

create or replace function public.messaging_message_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_user_id is null and auth.uid() is not null then
    new.sender_user_id := auth.uid();
  end if;

  if coalesce(new.sender_role, '') = '' then
    if new.sender_user_id is null then
      new.sender_role := 'system';
    else
      new.sender_role := public.nexus_default_sender_role_for_tenant(new.tenant_id);
    end if;
  end if;

  if coalesce(new.message_type, '') = '' then
    new.message_type := 'text';
  end if;

  if new.metadata is null then
    new.metadata := '{}'::jsonb;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_messaging_message_before_insert on public.messages;
create trigger trg_messaging_message_before_insert
before insert on public.messages
for each row execute function public.messaging_message_before_insert();

create or replace function public.messaging_message_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_role text;
  v_last_ts timestamptz;
begin
  if new.sender_user_id is not null then
    v_participant_role :=
      case
        when new.sender_role = 'client' then 'client'
        when new.sender_role = 'admin' then 'admin'
        else 'staff'
      end;

    insert into public.conversation_user_participants (tenant_id, conversation_id, user_id, role)
    values (new.tenant_id, new.conversation_id, new.sender_user_id, v_participant_role)
    on conflict (conversation_id, user_id) do update
      set role = excluded.role;

    v_last_ts := coalesce(new.received_at, new.sent_at, new.created_at, now());

    insert into public.message_reads (tenant_id, conversation_id, user_id, last_read_message_id, last_read_at, updated_at)
    values (new.tenant_id, new.conversation_id, new.sender_user_id, new.id, v_last_ts, now())
    on conflict (conversation_id, user_id) do update
      set last_read_message_id = excluded.last_read_message_id,
          last_read_at = greatest(public.message_reads.last_read_at, excluded.last_read_at),
          updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_messaging_message_after_insert on public.messages;
create trigger trg_messaging_message_after_insert
after insert on public.messages
for each row execute function public.messaging_message_after_insert();

create or replace function public.messaging_attachment_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message record;
begin
  if new.message_id is not null then
    select m.tenant_id, m.conversation_id
      into v_message
    from public.messages m
    where m.id = new.message_id
    limit 1;

    if found then
      new.tenant_id := coalesce(new.tenant_id, v_message.tenant_id);
      new.conversation_id := coalesce(new.conversation_id, v_message.conversation_id);
    end if;
  end if;

  if new.uploaded_by is null and auth.uid() is not null then
    new.uploaded_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_messaging_attachment_before_insert on public.attachments;
create trigger trg_messaging_attachment_before_insert
before insert on public.attachments
for each row execute function public.messaging_attachment_before_insert();

drop trigger if exists trg_message_reads_updated_at on public.message_reads;
create trigger trg_message_reads_updated_at
before update on public.message_reads
for each row execute function public.set_updated_at();

drop trigger if exists trg_message_notification_preferences_updated_at on public.message_notification_preferences;
create trigger trg_message_notification_preferences_updated_at
before update on public.message_notification_preferences
for each row execute function public.set_updated_at();

-- -------------------------------------------------
-- Read RPC + unread count RPC
-- -------------------------------------------------
create or replace function public.mark_conversation_read(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_last_read_message_id uuid default null
)
returns table(
  ok boolean,
  reason text,
  conversation_id uuid,
  last_read_message_id uuid,
  last_read_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_last_message_id uuid := null;
  v_last_ts timestamptz := now();
begin
  if v_uid is null then
    return query select false, 'not_authenticated'::text, p_conversation_id, null::uuid, null::timestamptz;
    return;
  end if;

  if not public.nexus_can_access_conversation(p_tenant_id, p_conversation_id) then
    return query select false, 'not_authorized'::text, p_conversation_id, null::uuid, null::timestamptz;
    return;
  end if;

  if p_last_read_message_id is not null then
    select m.id, coalesce(m.received_at, m.sent_at, m.created_at, now())
      into v_last_message_id, v_last_ts
    from public.messages m
    where m.id = p_last_read_message_id
      and m.conversation_id = p_conversation_id
      and m.tenant_id = p_tenant_id
    limit 1;
  end if;

  if v_last_message_id is null then
    select m.id, coalesce(m.received_at, m.sent_at, m.created_at, now())
      into v_last_message_id, v_last_ts
    from public.messages m
    where m.conversation_id = p_conversation_id
      and m.tenant_id = p_tenant_id
    order by coalesce(m.received_at, m.sent_at, m.created_at) desc, m.id desc
    limit 1;
  end if;

  insert into public.message_reads (tenant_id, conversation_id, user_id, last_read_message_id, last_read_at, updated_at)
  values (p_tenant_id, p_conversation_id, v_uid, v_last_message_id, coalesce(v_last_ts, now()), now())
  on conflict (conversation_id, user_id) do update
    set last_read_message_id = excluded.last_read_message_id,
        last_read_at = greatest(public.message_reads.last_read_at, excluded.last_read_at),
        updated_at = now();

  return query select true, 'ok'::text, p_conversation_id, v_last_message_id, coalesce(v_last_ts, now());
end;
$$;

grant execute on function public.mark_conversation_read(uuid, uuid, uuid) to authenticated;

create or replace function public.get_conversation_unread_counts(
  p_tenant_id uuid,
  p_conversation_ids uuid[]
)
returns table(
  conversation_id uuid,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select c.id
    from public.conversations c
    where c.tenant_id = p_tenant_id
      and c.id = any(p_conversation_ids)
      and public.nexus_can_access_conversation(c.tenant_id, c.id)
  )
  select
    s.id as conversation_id,
    count(m.id) filter (
      where m.direction = 'in'
        and coalesce(m.received_at, m.sent_at, m.created_at, now())
          > coalesce(r.last_read_at, 'epoch'::timestamptz)
    )::bigint as unread_count
  from scoped s
  left join public.message_reads r
    on r.conversation_id = s.id
   and r.user_id = auth.uid()
  left join public.messages m
    on m.conversation_id = s.id
   and m.tenant_id = p_tenant_id
  group by s.id, r.last_read_at;
$$;

grant execute on function public.get_conversation_unread_counts(uuid, uuid[]) to authenticated;

-- -------------------------------------------------
-- Backfill participants from tenant client memberships
-- -------------------------------------------------
insert into public.conversation_user_participants (tenant_id, conversation_id, user_id, role)
select
  c.tenant_id,
  c.id,
  tm.user_id,
  'client'
from public.conversations c
join public.tenant_memberships tm
  on tm.tenant_id = c.tenant_id
 and lower(coalesce(tm.role, '')) in ('client', 'partner')
on conflict (conversation_id, user_id) do nothing;

-- -------------------------------------------------
-- RLS policies: participant-scoped for clients, tenant-staff scoped for staff
-- -------------------------------------------------
alter table if exists public.conversation_user_participants enable row level security;
alter table if exists public.message_reads enable row level security;
alter table if exists public.message_notification_preferences enable row level security;
alter table if exists public.message_notification_log enable row level security;

drop policy if exists cup_select_v1 on public.conversation_user_participants;
create policy cup_select_v1 on public.conversation_user_participants
for select
using (
  auth.role() = 'authenticated'
  and (
    user_id = auth.uid()
    or public.nexus_is_staff_for_tenant(tenant_id)
  )
);

drop policy if exists cup_insert_v1 on public.conversation_user_participants;
create policy cup_insert_v1 on public.conversation_user_participants
for insert
with check (
  auth.role() = 'authenticated'
  and public.nexus_is_staff_for_tenant(tenant_id)
);

drop policy if exists cup_update_v1 on public.conversation_user_participants;
create policy cup_update_v1 on public.conversation_user_participants
for update
using (
  auth.role() = 'authenticated'
  and public.nexus_is_staff_for_tenant(tenant_id)
)
with check (
  auth.role() = 'authenticated'
  and public.nexus_is_staff_for_tenant(tenant_id)
);

drop policy if exists cup_delete_v1 on public.conversation_user_participants;
create policy cup_delete_v1 on public.conversation_user_participants
for delete
using (
  auth.role() = 'authenticated'
  and public.nexus_is_staff_for_tenant(tenant_id)
);

drop policy if exists message_reads_select_v1 on public.message_reads;
create policy message_reads_select_v1 on public.message_reads
for select
using (
  auth.role() = 'authenticated'
  and (
    user_id = auth.uid()
    or public.nexus_is_staff_for_tenant(tenant_id)
  )
);

drop policy if exists message_reads_insert_v1 on public.message_reads;
create policy message_reads_insert_v1 on public.message_reads
for insert
with check (
  auth.role() = 'authenticated'
  and public.nexus_can_access_conversation(tenant_id, conversation_id)
  and (
    user_id = auth.uid()
    or public.nexus_is_staff_for_tenant(tenant_id)
  )
);

drop policy if exists message_reads_update_v1 on public.message_reads;
create policy message_reads_update_v1 on public.message_reads
for update
using (
  auth.role() = 'authenticated'
  and public.nexus_can_access_conversation(tenant_id, conversation_id)
  and (
    user_id = auth.uid()
    or public.nexus_is_staff_for_tenant(tenant_id)
  )
)
with check (
  auth.role() = 'authenticated'
  and public.nexus_can_access_conversation(tenant_id, conversation_id)
  and (
    user_id = auth.uid()
    or public.nexus_is_staff_for_tenant(tenant_id)
  )
);

drop policy if exists mnp_select_v1 on public.message_notification_preferences;
create policy mnp_select_v1 on public.message_notification_preferences
for select
using (
  auth.role() = 'authenticated'
  and (
    user_id = auth.uid()
    or public.nexus_is_staff_for_tenant(tenant_id)
  )
);

drop policy if exists mnp_insert_v1 on public.message_notification_preferences;
create policy mnp_insert_v1 on public.message_notification_preferences
for insert
with check (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and (
    user_id = auth.uid()
    or public.nexus_is_staff_for_tenant(tenant_id)
  )
);

drop policy if exists mnp_update_v1 on public.message_notification_preferences;
create policy mnp_update_v1 on public.message_notification_preferences
for update
using (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and (
    user_id = auth.uid()
    or public.nexus_is_staff_for_tenant(tenant_id)
  )
)
with check (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and (
    user_id = auth.uid()
    or public.nexus_is_staff_for_tenant(tenant_id)
  )
);

drop policy if exists mnl_select_v1 on public.message_notification_log;
create policy mnl_select_v1 on public.message_notification_log
for select
using (
  auth.role() = 'authenticated'
  and (
    recipient_user_id = auth.uid()
    or public.nexus_is_staff_for_tenant(tenant_id)
  )
);

drop policy if exists mnl_insert_v1 on public.message_notification_log;
create policy mnl_insert_v1 on public.message_notification_log
for insert
with check (
  auth.role() = 'authenticated'
  and public.nexus_is_staff_for_tenant(tenant_id)
);

drop policy if exists mnl_update_v1 on public.message_notification_log;
create policy mnl_update_v1 on public.message_notification_log
for update
using (
  auth.role() = 'authenticated'
  and public.nexus_is_staff_for_tenant(tenant_id)
)
with check (
  auth.role() = 'authenticated'
  and public.nexus_is_staff_for_tenant(tenant_id)
);

-- Replace broad tenant-only inbox policies with conversation-aware policies.
drop policy if exists p0a_conversations_select on public.conversations;
drop policy if exists p0a_conversations_insert on public.conversations;
drop policy if exists p0a_conversations_update on public.conversations;
drop policy if exists p0a_conversations_delete on public.conversations;
drop policy if exists conversations_tenant_select_uuid on public.conversations;
drop policy if exists conversations_tenant_insert_uuid on public.conversations;
drop policy if exists conversations_tenant_update_uuid on public.conversations;

create policy messaging_conversations_select_v1 on public.conversations
for select
using (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and public.nexus_can_access_conversation(tenant_id, id)
);

create policy messaging_conversations_insert_v1 on public.conversations
for insert
with check (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
);

create policy messaging_conversations_update_v1 on public.conversations
for update
using (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and public.nexus_can_access_conversation(tenant_id, id)
)
with check (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and public.nexus_can_access_conversation(tenant_id, id)
);

create policy messaging_conversations_delete_v1 on public.conversations
for delete
using (
  auth.role() = 'authenticated'
  and public.nexus_is_staff_for_tenant(tenant_id)
);

drop policy if exists p0a_messages_select on public.messages;
drop policy if exists p0a_messages_insert on public.messages;
drop policy if exists p0a_messages_update on public.messages;
drop policy if exists p0a_messages_delete on public.messages;
drop policy if exists messages_tenant_select_uuid on public.messages;
drop policy if exists messages_tenant_insert_uuid on public.messages;

create policy messaging_messages_select_v1 on public.messages
for select
using (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and public.nexus_can_access_conversation(tenant_id, conversation_id)
);

create policy messaging_messages_insert_v1 on public.messages
for insert
with check (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and public.nexus_can_access_conversation(tenant_id, conversation_id)
);

create policy messaging_messages_update_v1 on public.messages
for update
using (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and (
    public.nexus_is_staff_for_tenant(tenant_id)
    or sender_user_id = auth.uid()
  )
)
with check (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and (
    public.nexus_is_staff_for_tenant(tenant_id)
    or sender_user_id = auth.uid()
  )
);

create policy messaging_messages_delete_v1 on public.messages
for delete
using (
  auth.role() = 'authenticated'
  and public.nexus_is_staff_for_tenant(tenant_id)
);

drop policy if exists p0a_attachments_select on public.attachments;
drop policy if exists p0a_attachments_insert on public.attachments;
drop policy if exists p0a_attachments_update on public.attachments;
drop policy if exists p0a_attachments_delete on public.attachments;
drop policy if exists attachments_tenant_select_uuid on public.attachments;

create policy messaging_attachments_select_v1 on public.attachments
for select
using (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and (
    conversation_id is null
    or public.nexus_can_access_conversation(tenant_id, conversation_id)
  )
);

create policy messaging_attachments_insert_v1 on public.attachments
for insert
with check (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and (
    conversation_id is null
    or public.nexus_can_access_conversation(tenant_id, conversation_id)
  )
);

create policy messaging_attachments_update_v1 on public.attachments
for update
using (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and (
    public.nexus_is_staff_for_tenant(tenant_id)
    or uploaded_by = auth.uid()
  )
)
with check (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and (
    public.nexus_is_staff_for_tenant(tenant_id)
    or uploaded_by = auth.uid()
  )
);

create policy messaging_attachments_delete_v1 on public.attachments
for delete
using (
  auth.role() = 'authenticated'
  and public.nexus_is_staff_for_tenant(tenant_id)
);
