-- =========================
-- NEXUS OS TRAINING DB
-- Tables + Views + Grants + RLS
-- =========================

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
-- ---------- TABLES ----------

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  division text not null,
  role text not null,
  status text not null default 'testing' check (status in ('active','testing','disabled')),
  system_prompt text not null default '',
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  agent_id uuid references public.agents(id) on delete set null,
  division text not null,
  difficulty int not null default 2 check (difficulty between 1 and 5),
  user_message text not null,
  expected_behavior text not null default '',
  must_include text[] not null default '{}',
  must_not_say text[] not null default '{}',
  ideal_response text not null default '',
  tags text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mode text not null default 'simulated' check (mode in ('simulated','live')),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.eval_cases (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.eval_runs(id) on delete cascade,
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  agent_id uuid null references public.agents(id) on delete set null,
  agent_output text not null,
  tool_requests jsonb not null default '[]'::jsonb,
  tokens_in int null,
  tokens_out int null,
  latency_ms int null,
  created_at timestamptz not null default now()
);
create table if not exists public.eval_scores (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.eval_cases(id) on delete cascade,

  -- AI suggested scores
  ai_accuracy int not null default 0 check (ai_accuracy between 0 and 5),
  ai_compliance int not null default 0 check (ai_compliance between 0 and 5),
  ai_clarity int not null default 0 check (ai_clarity between 0 and 5),
  ai_routing int not null default 0 check (ai_routing between 0 and 5),
  ai_notes text not null default '',

  -- Human approved scores (nullable until approved)
  human_accuracy int null check (human_accuracy between 0 and 5),
  human_compliance int null check (human_compliance between 0 and 5),
  human_clarity int null check (human_clarity between 0 and 5),
  human_routing int null check (human_routing between 0 and 5),
  human_notes text not null default '',
  approved boolean not null default false,
  approved_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- ---------- VIEWS ----------

create or replace view public.v_case_final_scores as
select
  c.id as case_id,
  c.run_id,
  c.scenario_id,
  c.agent_id,
  c.created_at as case_created_at,
  s.approved,
  coalesce(s.human_accuracy, s.ai_accuracy) as final_accuracy,
  coalesce(s.human_compliance, s.ai_compliance) as final_compliance,
  coalesce(s.human_clarity, s.ai_clarity) as final_clarity,
  coalesce(s.human_routing, s.ai_routing) as final_routing,
  s.ai_notes,
  s.human_notes
from public.eval_cases c
join public.eval_scores s on s.case_id = c.id;
create or replace view public.v_agent_metrics as
select
  a.id as agent_id,
  a.name,
  a.division,
  a.role,
  count(v.case_id) as cases_total,
  avg(v.final_accuracy)::numeric(10,2) as avg_accuracy,
  avg(v.final_compliance)::numeric(10,2) as avg_compliance,
  avg(v.final_clarity)::numeric(10,2) as avg_clarity,
  avg(v.final_routing)::numeric(10,2) as avg_routing,
  avg((v.final_accuracy + v.final_compliance + v.final_clarity + v.final_routing)/4.0)::numeric(10,2) as avg_overall
from public.agents a
left join public.v_case_final_scores v on v.agent_id = a.id
group by a.id, a.name, a.division, a.role;
-- ---------- Grants ----------

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.agents to authenticated;
grant select, insert, update, delete on table public.scenarios to authenticated;
grant select, insert, update, delete on table public.eval_runs to authenticated;
grant select, insert, update, delete on table public.eval_cases to authenticated;
grant select, insert, update, delete on table public.eval_scores to authenticated;
grant select on public.v_case_final_scores to authenticated;
grant select on public.v_agent_metrics to authenticated;
-- ---------- RLS (simple) ----------

alter table public.agents enable row level security;
alter table public.scenarios enable row level security;
alter table public.eval_runs enable row level security;
alter table public.eval_cases enable row level security;
alter table public.eval_scores enable row level security;
-- IMPORTANT:
-- This policy allows ANY authenticated user full CRUD.
-- Tighten later using admin roles.
drop policy if exists "auth_all_agents" on public.agents;
drop policy if exists "auth_all_scenarios" on public.scenarios;
drop policy if exists "auth_all_runs" on public.eval_runs;
drop policy if exists "auth_all_cases" on public.eval_cases;
drop policy if exists "auth_all_scores" on public.eval_scores;
create policy "auth_all_agents" on public.agents
for all to authenticated using (true) with check (true);
create policy "auth_all_scenarios" on public.scenarios
for all to authenticated using (true) with check (true);
create policy "auth_all_runs" on public.eval_runs
for all to authenticated using (true) with check (true);
create policy "auth_all_cases" on public.eval_cases
for all to authenticated using (true) with check (true);
create policy "auth_all_scores" on public.eval_scores
for all to authenticated using (true) with check (true);
