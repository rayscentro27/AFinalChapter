-- Circuit breaker schema for provider/channel health (safe to re-run)

alter table if exists public.channel_accounts
  add column if not exists health_status text,
  add column if not exists health_fail_count int,
  add column if not exists health_first_fail_at timestamptz,
  add column if not exists health_last_fail_at timestamptz,
  add column if not exists health_last_error text,
  add column if not exists health_next_retry_at timestamptz,
  add column if not exists health_last_changed_at timestamptz;

update public.channel_accounts
set health_status = 'healthy'
where health_status is null;

update public.channel_accounts
set health_fail_count = 0
where health_fail_count is null;

alter table if exists public.channel_accounts
  alter column health_status set default 'healthy',
  alter column health_status set not null,
  alter column health_fail_count set default 0,
  alter column health_fail_count set not null;

create index if not exists channel_accounts_tenant_provider_health_idx
  on public.channel_accounts (tenant_id, provider, health_status);

create index if not exists channel_accounts_tenant_next_retry_idx
  on public.channel_accounts (tenant_id, health_next_retry_at);

create table if not exists public.provider_health_events (
  id bigserial primary key,
  tenant_id uuid not null,
  channel_account_id uuid not null,
  provider text not null,
  severity text not null default 'error',
  occurred_at timestamptz not null default now(),
  error text,
  context jsonb
);

create index if not exists provider_health_events_lookup_idx
  on public.provider_health_events (tenant_id, channel_account_id, occurred_at desc);
