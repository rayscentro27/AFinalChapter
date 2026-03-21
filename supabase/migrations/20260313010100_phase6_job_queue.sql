-- Phase 6: queue foundation (job queue)

begin;
create table if not exists public.job_queue (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  tenant_id uuid null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','leased','running','retry_wait','completed','failed','dead_letter','cancelled')),
  priority integer not null default 50,
  available_at timestamptz not null default now(),
  leased_at timestamptz null,
  lease_expires_at timestamptz null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  dedupe_key text null,
  worker_id text null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);
create index if not exists job_queue_status_available_priority_idx
  on public.job_queue (status, available_at, priority desc, created_at asc);
create index if not exists job_queue_worker_status_idx
  on public.job_queue (worker_id, status, leased_at desc);
create index if not exists job_queue_tenant_status_created_idx
  on public.job_queue (tenant_id, status, created_at desc);
create unique index if not exists job_queue_dedupe_key_uniq
  on public.job_queue (dedupe_key)
  where dedupe_key is not null and status in ('pending', 'leased', 'running', 'retry_wait');
commit;
