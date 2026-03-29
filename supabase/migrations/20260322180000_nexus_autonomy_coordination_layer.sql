begin;

create extension if not exists pgcrypto;

create table if not exists public.system_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  event_type text not null,
  client_id text,
  tenant_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  idempotency_key text,
  processed_by text,
  error_msg text
);

alter table public.system_events add column if not exists created_at timestamptz default now();
alter table public.system_events add column if not exists processed_at timestamptz;
alter table public.system_events add column if not exists event_type text;
alter table public.system_events add column if not exists client_id text;
alter table public.system_events add column if not exists tenant_id text;
alter table public.system_events add column if not exists payload jsonb default '{}'::jsonb;
alter table public.system_events add column if not exists status text default 'pending';
alter table public.system_events add column if not exists idempotency_key text;
alter table public.system_events add column if not exists processed_by text;
alter table public.system_events add column if not exists error_msg text;

alter table public.system_events alter column created_at set default now();
alter table public.system_events alter column payload set default '{}'::jsonb;
alter table public.system_events alter column status set default 'pending';

update public.system_events
set created_at = coalesce(created_at, now()),
    payload = coalesce(payload, '{}'::jsonb),
    status = coalesce(nullif(status, ''), 'pending')
where created_at is null
   or payload is null
   or status is null
   or status = '';

create unique index if not exists system_events_idempotency_key_idx
  on public.system_events (idempotency_key)
  where idempotency_key is not null;

create index if not exists system_events_status_idx
  on public.system_events (status, created_at asc)
  where status = 'pending';

create index if not exists system_events_client_idx
  on public.system_events (client_id, created_at desc);

create index if not exists system_events_type_idx
  on public.system_events (event_type, created_at desc);

create table if not exists public.agent_context (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_id text not null,
  tenant_id text,
  active_stage text default 'discovery',
  recent_events jsonb not null default '[]'::jsonb,
  last_actions jsonb not null default '{}'::jsonb,
  cooldown_state jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb
);

alter table public.agent_context add column if not exists created_at timestamptz default now();
alter table public.agent_context add column if not exists updated_at timestamptz default now();
alter table public.agent_context add column if not exists client_id text;
alter table public.agent_context add column if not exists tenant_id text;
alter table public.agent_context add column if not exists active_stage text default 'discovery';
alter table public.agent_context add column if not exists recent_events jsonb default '[]'::jsonb;
alter table public.agent_context add column if not exists last_actions jsonb default '{}'::jsonb;
alter table public.agent_context add column if not exists cooldown_state jsonb default '{}'::jsonb;
alter table public.agent_context add column if not exists meta jsonb default '{}'::jsonb;

alter table public.agent_context alter column created_at set default now();
alter table public.agent_context alter column updated_at set default now();
alter table public.agent_context alter column active_stage set default 'discovery';
alter table public.agent_context alter column recent_events set default '[]'::jsonb;
alter table public.agent_context alter column last_actions set default '{}'::jsonb;
alter table public.agent_context alter column cooldown_state set default '{}'::jsonb;
alter table public.agent_context alter column meta set default '{}'::jsonb;

update public.agent_context
set created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now()),
    active_stage = coalesce(nullif(active_stage, ''), 'discovery'),
    recent_events = coalesce(recent_events, '[]'::jsonb),
    last_actions = coalesce(last_actions, '{}'::jsonb),
    cooldown_state = coalesce(cooldown_state, '{}'::jsonb),
    meta = coalesce(meta, '{}'::jsonb)
where created_at is null
   or updated_at is null
   or active_stage is null
   or active_stage = ''
   or recent_events is null
   or last_actions is null
   or cooldown_state is null
   or meta is null;

create unique index if not exists agent_context_client_uq
  on public.agent_context (client_id);

create index if not exists agent_context_client_idx
  on public.agent_context (client_id);

create table if not exists public.agent_action_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent_name text not null,
  client_id text,
  tenant_id text,
  event_id text,
  event_type text,
  action_taken text not null,
  output_id text,
  decision_reason text,
  meta jsonb not null default '{}'::jsonb
);

alter table public.agent_action_history add column if not exists created_at timestamptz default now();
alter table public.agent_action_history add column if not exists agent_name text;
alter table public.agent_action_history add column if not exists client_id text;
alter table public.agent_action_history add column if not exists tenant_id text;
alter table public.agent_action_history add column if not exists event_id text;
alter table public.agent_action_history add column if not exists event_type text;
alter table public.agent_action_history add column if not exists action_taken text;
alter table public.agent_action_history add column if not exists output_id text;
alter table public.agent_action_history add column if not exists decision_reason text;
alter table public.agent_action_history add column if not exists meta jsonb default '{}'::jsonb;

alter table public.agent_action_history alter column created_at set default now();
alter table public.agent_action_history alter column meta set default '{}'::jsonb;

update public.agent_action_history
set created_at = coalesce(created_at, now()),
    meta = coalesce(meta, '{}'::jsonb)
where created_at is null
   or meta is null;

create index if not exists agent_action_history_agent_client_idx
  on public.agent_action_history (agent_name, client_id, created_at desc);

create index if not exists agent_action_history_event_idx
  on public.agent_action_history (event_id);

create index if not exists agent_action_history_created_idx
  on public.agent_action_history (created_at desc);

create table if not exists public.internal_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  from_agent text not null,
  to_agent text,
  client_id text,
  tenant_id text,
  message_type text not null default 'notification',
  content text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  thread_id text
);

alter table public.internal_messages add column if not exists created_at timestamptz default now();
alter table public.internal_messages add column if not exists from_agent text;
alter table public.internal_messages add column if not exists to_agent text;
alter table public.internal_messages add column if not exists client_id text;
alter table public.internal_messages add column if not exists tenant_id text;
alter table public.internal_messages add column if not exists message_type text default 'notification';
alter table public.internal_messages add column if not exists content text;
alter table public.internal_messages add column if not exists payload jsonb default '{}'::jsonb;
alter table public.internal_messages add column if not exists status text default 'pending';
alter table public.internal_messages add column if not exists thread_id text;

alter table public.internal_messages alter column created_at set default now();
alter table public.internal_messages alter column message_type set default 'notification';
alter table public.internal_messages alter column payload set default '{}'::jsonb;
alter table public.internal_messages alter column status set default 'pending';

update public.internal_messages
set created_at = coalesce(created_at, now()),
    message_type = coalesce(nullif(message_type, ''), 'notification'),
    payload = coalesce(payload, '{}'::jsonb),
    status = coalesce(nullif(status, ''), 'pending')
where created_at is null
   or message_type is null
   or message_type = ''
   or payload is null
   or status is null
   or status = '';

create index if not exists internal_messages_client_idx
  on public.internal_messages (client_id, created_at desc);

create index if not exists internal_messages_to_agent_idx
  on public.internal_messages (to_agent, status)
  where status = 'pending';

create or replace function public.nexus_agent_context_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_agent_context_set_updated_at on public.agent_context;
create trigger trg_agent_context_set_updated_at
before update on public.agent_context
for each row execute procedure public.nexus_agent_context_set_updated_at();

commit;