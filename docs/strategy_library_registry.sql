-- Strategy Library Registry (reference SQL)
-- Purpose: provide a master registry of tracked strategies for reporting and operations.
-- This is intentionally add-only and compatible with pre-existing strategy_library tables.

begin;

create extension if not exists pgcrypto;

create table if not exists public.strategy_library (
  id uuid primary key default gen_random_uuid(),
  strategy_id text unique,
  strategy_name text,
  asset_type text,
  description text,
  created_by text,
  status text,
  version text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.strategy_library add column if not exists strategy_id text;
alter table public.strategy_library add column if not exists strategy_name text;
alter table public.strategy_library add column if not exists asset_type text;
alter table public.strategy_library add column if not exists description text;
alter table public.strategy_library add column if not exists created_by text;
alter table public.strategy_library add column if not exists status text;
alter table public.strategy_library add column if not exists version text;
alter table public.strategy_library add column if not exists created_at timestamptz default now();
alter table public.strategy_library add column if not exists updated_at timestamptz default now();

-- Indexes for lookup/filter/sort patterns
create index if not exists strategy_library_asset_type_status_idx
  on public.strategy_library(asset_type, status, updated_at desc);

create index if not exists strategy_library_status_updated_idx
  on public.strategy_library(status, updated_at desc);

create index if not exists strategy_library_created_by_idx
  on public.strategy_library(created_by, updated_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'i'
      and c.relname = 'strategy_library_strategy_id_uniq'
      and n.nspname = 'public'
  ) then
    begin
      create unique index strategy_library_strategy_id_uniq
        on public.strategy_library(strategy_id);
    exception
      when unique_violation then
        raise notice 'strategy_library_strategy_id_uniq not created due to duplicate strategy_id values';
    end;
  end if;
end $$;

commit;
