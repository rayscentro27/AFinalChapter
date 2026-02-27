-- Training bundle config storage + idempotent upsert keys.
-- Safe to re-run (IF NOT EXISTS / defensive backfills).

create extension if not exists pgcrypto;
-- ------------------------
-- nexus_config (JSON blob storage)
-- ------------------------
create table if not exists public.nexus_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.nexus_config enable row level security;
-- ------------------------
-- playbooks: deterministic upsert key (slug)
-- ------------------------
alter table public.playbooks
  add column if not exists slug text;
-- Initial slug backfill (title-based)
update public.playbooks
set slug = trim(both '-' from lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g')))
where slug is null or slug = '';
-- Ensure any remaining blanks get a deterministic fallback.
update public.playbooks
set slug = 'playbook-' || substr(id::text, 1, 8)
where slug is null or slug = '';
-- De-dupe slugs deterministically (keep first; suffix the rest by id).
with ranked as (
  select
    id,
    slug,
    row_number() over (partition by slug order by created_at asc, id asc) as rn,
    count(*) over (partition by slug) as cnt
  from public.playbooks
  where slug is not null and slug <> ''
)
update public.playbooks p
set slug = p.slug || '-' || substr(p.id::text, 1, 8)
from ranked r
where p.id = r.id and r.cnt > 1 and r.rn > 1;
create unique index if not exists playbooks_slug_uk
on public.playbooks (slug);
-- ------------------------
-- scenario_packs: deterministic upsert key (title, agent_name)
-- ------------------------
alter table public.scenario_packs
  add column if not exists agent_name text;
-- Backfill agent_name from existing scenarios payload where possible.
update public.scenario_packs
set agent_name = coalesce(
  nullif(agent_name, ''),
  nullif((scenarios->0->>'agent_name'), ''),
  nullif((scenarios->0->>'agent'), ''),
  'unknown-' || substr(id::text, 1, 8)
)
where agent_name is null or agent_name = '';
alter table public.scenario_packs
  alter column agent_name set not null;
create unique index if not exists scenario_packs_title_agent_name_uk
on public.scenario_packs (title, agent_name);
-- ------------------------
-- agents: ensure base_prompt exists (defensive)
-- ------------------------
alter table public.agents
  add column if not exists base_prompt text;
