begin;

create extension if not exists pgcrypto;

alter table public.ai_memory add column if not exists client_id text;
alter table public.ai_memory add column if not exists tenant_id text;
alter table public.ai_memory add column if not exists source_agent text;
alter table public.ai_memory add column if not exists structured_payload jsonb default '{}'::jsonb;
alter table public.ai_memory add column if not exists importance_score numeric default 0.5;
alter table public.ai_memory add column if not exists last_used_at timestamptz;

alter table public.ai_memory alter column structured_payload set default '{}'::jsonb;
alter table public.ai_memory alter column importance_score set default 0.5;

update public.ai_memory
set structured_payload = coalesce(structured_payload, '{}'::jsonb),
    importance_score = coalesce(importance_score, 0.5),
    last_used_at = coalesce(last_used_at, updated_at, created_at)
where structured_payload is null
   or importance_score is null
   or last_used_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_memory_importance_score_range'
      and conrelid = 'public.ai_memory'::regclass
  ) then
    alter table public.ai_memory
      add constraint ai_memory_importance_score_range
      check (importance_score >= 0 and importance_score <= 1);
  end if;
end
$$;

create index if not exists ai_memory_tenant_client_idx
  on public.ai_memory (tenant_id, client_id, created_at desc)
  where is_active = true;

create index if not exists ai_memory_source_agent_idx
  on public.ai_memory (source_agent, created_at desc)
  where is_active = true;

create index if not exists ai_memory_importance_idx
  on public.ai_memory (importance_score desc, created_at desc)
  where is_active = true;

create index if not exists ai_memory_last_used_idx
  on public.ai_memory (last_used_at desc)
  where is_active = true;

create table if not exists public.memory_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id text,
  client_id text,
  from_memory_id uuid not null references public.ai_memory(id) on delete cascade,
  to_memory_id uuid not null references public.ai_memory(id) on delete cascade,
  link_type text not null default 'related',
  link_strength numeric not null default 0.5,
  source_agent text,
  meta jsonb not null default '{}'::jsonb,
  unique (from_memory_id, to_memory_id, link_type)
);

alter table public.memory_links add column if not exists created_at timestamptz default now();
alter table public.memory_links add column if not exists tenant_id text;
alter table public.memory_links add column if not exists client_id text;
alter table public.memory_links add column if not exists from_memory_id uuid references public.ai_memory(id) on delete cascade;
alter table public.memory_links add column if not exists to_memory_id uuid references public.ai_memory(id) on delete cascade;
alter table public.memory_links add column if not exists link_type text default 'related';
alter table public.memory_links add column if not exists link_strength numeric default 0.5;
alter table public.memory_links add column if not exists source_agent text;
alter table public.memory_links add column if not exists meta jsonb default '{}'::jsonb;

alter table public.memory_links alter column created_at set default now();
alter table public.memory_links alter column link_type set default 'related';
alter table public.memory_links alter column link_strength set default 0.5;
alter table public.memory_links alter column meta set default '{}'::jsonb;

update public.memory_links
set created_at = coalesce(created_at, now()),
    link_type = coalesce(nullif(link_type, ''), 'related'),
    link_strength = coalesce(link_strength, 0.5),
    meta = coalesce(meta, '{}'::jsonb)
where created_at is null
   or link_type is null
   or link_type = ''
   or link_strength is null
   or meta is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'memory_links_strength_range'
      and conrelid = 'public.memory_links'::regclass
  ) then
    alter table public.memory_links
      add constraint memory_links_strength_range
      check (link_strength >= 0 and link_strength <= 1);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'memory_links_distinct_nodes'
      and conrelid = 'public.memory_links'::regclass
  ) then
    alter table public.memory_links
      add constraint memory_links_distinct_nodes
      check (from_memory_id <> to_memory_id);
  end if;
end
$$;

create index if not exists memory_links_from_idx
  on public.memory_links (from_memory_id, link_type, created_at desc);

create index if not exists memory_links_to_idx
  on public.memory_links (to_memory_id, link_type, created_at desc);

create index if not exists memory_links_tenant_client_idx
  on public.memory_links (tenant_id, client_id, created_at desc);

create index if not exists memory_links_source_agent_idx
  on public.memory_links (source_agent, created_at desc);

create table if not exists public.recommendation_outcomes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id text,
  client_id text,
  source_agent text,
  memory_id uuid references public.ai_memory(id) on delete set null,
  recommendation_id text not null,
  recommendation_type text,
  outcome text not null,
  outcome_score numeric,
  observed_at timestamptz not null default now(),
  notes text,
  meta jsonb not null default '{}'::jsonb
);

alter table public.recommendation_outcomes add column if not exists created_at timestamptz default now();
alter table public.recommendation_outcomes add column if not exists tenant_id text;
alter table public.recommendation_outcomes add column if not exists client_id text;
alter table public.recommendation_outcomes add column if not exists source_agent text;
alter table public.recommendation_outcomes add column if not exists memory_id uuid references public.ai_memory(id) on delete set null;
alter table public.recommendation_outcomes add column if not exists recommendation_id text;
alter table public.recommendation_outcomes add column if not exists recommendation_type text;
alter table public.recommendation_outcomes add column if not exists outcome text;
alter table public.recommendation_outcomes add column if not exists outcome_score numeric;
alter table public.recommendation_outcomes add column if not exists observed_at timestamptz default now();
alter table public.recommendation_outcomes add column if not exists notes text;
alter table public.recommendation_outcomes add column if not exists meta jsonb default '{}'::jsonb;

alter table public.recommendation_outcomes alter column created_at set default now();
alter table public.recommendation_outcomes alter column observed_at set default now();
alter table public.recommendation_outcomes alter column meta set default '{}'::jsonb;

update public.recommendation_outcomes
set created_at = coalesce(created_at, now()),
    observed_at = coalesce(observed_at, created_at, now()),
    meta = coalesce(meta, '{}'::jsonb)
where created_at is null
   or observed_at is null
   or meta is null;

create index if not exists recommendation_outcomes_recommendation_idx
  on public.recommendation_outcomes (recommendation_id, observed_at desc);

create index if not exists recommendation_outcomes_client_idx
  on public.recommendation_outcomes (tenant_id, client_id, observed_at desc);

create index if not exists recommendation_outcomes_memory_idx
  on public.recommendation_outcomes (memory_id, observed_at desc);

create index if not exists recommendation_outcomes_agent_idx
  on public.recommendation_outcomes (source_agent, observed_at desc);

create table if not exists public.task_outcomes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id text,
  client_id text,
  source_agent text,
  memory_id uuid references public.ai_memory(id) on delete set null,
  task_id text not null,
  task_type text,
  outcome text not null,
  outcome_score numeric,
  observed_at timestamptz not null default now(),
  notes text,
  meta jsonb not null default '{}'::jsonb
);

alter table public.task_outcomes add column if not exists created_at timestamptz default now();
alter table public.task_outcomes add column if not exists tenant_id text;
alter table public.task_outcomes add column if not exists client_id text;
alter table public.task_outcomes add column if not exists source_agent text;
alter table public.task_outcomes add column if not exists memory_id uuid references public.ai_memory(id) on delete set null;
alter table public.task_outcomes add column if not exists task_id text;
alter table public.task_outcomes add column if not exists task_type text;
alter table public.task_outcomes add column if not exists outcome text;
alter table public.task_outcomes add column if not exists outcome_score numeric;
alter table public.task_outcomes add column if not exists observed_at timestamptz default now();
alter table public.task_outcomes add column if not exists notes text;
alter table public.task_outcomes add column if not exists meta jsonb default '{}'::jsonb;

alter table public.task_outcomes alter column created_at set default now();
alter table public.task_outcomes alter column observed_at set default now();
alter table public.task_outcomes alter column meta set default '{}'::jsonb;

update public.task_outcomes
set created_at = coalesce(created_at, now()),
    observed_at = coalesce(observed_at, created_at, now()),
    meta = coalesce(meta, '{}'::jsonb)
where created_at is null
   or observed_at is null
   or meta is null;

create index if not exists task_outcomes_task_idx
  on public.task_outcomes (task_id, observed_at desc);

create index if not exists task_outcomes_client_idx
  on public.task_outcomes (tenant_id, client_id, observed_at desc);

create index if not exists task_outcomes_memory_idx
  on public.task_outcomes (memory_id, observed_at desc);

create index if not exists task_outcomes_agent_idx
  on public.task_outcomes (source_agent, observed_at desc);

create table if not exists public.strategy_engagement_outcomes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id text,
  client_id text,
  source_agent text,
  memory_id uuid references public.ai_memory(id) on delete set null,
  strategy_id text not null,
  engagement_type text,
  engagement_value numeric,
  outcome text not null,
  outcome_score numeric,
  observed_at timestamptz not null default now(),
  notes text,
  meta jsonb not null default '{}'::jsonb
);

alter table public.strategy_engagement_outcomes add column if not exists created_at timestamptz default now();
alter table public.strategy_engagement_outcomes add column if not exists tenant_id text;
alter table public.strategy_engagement_outcomes add column if not exists client_id text;
alter table public.strategy_engagement_outcomes add column if not exists source_agent text;
alter table public.strategy_engagement_outcomes add column if not exists memory_id uuid references public.ai_memory(id) on delete set null;
alter table public.strategy_engagement_outcomes add column if not exists strategy_id text;
alter table public.strategy_engagement_outcomes add column if not exists engagement_type text;
alter table public.strategy_engagement_outcomes add column if not exists engagement_value numeric;
alter table public.strategy_engagement_outcomes add column if not exists outcome text;
alter table public.strategy_engagement_outcomes add column if not exists outcome_score numeric;
alter table public.strategy_engagement_outcomes add column if not exists observed_at timestamptz default now();
alter table public.strategy_engagement_outcomes add column if not exists notes text;
alter table public.strategy_engagement_outcomes add column if not exists meta jsonb default '{}'::jsonb;

alter table public.strategy_engagement_outcomes alter column created_at set default now();
alter table public.strategy_engagement_outcomes alter column observed_at set default now();
alter table public.strategy_engagement_outcomes alter column meta set default '{}'::jsonb;

update public.strategy_engagement_outcomes
set created_at = coalesce(created_at, now()),
    observed_at = coalesce(observed_at, created_at, now()),
    meta = coalesce(meta, '{}'::jsonb)
where created_at is null
   or observed_at is null
   or meta is null;

create index if not exists strategy_engagement_outcomes_strategy_idx
  on public.strategy_engagement_outcomes (strategy_id, observed_at desc);

create index if not exists strategy_engagement_outcomes_client_idx
  on public.strategy_engagement_outcomes (tenant_id, client_id, observed_at desc);

create index if not exists strategy_engagement_outcomes_memory_idx
  on public.strategy_engagement_outcomes (memory_id, observed_at desc);

create index if not exists strategy_engagement_outcomes_agent_idx
  on public.strategy_engagement_outcomes (source_agent, observed_at desc);

create table if not exists public.signal_engagement_outcomes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id text,
  client_id text,
  source_agent text,
  memory_id uuid references public.ai_memory(id) on delete set null,
  signal_id text not null,
  engagement_type text,
  engagement_value numeric,
  outcome text not null,
  outcome_score numeric,
  observed_at timestamptz not null default now(),
  notes text,
  meta jsonb not null default '{}'::jsonb
);

alter table public.signal_engagement_outcomes add column if not exists created_at timestamptz default now();
alter table public.signal_engagement_outcomes add column if not exists tenant_id text;
alter table public.signal_engagement_outcomes add column if not exists client_id text;
alter table public.signal_engagement_outcomes add column if not exists source_agent text;
alter table public.signal_engagement_outcomes add column if not exists memory_id uuid references public.ai_memory(id) on delete set null;
alter table public.signal_engagement_outcomes add column if not exists signal_id text;
alter table public.signal_engagement_outcomes add column if not exists engagement_type text;
alter table public.signal_engagement_outcomes add column if not exists engagement_value numeric;
alter table public.signal_engagement_outcomes add column if not exists outcome text;
alter table public.signal_engagement_outcomes add column if not exists outcome_score numeric;
alter table public.signal_engagement_outcomes add column if not exists observed_at timestamptz default now();
alter table public.signal_engagement_outcomes add column if not exists notes text;
alter table public.signal_engagement_outcomes add column if not exists meta jsonb default '{}'::jsonb;

alter table public.signal_engagement_outcomes alter column created_at set default now();
alter table public.signal_engagement_outcomes alter column observed_at set default now();
alter table public.signal_engagement_outcomes alter column meta set default '{}'::jsonb;

update public.signal_engagement_outcomes
set created_at = coalesce(created_at, now()),
    observed_at = coalesce(observed_at, created_at, now()),
    meta = coalesce(meta, '{}'::jsonb)
where created_at is null
   or observed_at is null
   or meta is null;

create index if not exists signal_engagement_outcomes_signal_idx
  on public.signal_engagement_outcomes (signal_id, observed_at desc);

create index if not exists signal_engagement_outcomes_client_idx
  on public.signal_engagement_outcomes (tenant_id, client_id, observed_at desc);

create index if not exists signal_engagement_outcomes_memory_idx
  on public.signal_engagement_outcomes (memory_id, observed_at desc);

create index if not exists signal_engagement_outcomes_agent_idx
  on public.signal_engagement_outcomes (source_agent, observed_at desc);

create table if not exists public.communication_outcomes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id text,
  client_id text,
  source_agent text,
  memory_id uuid references public.ai_memory(id) on delete set null,
  communication_id text not null,
  channel text,
  direction text default 'outbound',
  engagement_type text,
  outcome text not null,
  outcome_score numeric,
  observed_at timestamptz not null default now(),
  notes text,
  meta jsonb not null default '{}'::jsonb
);

alter table public.communication_outcomes add column if not exists created_at timestamptz default now();
alter table public.communication_outcomes add column if not exists tenant_id text;
alter table public.communication_outcomes add column if not exists client_id text;
alter table public.communication_outcomes add column if not exists source_agent text;
alter table public.communication_outcomes add column if not exists memory_id uuid references public.ai_memory(id) on delete set null;
alter table public.communication_outcomes add column if not exists communication_id text;
alter table public.communication_outcomes add column if not exists channel text;
alter table public.communication_outcomes add column if not exists direction text default 'outbound';
alter table public.communication_outcomes add column if not exists engagement_type text;
alter table public.communication_outcomes add column if not exists outcome text;
alter table public.communication_outcomes add column if not exists outcome_score numeric;
alter table public.communication_outcomes add column if not exists observed_at timestamptz default now();
alter table public.communication_outcomes add column if not exists notes text;
alter table public.communication_outcomes add column if not exists meta jsonb default '{}'::jsonb;

alter table public.communication_outcomes alter column created_at set default now();
alter table public.communication_outcomes alter column direction set default 'outbound';
alter table public.communication_outcomes alter column observed_at set default now();
alter table public.communication_outcomes alter column meta set default '{}'::jsonb;

update public.communication_outcomes
set created_at = coalesce(created_at, now()),
    direction = coalesce(nullif(direction, ''), 'outbound'),
    observed_at = coalesce(observed_at, created_at, now()),
    meta = coalesce(meta, '{}'::jsonb)
where created_at is null
   or direction is null
   or direction = ''
   or observed_at is null
   or meta is null;

create index if not exists communication_outcomes_communication_idx
  on public.communication_outcomes (communication_id, observed_at desc);

create index if not exists communication_outcomes_client_idx
  on public.communication_outcomes (tenant_id, client_id, observed_at desc);

create index if not exists communication_outcomes_memory_idx
  on public.communication_outcomes (memory_id, observed_at desc);

create index if not exists communication_outcomes_agent_idx
  on public.communication_outcomes (source_agent, observed_at desc);

commit;