-- =========================
-- Scenario Runner
-- Stores pack runs + per-scenario eval results
-- =========================

create extension if not exists pgcrypto;

create table if not exists public.scenario_runs (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid references public.scenario_packs(id) on delete cascade,
  agent_name text not null,
  run_title text not null default '',
  mode text not null default 'simulated' check (mode in ('simulated','live')),
  created_at timestamptz not null default now()
);

create table if not exists public.scenario_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.scenario_runs(id) on delete cascade,
  scenario_index int not null,
  scenario jsonb not null,
  model_output jsonb not null,
  passed boolean not null default false,
  score int not null default 0,
  reasons text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists scenario_runs_pack_id_idx
on public.scenario_runs (pack_id);

create index if not exists scenario_runs_created_at_idx
on public.scenario_runs (created_at desc);

create index if not exists scenario_run_items_run_id_idx
on public.scenario_run_items (run_id);

alter table public.scenario_runs enable row level security;
alter table public.scenario_run_items enable row level security;

-- IMPORTANT:
-- This allows ANY authenticated user full CRUD.
-- Tighten later using tenant roles.
drop policy if exists "auth_all_scenario_runs" on public.scenario_runs;
drop policy if exists "auth_all_scenario_run_items" on public.scenario_run_items;

create policy "auth_all_scenario_runs" on public.scenario_runs
for all to authenticated using (true) with check (true);

create policy "auth_all_scenario_run_items" on public.scenario_run_items
for all to authenticated using (true) with check (true);
