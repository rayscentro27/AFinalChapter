-- AI Employee Training & Workflow System
-- Safe for repeated execution

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
  membership_tier text not null check (membership_tier in ('tier1','tier2','tier3')),
  ssn_last4 text null,
  dob date null,
  employment_status text null,
  annual_income numeric null,
  business_exists boolean not null default false,
  intake_status text not null default 'in_progress',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create index if not exists workflow_cases_tenant_idx
  on public.workflow_cases (tenant_id);

create index if not exists workflow_cases_tenant_contact_idx
  on public.workflow_cases (tenant_id, contact_id);

create index if not exists workflow_cases_tenant_status_idx
  on public.workflow_cases (tenant_id, status, updated_at desc);

create table if not exists public.workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null references public.workflow_cases(id) on delete cascade,
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
  action_type text not null check (action_type in ('checklist_prepared','client_submitted','advisor_reviewed','submitted_confirmation_captured')),
  submitted_by text not null default 'client',
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists funding_application_events_tenant_idx
  on public.funding_application_events (tenant_id);

create index if not exists funding_application_events_tenant_contact_idx
  on public.funding_application_events (tenant_id, contact_id);

create index if not exists funding_application_events_tenant_action_idx
  on public.funding_application_events (tenant_id, action_type, created_at desc);
