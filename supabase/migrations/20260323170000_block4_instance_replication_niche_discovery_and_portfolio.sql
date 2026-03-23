-- Block 4: Instance replication + niche discovery + funnel deployment
-- Revenue orchestration + portfolio + kill/scale engine
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.nexus_instances (
  id uuid primary key default gen_random_uuid(),
  niche text not null,
  display_name text,
  status text default 'testing',
  config jsonb default '{}'::jsonb,
  parent_instance_id uuid references public.nexus_instances(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_instances_niche on public.nexus_instances(niche);
create index if not exists idx_instances_status on public.nexus_instances(status);
create index if not exists idx_instances_created on public.nexus_instances(created_at desc);

create table if not exists public.instance_configs (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.nexus_instances(id) on delete cascade,
  config_key text not null,
  config_value text,
  created_at timestamptz default now(),
  unique(instance_id, config_key)
);

create index if not exists idx_instance_configs_instance on public.instance_configs(instance_id);
create index if not exists idx_instance_configs_key on public.instance_configs(config_key);

create table if not exists public.niche_candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  demand_score numeric default 0,
  competition_score numeric default 0,
  monetization_score numeric default 0,
  total_score numeric default 0,
  status text default 'candidate',
  research_sources jsonb default '[]'::jsonb,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_niches_status on public.niche_candidates(status);
create index if not exists idx_niches_score on public.niche_candidates(total_score desc);

create table if not exists public.funnels (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references public.nexus_instances(id) on delete set null,
  niche text,
  funnel_name text not null,
  funnel_type text default 'lead_gen',
  status text default 'draft',
  config jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_funnels_instance on public.funnels(instance_id);
create index if not exists idx_funnels_niche on public.funnels(niche);
create index if not exists idx_funnels_status on public.funnels(status);
create index if not exists idx_funnels_type on public.funnels(funnel_type);

alter table if exists public.funnel_steps add column if not exists funnel_id uuid references public.funnels(id) on delete cascade;
alter table if exists public.funnel_steps add column if not exists step_name text;
alter table if exists public.funnel_steps add column if not exists step_type text default 'message';
alter table if exists public.funnel_steps add column if not exists content text;
alter table if exists public.funnel_steps add column if not exists config jsonb default '{}'::jsonb;

create unique index if not exists funnel_steps_funnel_order_uq on public.funnel_steps(funnel_id, step_order)
where funnel_id is not null;

create index if not exists idx_funnel_steps_funnel on public.funnel_steps(funnel_id);

create table if not exists public.revenue_streams (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references public.nexus_instances(id) on delete set null,
  stream_type text not null,
  period text not null,
  revenue numeric default 0,
  transactions integer default 0,
  growth_rate numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(instance_id, stream_type, period)
);

create index if not exists idx_revenue_instance on public.revenue_streams(instance_id);
create index if not exists idx_revenue_type on public.revenue_streams(stream_type);
create index if not exists idx_revenue_period on public.revenue_streams(period desc);

create table if not exists public.portfolio_summary (
  id uuid primary key default gen_random_uuid(),
  total_revenue numeric default 0,
  monthly_revenue numeric default 0,
  active_instances integer default 0,
  testing_instances integer default 0,
  scaled_instances integer default 0,
  killed_instances integer default 0,
  top_performers jsonb default '[]'::jsonb,
  underperformers jsonb default '[]'::jsonb,
  snapshot_at timestamptz default now()
);

create index if not exists idx_portfolio_snapshot on public.portfolio_summary(snapshot_at desc);

create table if not exists public.instance_decisions (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.nexus_instances(id) on delete cascade,
  decision text not null,
  reason text,
  confidence numeric default 0.7,
  status text default 'pending',
  executed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_inst_decisions_instance on public.instance_decisions(instance_id);
create index if not exists idx_inst_decisions_status on public.instance_decisions(status);
create index if not exists idx_inst_decisions_decision on public.instance_decisions(decision);
create index if not exists idx_inst_decisions_created on public.instance_decisions(created_at desc);