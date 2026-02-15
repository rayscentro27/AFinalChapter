-- =========================
-- Knowledge Vault + Distilled Assets
-- (YouTube transcripts -> playbooks -> prompt patches -> scenario packs)
-- =========================

-- Use pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

-- 1) Raw knowledge docs (transcripts, notes)
create table if not exists public.knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  source_type text not null default 'youtube',
  title text not null,
  content text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- One doc per URL (prevents duplicate ingests)
alter table public.knowledge_docs
  drop constraint if exists knowledge_docs_source_url_key;

alter table public.knowledge_docs
  add constraint knowledge_docs_source_url_key unique (source_url);

create index if not exists knowledge_docs_created_at_idx on public.knowledge_docs(created_at desc);
create index if not exists knowledge_docs_content_fts_idx on public.knowledge_docs using gin (to_tsvector('english', content));

-- 2) Distilled playbooks (structured learning output)
create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid references public.knowledge_docs(id) on delete cascade,
  title text not null,
  summary text not null default '',
  rules text[] not null default '{}',
  checklist text[] not null default '{}',
  templates jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists playbooks_created_at_idx on public.playbooks(created_at desc);

-- 3) Prompt patches (transfer into your AI employees)
create table if not exists public.prompt_patches (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  doc_id uuid references public.knowledge_docs(id) on delete cascade,
  patch_title text not null,
  patch_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists prompt_patches_created_at_idx on public.prompt_patches(created_at desc);
create index if not exists prompt_patches_agent_name_idx on public.prompt_patches(agent_name);

-- 4) Scenario packs (training tests)
create table if not exists public.scenario_packs (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid references public.knowledge_docs(id) on delete cascade,
  title text not null,
  scenarios jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scenario_packs_created_at_idx on public.scenario_packs(created_at desc);

-- ---------- RLS (simple) ----------

alter table public.knowledge_docs enable row level security;
alter table public.playbooks enable row level security;
alter table public.prompt_patches enable row level security;
alter table public.scenario_packs enable row level security;

-- IMPORTANT:
-- This allows ANY authenticated user full CRUD.
-- Tighten later (e.g. admin-only) using tenant memberships.
drop policy if exists "auth_all_knowledge_docs" on public.knowledge_docs;
drop policy if exists "auth_all_playbooks" on public.playbooks;
drop policy if exists "auth_all_prompt_patches" on public.prompt_patches;
drop policy if exists "auth_all_scenario_packs" on public.scenario_packs;

create policy "auth_all_knowledge_docs" on public.knowledge_docs
for all to authenticated using (true) with check (true);

create policy "auth_all_playbooks" on public.playbooks
for all to authenticated using (true) with check (true);

create policy "auth_all_prompt_patches" on public.prompt_patches
for all to authenticated using (true) with check (true);

create policy "auth_all_scenario_packs" on public.scenario_packs
for all to authenticated using (true) with check (true);
