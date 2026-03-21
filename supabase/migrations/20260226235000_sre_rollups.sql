-- SRE rollups + capacity indexes
-- Safe to run multiple times.

create table if not exists public.sre_rollup_5m (
  id bigserial primary key,
  tenant_id uuid,
  bucket_start timestamptz not null,
  metric text not null,
  value_num numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, bucket_start, metric)
);
create index if not exists sre_rollup_5m_tenant_bucket_idx
  on public.sre_rollup_5m (tenant_id, bucket_start desc);
create index if not exists sre_rollup_5m_metric_bucket_idx
  on public.sre_rollup_5m (metric, bucket_start desc);
create table if not exists public.sre_rollup_1h (
  id bigserial primary key,
  tenant_id uuid,
  bucket_start timestamptz not null,
  metric text not null,
  value_num numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, bucket_start, metric)
);
create index if not exists sre_rollup_1h_tenant_bucket_idx
  on public.sre_rollup_1h (tenant_id, bucket_start desc);
create index if not exists sre_rollup_1h_metric_bucket_idx
  on public.sre_rollup_1h (metric, bucket_start desc);
-- Capacity/performance indexes

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'tenant_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'contact_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'received_at'
  ) then
    create index if not exists messages_tenant_contact_received_at_idx
      on public.messages (tenant_id, contact_id, received_at desc);
  end if;
end $$;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'webhook_events'
      and column_name = 'tenant_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'webhook_events'
      and column_name = 'provider'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'webhook_events'
      and column_name = 'received_at'
  ) then
    create index if not exists webhook_events_tenant_provider_received_at_idx
      on public.webhook_events (tenant_id, provider, received_at desc);
  end if;
end $$;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'outbox_messages'
      and column_name = 'tenant_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'outbox_messages'
      and column_name = 'status'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'outbox_messages'
      and column_name = 'next_attempt_at'
  ) then
    create index if not exists outbox_messages_tenant_status_next_attempt_at_idx
      on public.outbox_messages (tenant_id, status, next_attempt_at);
  end if;
end $$;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'message_delivery_events'
      and column_name = 'tenant_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'message_delivery_events'
      and column_name = 'provider'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'message_delivery_events'
      and column_name = 'status'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'message_delivery_events'
      and column_name = 'occurred_at'
  ) then
    create index if not exists message_delivery_events_tenant_provider_status_occurred_at_idx
      on public.message_delivery_events (tenant_id, provider, status, occurred_at desc);
  end if;
end $$;
