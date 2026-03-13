-- Phase 6: AI cache foundation

begin;

create table if not exists public.ai_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null,
  provider text not null,
  model text not null,
  task_type text not null,
  prompt_hash text not null,
  request_fingerprint text not null,
  response_payload jsonb not null default '{}'::jsonb,
  token_usage jsonb not null default '{}'::jsonb,
  cost_estimate numeric(12,6) not null default 0,
  hit_count integer not null default 0,
  source_version text null,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz null,
  expires_at timestamptz null,
  invalidated_at timestamptz null
);

create unique index if not exists ai_cache_cache_key_unique_idx
  on public.ai_cache (cache_key)
  where invalidated_at is null;

create unique index if not exists ai_cache_fingerprint_unique_idx
  on public.ai_cache (provider, model, task_type, request_fingerprint)
  where invalidated_at is null;

create index if not exists ai_cache_task_created_idx
  on public.ai_cache (task_type, created_at desc);

create index if not exists ai_cache_expires_idx
  on public.ai_cache (expires_at)
  where invalidated_at is null;

commit;
