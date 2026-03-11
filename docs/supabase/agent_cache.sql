-- =========================
-- Agent Response Cache
-- Server-side cache for /.netlify/functions/agent
-- =========================

create extension if not exists pgcrypto;

create table if not exists public.agent_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text unique not null,
  employee text not null,
  user_message text not null,
  context_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_cache_employee_created_at_idx
on public.agent_cache (employee, created_at desc);

alter table public.agent_cache enable row level security;

-- No policies by default.
-- This keeps the cache table inaccessible to normal clients.
-- The Netlify Functions use the service role key (bypasses RLS).
