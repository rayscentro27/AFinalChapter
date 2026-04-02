-- Phase 1 inbox workflow layer.
-- Additive only: preserve existing status/assignment/thread-type semantics.

create extension if not exists pgcrypto;

do $$
begin
  create type public.inbox_thread_status as enum ('new', 'active', 'waiting', 'qualified', 'closed');
exception when duplicate_object then null; end $$;

do $$
begin
  create type public.inbox_workflow_thread_type as enum ('lead', 'support', 'client', 'general');
exception when duplicate_object then null; end $$;

do $$
begin
  create type public.inbox_channel_type as enum ('messenger', 'instagram_dm', 'nexus_chat', 'future_email');
exception when duplicate_object then null; end $$;

do $$
begin
  create type public.inbox_ai_mode as enum ('off', 'suggest_only');
exception when duplicate_object then null; end $$;

alter table if exists public.conversations
  add column if not exists thread_status public.inbox_thread_status not null default 'new',
  add column if not exists workflow_thread_type public.inbox_workflow_thread_type not null default 'general',
  add column if not exists owner_user_id uuid null,
  add column if not exists ai_mode public.inbox_ai_mode not null default 'off',
  add column if not exists channel_type public.inbox_channel_type not null default 'nexus_chat',
  add column if not exists last_inbound_at timestamptz null,
  add column if not exists last_outbound_at timestamptz null;

create index if not exists conversations_tenant_thread_status_idx
  on public.conversations (tenant_id, thread_status);

create index if not exists conversations_tenant_owner_user_idx
  on public.conversations (tenant_id, owner_user_id);

create index if not exists conversations_tenant_channel_type_idx
  on public.conversations (tenant_id, channel_type);

create index if not exists conversations_tenant_workflow_thread_type_idx
  on public.conversations (tenant_id, workflow_thread_type);

-- Backfill new workflow fields conservatively from existing operational data.
update public.conversations
set thread_status = (
  case lower(coalesce(status::text, ''))
    when 'closed' then 'closed'
    when 'pending_client' then 'waiting'
    when 'pending' then 'active'
    when 'pending_staff' then 'active'
    when 'escalated' then 'active'
    when 'open' then 'active'
    else 'active'
  end
)::public.inbox_thread_status;

update public.conversations
set workflow_thread_type = (
  case
    when lower(coalesce(thread_type, '')) = 'client_portal' then 'client'
    else 'general'
  end
)::public.inbox_workflow_thread_type;

update public.conversations
set owner_user_id = coalesce(owner_user_id, assigned_staff_user_id, assignee_user_id);

update public.conversations c
set ai_mode = (
  case
    when c.assignee_type = 'ai' or nullif(trim(coalesce(c.assignee_ai_key, '')), '') is not null then 'suggest_only'
    else 'off'
  end
)::public.inbox_ai_mode;

update public.conversations c
set channel_type = (
  case
    when lower(coalesce(c.thread_type, '')) = 'client_portal' then 'nexus_chat'
    when lower(coalesce(ca.provider, '')) = 'meta'
         and (
           lower(coalesce(ct.metadata->>'source', ct.metadata->>'channel', '')) = 'instagram'
           or coalesce(ct.fb_psid, '') like 'ig:%'
           or nullif(trim(coalesce(ct.ig_handle, '')), '') is not null
         ) then 'instagram_dm'
    when lower(coalesce(ca.provider, '')) = 'meta' then 'messenger'
    else 'nexus_chat'
  end
)::public.inbox_channel_type
from public.channel_accounts ca,
     public.contacts ct
where ca.id = c.channel_account_id
  and ct.id = c.contact_id;

update public.conversations c
set last_inbound_at = stats.last_inbound_at,
    last_outbound_at = stats.last_outbound_at
from (
  select
    m.conversation_id,
    max(coalesce(m.received_at, m.sent_at, m.created_at, now())) filter (where m.direction = 'in') as last_inbound_at,
    max(coalesce(m.sent_at, m.received_at, m.created_at, now())) filter (where m.direction = 'out') as last_outbound_at
  from public.messages m
  group by m.conversation_id
) as stats
where stats.conversation_id = c.id;

create or replace function public.bump_conversation_last_message()
returns trigger
language plpgsql
as $$
declare
  v_ts timestamptz := greatest(
    coalesce(new.received_at, 'epoch'::timestamptz),
    coalesce(new.sent_at, 'epoch'::timestamptz),
    coalesce(new.created_at, now())
  );
begin
  update public.conversations
    set last_message_at = greatest(coalesce(last_message_at, 'epoch'::timestamptz), v_ts),
        last_inbound_at = case
          when new.direction = 'in' then greatest(coalesce(last_inbound_at, 'epoch'::timestamptz), v_ts)
          else last_inbound_at
        end,
        last_outbound_at = case
          when new.direction = 'out' then greatest(coalesce(last_outbound_at, 'epoch'::timestamptz), v_ts)
          else last_outbound_at
        end,
        updated_at = now()
  where id = new.conversation_id;
  return new;
end $$;
