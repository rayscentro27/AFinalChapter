-- AI Employee Training & Workflow System
-- Safe for repeated execution across mixed legacy schemas

create extension if not exists pgcrypto;
create table if not exists public.ai_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  key text not null,
  display_name text not null,
  tier_access text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table if exists public.ai_roles add column if not exists id uuid default gen_random_uuid();
alter table if exists public.ai_roles add column if not exists tenant_id uuid;
alter table if exists public.ai_roles add column if not exists key text;
alter table if exists public.ai_roles add column if not exists display_name text;
alter table if exists public.ai_roles add column if not exists tier_access text[] default '{}'::text[];
alter table if exists public.ai_roles add column if not exists is_active boolean default true;
alter table if exists public.ai_roles add column if not exists created_at timestamptz default now();
create unique index if not exists ai_roles_tenant_key_uq
  on public.ai_roles (tenant_id, key);
create index if not exists ai_roles_tenant_idx
  on public.ai_roles (tenant_id);
create table if not exists public.ai_playbooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  role_key text not null,
  title text not null,
  version integer not null default 1,
  prompt_template text not null,
  compliance_flags jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table if exists public.ai_playbooks add column if not exists id uuid default gen_random_uuid();
alter table if exists public.ai_playbooks add column if not exists tenant_id uuid;
alter table if exists public.ai_playbooks add column if not exists role_key text;
alter table if exists public.ai_playbooks add column if not exists title text;
alter table if exists public.ai_playbooks add column if not exists version integer default 1;
alter table if exists public.ai_playbooks add column if not exists prompt_template text;
alter table if exists public.ai_playbooks add column if not exists compliance_flags jsonb default '{}'::jsonb;
alter table if exists public.ai_playbooks add column if not exists is_active boolean default true;
alter table if exists public.ai_playbooks add column if not exists created_at timestamptz default now();
create unique index if not exists ai_playbooks_tenant_role_title_version_uq
  on public.ai_playbooks (tenant_id, role_key, title, version);
create index if not exists ai_playbooks_tenant_idx
  on public.ai_playbooks (tenant_id);
create index if not exists ai_playbooks_tenant_role_active_idx
  on public.ai_playbooks (tenant_id, role_key, is_active);
create table if not exists public.client_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contact_id uuid not null,
  membership_tier text not null,
  ssn_last4 text null,
  dob date null,
  employment_status text null,
  annual_income numeric null,
  business_exists boolean not null default false,
  intake_status text not null default 'in_progress',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table if exists public.client_profiles add column if not exists id uuid default gen_random_uuid();
alter table if exists public.client_profiles add column if not exists tenant_id uuid;
alter table if exists public.client_profiles add column if not exists contact_id uuid;
alter table if exists public.client_profiles add column if not exists membership_tier text;
alter table if exists public.client_profiles add column if not exists ssn_last4 text;
alter table if exists public.client_profiles add column if not exists dob date;
alter table if exists public.client_profiles add column if not exists employment_status text;
alter table if exists public.client_profiles add column if not exists annual_income numeric;
alter table if exists public.client_profiles add column if not exists business_exists boolean default false;
alter table if exists public.client_profiles add column if not exists intake_status text default 'in_progress';
alter table if exists public.client_profiles add column if not exists created_at timestamptz default now();
alter table if exists public.client_profiles add column if not exists updated_at timestamptz default now();
create unique index if not exists client_profiles_tenant_contact_uq
  on public.client_profiles (tenant_id, contact_id);
create index if not exists client_profiles_tenant_idx
  on public.client_profiles (tenant_id);
create index if not exists client_profiles_tenant_contact_idx
  on public.client_profiles (tenant_id, contact_id);
create table if not exists public.client_goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contact_id uuid not null,
  target_funding_amount numeric null,
  target_timeline_months integer null,
  funding_purpose text null,
  notes text null,
  created_at timestamptz not null default now()
);
alter table if exists public.client_goals add column if not exists id uuid default gen_random_uuid();
alter table if exists public.client_goals add column if not exists tenant_id uuid;
alter table if exists public.client_goals add column if not exists contact_id uuid;
alter table if exists public.client_goals add column if not exists target_funding_amount numeric;
alter table if exists public.client_goals add column if not exists target_timeline_months integer;
alter table if exists public.client_goals add column if not exists funding_purpose text;
alter table if exists public.client_goals add column if not exists notes text;
alter table if exists public.client_goals add column if not exists created_at timestamptz default now();
create index if not exists client_goals_tenant_idx
  on public.client_goals (tenant_id);
create index if not exists client_goals_tenant_contact_idx
  on public.client_goals (tenant_id, contact_id);
create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contact_id uuid not null,
  doc_type text not null,
  storage_bucket text not null,
  storage_path text not null,
  checksum_sha256 text null,
  pii_level text not null default 'sensitive',
  created_at timestamptz not null default now()
);
alter table if exists public.client_documents add column if not exists id uuid default gen_random_uuid();
alter table if exists public.client_documents add column if not exists tenant_id uuid;
alter table if exists public.client_documents add column if not exists contact_id uuid;
alter table if exists public.client_documents add column if not exists doc_type text;
alter table if exists public.client_documents add column if not exists storage_bucket text;
alter table if exists public.client_documents add column if not exists storage_path text;
alter table if exists public.client_documents add column if not exists checksum_sha256 text;
alter table if exists public.client_documents add column if not exists pii_level text default 'sensitive';
alter table if exists public.client_documents add column if not exists created_at timestamptz default now();
create index if not exists client_documents_tenant_idx
  on public.client_documents (tenant_id);
create index if not exists client_documents_tenant_contact_idx
  on public.client_documents (tenant_id, contact_id);
create table if not exists public.workflow_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contact_id uuid not null,
  current_phase text not null default 'intake',
  current_role_key text null,
  status text not null default 'active',
  risk_level text not null default 'normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table if exists public.workflow_cases add column if not exists id uuid default gen_random_uuid();
alter table if exists public.workflow_cases add column if not exists tenant_id uuid;
alter table if exists public.workflow_cases add column if not exists contact_id uuid;
alter table if exists public.workflow_cases add column if not exists current_phase text default 'intake';
alter table if exists public.workflow_cases add column if not exists current_role_key text;
alter table if exists public.workflow_cases add column if not exists status text default 'active';
alter table if exists public.workflow_cases add column if not exists risk_level text default 'normal';
alter table if exists public.workflow_cases add column if not exists created_at timestamptz default now();
alter table if exists public.workflow_cases add column if not exists updated_at timestamptz default now();
create index if not exists workflow_cases_tenant_idx
  on public.workflow_cases (tenant_id);
create index if not exists workflow_cases_tenant_contact_idx
  on public.workflow_cases (tenant_id, contact_id);
create index if not exists workflow_cases_tenant_status_idx
  on public.workflow_cases (tenant_id, status, updated_at desc);
create table if not exists public.workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null,
  role_key text not null,
  title text not null,
  description text null,
  status text not null default 'todo',
  priority text not null default 'normal',
  due_at timestamptz null,
  assigned_to uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);
alter table if exists public.workflow_tasks add column if not exists id uuid default gen_random_uuid();
alter table if exists public.workflow_tasks add column if not exists tenant_id uuid;
alter table if exists public.workflow_tasks add column if not exists case_id uuid;
alter table if exists public.workflow_tasks add column if not exists role_key text;
alter table if exists public.workflow_tasks add column if not exists title text;
alter table if exists public.workflow_tasks add column if not exists description text;
alter table if exists public.workflow_tasks add column if not exists status text default 'todo';
alter table if exists public.workflow_tasks add column if not exists priority text default 'normal';
alter table if exists public.workflow_tasks add column if not exists due_at timestamptz;
alter table if exists public.workflow_tasks add column if not exists assigned_to uuid;
alter table if exists public.workflow_tasks add column if not exists metadata jsonb default '{}'::jsonb;
alter table if exists public.workflow_tasks add column if not exists created_at timestamptz default now();
alter table if exists public.workflow_tasks add column if not exists completed_at timestamptz;
create index if not exists workflow_tasks_tenant_idx
  on public.workflow_tasks (tenant_id);
create index if not exists workflow_tasks_tenant_case_idx
  on public.workflow_tasks (tenant_id, case_id);
create index if not exists workflow_tasks_tenant_status_idx
  on public.workflow_tasks (tenant_id, status, created_at desc);
create table if not exists public.consent_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contact_id uuid not null,
  consent_type text not null,
  consent_version text not null,
  granted boolean not null,
  captured_via text not null,
  captured_by uuid null,
  captured_at timestamptz not null default now(),
  evidence jsonb null
);
alter table if exists public.consent_logs add column if not exists id uuid default gen_random_uuid();
alter table if exists public.consent_logs add column if not exists tenant_id uuid;
alter table if exists public.consent_logs add column if not exists contact_id uuid;
alter table if exists public.consent_logs add column if not exists consent_type text;
alter table if exists public.consent_logs add column if not exists consent_version text;
alter table if exists public.consent_logs add column if not exists granted boolean;
alter table if exists public.consent_logs add column if not exists captured_via text;
alter table if exists public.consent_logs add column if not exists captured_by uuid;
alter table if exists public.consent_logs add column if not exists captured_at timestamptz default now();
alter table if exists public.consent_logs add column if not exists evidence jsonb;
create index if not exists consent_logs_tenant_idx
  on public.consent_logs (tenant_id);
create index if not exists consent_logs_tenant_contact_idx
  on public.consent_logs (tenant_id, contact_id);
create index if not exists consent_logs_tenant_type_idx
  on public.consent_logs (tenant_id, consent_type, captured_at desc);
create table if not exists public.funding_application_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contact_id uuid not null,
  lender_name text not null,
  action_type text not null,
  submitted_by text not null default 'client',
  notes text null,
  created_at timestamptz not null default now()
);
alter table if exists public.funding_application_events add column if not exists id uuid default gen_random_uuid();
alter table if exists public.funding_application_events add column if not exists tenant_id uuid;
alter table if exists public.funding_application_events add column if not exists contact_id uuid;
alter table if exists public.funding_application_events add column if not exists lender_name text;
alter table if exists public.funding_application_events add column if not exists action_type text;
alter table if exists public.funding_application_events add column if not exists submitted_by text default 'client';
alter table if exists public.funding_application_events add column if not exists notes text;
alter table if exists public.funding_application_events add column if not exists created_at timestamptz default now();
create index if not exists funding_application_events_tenant_idx
  on public.funding_application_events (tenant_id);
create index if not exists funding_application_events_tenant_contact_idx
  on public.funding_application_events (tenant_id, contact_id);
create index if not exists funding_application_events_tenant_action_idx
  on public.funding_application_events (tenant_id, action_type, created_at desc);
