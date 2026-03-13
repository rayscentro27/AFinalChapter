-- Knowledge Vault core tables for training ingestion.
-- Safe to re-run (uses IF NOT EXISTS + ADD COLUMN IF NOT EXISTS).

create extension if not exists pgcrypto;
-- ------------------------
-- knowledge_docs
-- ------------------------
create table if not exists public.knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  source_type text not null default 'youtube',
  title text not null,
  content text not null,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);
-- Social media support (also used for private video uploads)
alter table public.knowledge_docs
  add column if not exists source_platform text not null default 'youtube',
  add column if not exists media_path text null,
  add column if not exists media_mime text null;
create index if not exists knowledge_docs_created_at_idx
on public.knowledge_docs (created_at desc);
-- ------------------------
-- playbooks
-- ------------------------
create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid references public.knowledge_docs(id) on delete cascade,
  title text not null,
  summary text not null default '',
  rules text[] not null default '{}'::text[],
  checklist text[] not null default '{}'::text[],
  templates jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists playbooks_doc_id_idx
on public.playbooks (doc_id);
-- ------------------------
-- prompt_patches
-- ------------------------
create table if not exists public.prompt_patches (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  doc_id uuid references public.knowledge_docs(id) on delete cascade,
  patch_title text not null,
  patch_text text not null,
  created_at timestamptz not null default now()
);
create index if not exists prompt_patches_agent_name_idx
on public.prompt_patches (agent_name);
create index if not exists prompt_patches_doc_id_idx
on public.prompt_patches (doc_id);
-- ------------------------
-- scenario_packs
-- ------------------------
create table if not exists public.scenario_packs (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid references public.knowledge_docs(id) on delete cascade,
  title text not null,
  scenarios jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists scenario_packs_doc_id_idx
on public.scenario_packs (doc_id);
-- ------------------------
-- RLS (enabled; no policies by default)
-- Server-side access is via service role key.
-- ------------------------
alter table public.knowledge_docs enable row level security;
alter table public.playbooks enable row level security;
alter table public.prompt_patches enable row level security;
alter table public.scenario_packs enable row level security;
