-- Agent prompt version history + consolidation metadata.
-- Safe to re-run.

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
-- Store a clean baseline prompt after consolidation.
alter table public.agents
  add column if not exists base_prompt text,
  add column if not exists consolidated_at timestamptz;
create table if not exists public.agent_prompt_history (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  prompt_version int not null,
  system_prompt text not null,
  created_at timestamptz not null default now()
);
-- One snapshot per agent/version.
create unique index if not exists agent_prompt_history_agent_version_uk
on public.agent_prompt_history(agent_id, prompt_version);
create index if not exists agent_prompt_history_agent_version_idx
on public.agent_prompt_history(agent_id, prompt_version desc);
alter table public.agent_prompt_history enable row level security;
-- Default to no public policies; use service role via Netlify Functions.

-- Patch workflow metadata.
alter table public.prompt_patches
  add column if not exists approved boolean not null default false,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists applied_at timestamptz,
  add column if not exists applied_agent_version int,
  add column if not exists apply_error text;
