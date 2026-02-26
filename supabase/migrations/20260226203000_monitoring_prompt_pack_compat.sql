-- Monitoring prompt-pack compatibility schema
-- Safe for repeated execution

create table if not exists public.service_metrics (
  id bigserial primary key,
  tenant_id uuid null,
  metric text not null,
  value_num numeric not null,
  tags jsonb null,
  occurred_at timestamptz not null default now()
);

create index if not exists service_metrics_metric_occurred_idx
  on public.service_metrics (metric, occurred_at desc);

create index if not exists service_metrics_tenant_metric_occurred_idx
  on public.service_metrics (tenant_id, metric, occurred_at desc);

create table if not exists public.alert_events (
  id bigserial primary key,
  tenant_id uuid null,
  alert_key text not null,
  severity text not null,
  message text not null,
  details jsonb null,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create index if not exists alert_events_status_opened_idx
  on public.alert_events (status, opened_at desc);

create index if not exists alert_events_tenant_alert_opened_idx
  on public.alert_events (tenant_id, alert_key, opened_at desc);

create table if not exists public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  kind text not null,
  destination text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists notification_channels_tenant_kind_active_idx
  on public.notification_channels (tenant_id, kind, is_active);

create table if not exists public.alert_suppressions (
  tenant_id uuid not null,
  alert_key text not null,
  suppressed_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, alert_key)
);

create index if not exists alert_suppressions_tenant_until_idx
  on public.alert_suppressions (tenant_id, suppressed_until);
