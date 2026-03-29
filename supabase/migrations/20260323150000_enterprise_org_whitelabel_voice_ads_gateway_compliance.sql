-- Enterprise multi-tenant + white-label + voice + ads + API gateway + compliance + audit
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  org_name text not null unique,
  org_type text default 'client',
  status text default 'active',
  owner_email text,
  created_at timestamptz default now()
);

create index if not exists idx_orgs_type on public.organizations(org_type);
create index if not exists idx_orgs_status on public.organizations(status);

insert into public.organizations (org_name, org_type, owner_email)
values ('nexus_internal', 'internal', 'admin@nexus.ai')
on conflict (org_name) do nothing;

create table if not exists public.organization_users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'client',
  status text default 'active',
  created_at timestamptz default now(),
  unique(org_id, user_id)
);

create index if not exists idx_org_users_org on public.organization_users(org_id);
create index if not exists idx_org_users_user on public.organization_users(user_id);
create index if not exists idx_org_users_role on public.organization_users(role);

create table if not exists public.branding_configs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_name text,
  logo_url text,
  primary_color text default '#1a1a2e',
  secondary_color text default '#16213e',
  domain text,
  support_email text,
  telegram_handle text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(org_id)
);

create index if not exists idx_branding_org on public.branding_configs(org_id);

create table if not exists public.org_module_configs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  module_name text not null,
  enabled boolean default true,
  config jsonb default '{}'::jsonb,
  updated_at timestamptz default now(),
  unique(org_id, module_name)
);

create index if not exists idx_module_configs_org on public.org_module_configs(org_id);
create index if not exists idx_module_configs_module on public.org_module_configs(module_name);

create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  lead_id uuid,
  org_id uuid references public.organizations(id) on delete set null,
  call_type text default 'inbound',
  channel text default 'telegram',
  status text default 'open',
  outcome text,
  duration_sec integer default 0,
  started_at timestamptz default now(),
  ended_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_call_sessions_client on public.call_sessions(client_id);
create index if not exists idx_call_sessions_lead on public.call_sessions(lead_id);
create index if not exists idx_call_sessions_status on public.call_sessions(status);
create index if not exists idx_call_sessions_outcome on public.call_sessions(outcome);
create index if not exists idx_call_sessions_created on public.call_sessions(created_at desc);
create index if not exists idx_call_sessions_org on public.call_sessions(org_id);

create table if not exists public.call_transcripts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.call_sessions(id) on delete cascade,
  speaker text not null,
  content text not null,
  turn_order integer not null,
  created_at timestamptz default now()
);

create index if not exists idx_call_transcripts_session on public.call_transcripts(session_id);

create table if not exists public.call_outcomes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.call_sessions(id) on delete cascade,
  outcome_type text not null,
  notes text,
  next_action text,
  follow_up_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_call_outcomes_session on public.call_outcomes(session_id);
create index if not exists idx_call_outcomes_type on public.call_outcomes(outcome_type);

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  campaign_name text not null,
  platform text not null,
  objective text,
  status text default 'draft',
  budget numeric,
  target_audience text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ad_campaigns_org on public.ad_campaigns(org_id);
create index if not exists idx_ad_campaigns_platform on public.ad_campaigns(platform);
create index if not exists idx_ad_campaigns_status on public.ad_campaigns(status);

create table if not exists public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.ad_campaigns(id) on delete cascade,
  creative_type text not null,
  platform text,
  content text not null,
  status text default 'draft',
  performance_score numeric default 0,
  created_at timestamptz default now()
);

create index if not exists idx_ad_creatives_campaign on public.ad_creatives(campaign_id);
create index if not exists idx_ad_creatives_type on public.ad_creatives(creative_type);
create index if not exists idx_ad_creatives_status on public.ad_creatives(status);

alter table if exists public.api_keys add column if not exists org_id uuid references public.organizations(id) on delete set null;
alter table if exists public.api_keys add column if not exists key_prefix text;
alter table if exists public.api_keys add column if not exists label text;
alter table if exists public.api_keys add column if not exists status text default 'active';
alter table if exists public.api_keys add column if not exists last_used_at timestamptz;
alter table if exists public.api_keys add column if not exists expires_at timestamptz;

update public.api_keys
set label = coalesce(label, name),
    status = case when coalesce(is_active, true) then 'active' else 'revoked' end,
    key_prefix = coalesce(key_prefix, substring(key_hash from 1 for 8))
where label is null or status is null or key_prefix is null;

create index if not exists idx_api_keys_org on public.api_keys(org_id);
create index if not exists idx_api_keys_hash on public.api_keys(key_hash);
create index if not exists idx_api_keys_status on public.api_keys(status);

create table if not exists public.api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid references public.api_keys(id),
  org_id uuid references public.organizations(id) on delete set null,
  endpoint text not null,
  method text default 'POST',
  status_code integer,
  response_ms integer,
  created_at timestamptz default now()
);

create index if not exists idx_api_usage_key on public.api_usage_logs(api_key_id);
create index if not exists idx_api_usage_org on public.api_usage_logs(org_id);
create index if not exists idx_api_usage_created on public.api_usage_logs(created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id text,
  actor_type text default 'system',
  action text not null,
  entity_type text,
  entity_id text,
  org_id uuid references public.organizations(id) on delete set null,
  details jsonb default '{}'::jsonb,
  ip_address text,
  created_at timestamptz default now()
);

alter table if exists public.audit_logs add column if not exists actor_id text;
alter table if exists public.audit_logs add column if not exists actor_type text default 'system';
alter table if exists public.audit_logs add column if not exists action text;
alter table if exists public.audit_logs add column if not exists entity_type text;
alter table if exists public.audit_logs add column if not exists entity_id text;
alter table if exists public.audit_logs add column if not exists org_id uuid references public.organizations(id) on delete set null;
alter table if exists public.audit_logs add column if not exists details jsonb default '{}'::jsonb;
alter table if exists public.audit_logs add column if not exists ip_address text;

update public.audit_logs
set details = coalesce(details, meta, '{}'::jsonb)
where details is null;

create index if not exists idx_audit_actor on public.audit_logs(actor_id);
create index if not exists idx_audit_action on public.audit_logs(action);
create index if not exists idx_audit_entity on public.audit_logs(entity_type, entity_id);
create index if not exists idx_audit_org on public.audit_logs(org_id);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

create table if not exists public.compliance_records (
  id uuid primary key default gen_random_uuid(),
  record_type text not null,
  client_id uuid,
  org_id uuid references public.organizations(id) on delete set null,
  content text not null,
  actor_id text,
  acknowledged boolean default false,
  acknowledged_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_compliance_type on public.compliance_records(record_type);
create index if not exists idx_compliance_client on public.compliance_records(client_id);
create index if not exists idx_compliance_org on public.compliance_records(org_id);
create index if not exists idx_compliance_created on public.compliance_records(created_at desc);