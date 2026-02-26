-- AI funding submission guardrails
-- Safe for repeated execution

alter table if exists public.funding_application_events
  add column if not exists client_device_confirmed boolean not null default false;

alter table if exists public.funding_application_events
  add column if not exists confirmation_method text null;

alter table if exists public.funding_application_events
  add column if not exists confirmation_metadata jsonb null;

alter table if exists public.funding_application_events
  add column if not exists captured_by uuid null;

create index if not exists funding_application_events_tenant_confirmed_idx
  on public.funding_application_events (tenant_id, client_device_confirmed, created_at desc);

create index if not exists funding_application_events_tenant_lender_action_idx
  on public.funding_application_events (tenant_id, lender_name, action_type, created_at desc);
