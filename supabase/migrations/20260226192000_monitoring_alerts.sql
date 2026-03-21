-- Monitoring + alerts state for gateway health checks
-- Safe for repeated execution

create table if not exists public.monitoring_alerts (
  id bigserial primary key,
  tenant_id uuid not null,
  alert_key text not null,
  status text not null default 'open',
  severity text not null default 'warning',
  summary text not null default '',
  details jsonb null,
  first_triggered_at timestamptz not null default now(),
  last_triggered_at timestamptz not null default now(),
  last_notified_at timestamptz null,
  occurrences integer not null default 1,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists monitoring_alerts_tenant_alert_key_uq
  on public.monitoring_alerts (tenant_id, alert_key);
create index if not exists monitoring_alerts_tenant_status_triggered_idx
  on public.monitoring_alerts (tenant_id, status, last_triggered_at desc);
create index if not exists monitoring_alerts_tenant_notified_idx
  on public.monitoring_alerts (tenant_id, last_notified_at);
create table if not exists public.monitoring_alert_notifications (
  id bigserial primary key,
  tenant_id uuid not null,
  alert_key text not null,
  status text not null,
  severity text not null,
  summary text not null,
  payload jsonb null,
  delivered boolean not null default false,
  response_code integer null,
  response_body text null,
  error text null,
  created_at timestamptz not null default now()
);
create index if not exists monitoring_alert_notifications_tenant_created_idx
  on public.monitoring_alert_notifications (tenant_id, created_at desc);
create index if not exists monitoring_alert_notifications_tenant_alert_idx
  on public.monitoring_alert_notifications (tenant_id, alert_key, created_at desc);
