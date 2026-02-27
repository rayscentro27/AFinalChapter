-- Agent response cache (server-side)
-- - RLS enabled with no policies (so only service-role / DB owner can access).

create extension if not exists pgcrypto;
create table if not exists public.agent_cache (
  id uuid primary key default gen_random_uuid(),

  -- Stable hash of: employee + model + mode + agent version + context hash + normalized user message.
  cache_key text unique not null,

  employee text not null,
  user_message text not null,
  context_hash text not null,

  -- Store whatever your function returns (e.g. { tool_requests, final_answer, ... }).
  response jsonb not null,

  created_at timestamptz not null default now()
);
create index if not exists agent_cache_employee_idx
on public.agent_cache (employee);
create index if not exists agent_cache_created_at_idx
on public.agent_cache (created_at desc);
alter table public.agent_cache enable row level security;
