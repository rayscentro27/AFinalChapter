begin;

create extension if not exists pgcrypto;

create table if not exists public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  memory_type text not null,
  subject_id text,
  subject_type text,
  content text not null,
  meta jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  is_active boolean not null default true
);

alter table public.ai_memory add column if not exists created_at timestamptz default now();
alter table public.ai_memory add column if not exists updated_at timestamptz default now();
alter table public.ai_memory add column if not exists memory_type text;
alter table public.ai_memory add column if not exists subject_id text;
alter table public.ai_memory add column if not exists subject_type text;
alter table public.ai_memory add column if not exists content text;
alter table public.ai_memory add column if not exists meta jsonb default '{}'::jsonb;
alter table public.ai_memory add column if not exists expires_at timestamptz;
alter table public.ai_memory add column if not exists is_active boolean default true;

alter table public.ai_memory alter column created_at set default now();
alter table public.ai_memory alter column updated_at set default now();
alter table public.ai_memory alter column meta set default '{}'::jsonb;
alter table public.ai_memory alter column is_active set default true;

update public.ai_memory
set created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now()),
    meta = coalesce(meta, '{}'::jsonb),
    is_active = coalesce(is_active, true)
where created_at is null
   or updated_at is null
   or meta is null
   or is_active is null;

create index if not exists ai_memory_subject_idx
  on public.ai_memory (subject_id, subject_type)
  where is_active = true;

create index if not exists ai_memory_type_active_idx
  on public.ai_memory (memory_type, is_active);

create index if not exists ai_memory_expires_idx
  on public.ai_memory (expires_at)
  where expires_at is not null and is_active = true;

create table if not exists public.outcome_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  source_id text,
  source_type text,
  outcome text not null,
  score_at_time numeric,
  notes text,
  meta jsonb not null default '{}'::jsonb
);

alter table public.outcome_events add column if not exists created_at timestamptz default now();
alter table public.outcome_events add column if not exists event_type text;
alter table public.outcome_events add column if not exists source_id text;
alter table public.outcome_events add column if not exists source_type text;
alter table public.outcome_events add column if not exists outcome text;
alter table public.outcome_events add column if not exists score_at_time numeric;
alter table public.outcome_events add column if not exists notes text;
alter table public.outcome_events add column if not exists meta jsonb default '{}'::jsonb;

alter table public.outcome_events alter column created_at set default now();
alter table public.outcome_events alter column meta set default '{}'::jsonb;

update public.outcome_events
set created_at = coalesce(created_at, now()),
    meta = coalesce(meta, '{}'::jsonb)
where created_at is null
   or meta is null;

create index if not exists outcome_events_source_idx
  on public.outcome_events (source_id, source_type);

create index if not exists outcome_events_type_idx
  on public.outcome_events (event_type);

create index if not exists outcome_events_created_idx
  on public.outcome_events (created_at desc);

create table if not exists public.scoring_weights (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scorer_type text not null,
  dimension text not null,
  weight numeric default 1.0,
  baseline numeric default 1.0,
  adjustment_reason text,
  is_active boolean not null default true,
  unique (scorer_type, dimension)
);

alter table public.scoring_weights add column if not exists created_at timestamptz default now();
alter table public.scoring_weights add column if not exists updated_at timestamptz default now();
alter table public.scoring_weights add column if not exists scorer_type text;
alter table public.scoring_weights add column if not exists dimension text;
alter table public.scoring_weights add column if not exists weight numeric;
alter table public.scoring_weights add column if not exists baseline numeric;
alter table public.scoring_weights add column if not exists adjustment_reason text;
alter table public.scoring_weights add column if not exists is_active boolean default true;

alter table public.scoring_weights alter column created_at set default now();
alter table public.scoring_weights alter column updated_at set default now();
alter table public.scoring_weights alter column weight set default 1.0;
alter table public.scoring_weights alter column baseline set default 1.0;
alter table public.scoring_weights alter column is_active set default true;

update public.scoring_weights
set created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now()),
    weight = coalesce(weight, 1.0),
    baseline = coalesce(baseline, 1.0),
    is_active = coalesce(is_active, true)
where created_at is null
   or updated_at is null
   or weight is null
   or baseline is null
   or is_active is null;

insert into public.scoring_weights (scorer_type, dimension, weight, baseline)
values
  ('signal', 'setup_quality', 1.0, 1.0),
  ('signal', 'risk_quality', 1.0, 1.0),
  ('signal', 'confirmation', 1.0, 1.0),
  ('signal', 'clarity', 1.0, 1.0),
  ('strategy', 'clarity', 1.0, 1.0),
  ('strategy', 'rule_definition', 1.0, 1.0),
  ('strategy', 'risk_explanation', 1.0, 1.0),
  ('strategy', 'structure', 1.0, 1.0),
  ('strategy', 'educational_quality', 1.0, 1.0)
on conflict (scorer_type, dimension) do nothing;

create table if not exists public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  metric_type text not null,
  scorer_type text,
  value numeric,
  sample_count integer,
  meta jsonb not null default '{}'::jsonb
);

alter table public.performance_metrics add column if not exists created_at timestamptz default now();
alter table public.performance_metrics add column if not exists period_start timestamptz;
alter table public.performance_metrics add column if not exists period_end timestamptz;
alter table public.performance_metrics add column if not exists metric_type text;
alter table public.performance_metrics add column if not exists scorer_type text;
alter table public.performance_metrics add column if not exists value numeric;
alter table public.performance_metrics add column if not exists sample_count integer;
alter table public.performance_metrics add column if not exists meta jsonb default '{}'::jsonb;

alter table public.performance_metrics alter column created_at set default now();
alter table public.performance_metrics alter column meta set default '{}'::jsonb;

update public.performance_metrics
set created_at = coalesce(created_at, now()),
    meta = coalesce(meta, '{}'::jsonb)
where created_at is null
   or meta is null;

create index if not exists performance_metrics_type_idx
  on public.performance_metrics (metric_type, scorer_type);

create index if not exists performance_metrics_time_idx
  on public.performance_metrics (created_at desc);

create or replace function public.nexus_ai_memory_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_ai_memory_set_updated_at on public.ai_memory;
create trigger trg_ai_memory_set_updated_at
before update on public.ai_memory
for each row execute procedure public.nexus_ai_memory_set_updated_at();

drop trigger if exists trg_scoring_weights_set_updated_at on public.scoring_weights;
create trigger trg_scoring_weights_set_updated_at
before update on public.scoring_weights
for each row execute procedure public.nexus_ai_memory_set_updated_at();

commit;