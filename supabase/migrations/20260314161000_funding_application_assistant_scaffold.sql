-- Phase 1 scaffold: funding profile/application assistant tables (additive)

begin;

create table if not exists public.bank_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  bank_name text not null,
  product_type text not null default 'general',
  rule_key text not null,
  rule_text text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'blocker')),
  source_artifact_id uuid null,
  confidence numeric(6,3) not null default 0.5 check (confidence >= 0 and confidence <= 1),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_rules_tenant_status_idx
  on public.bank_rules (tenant_id, status, updated_at desc);

create index if not exists bank_rules_bank_product_idx
  on public.bank_rules (bank_name, product_type, status);

create table if not exists public.application_guides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_file_id uuid null,
  bank_rule_set_id uuid null,
  title text not null,
  guide_json jsonb not null default '{}'::jsonb,
  guide_md text null,
  status text not null default 'draft' check (status in ('draft', 'under_review', 'approved', 'published', 'archived')),
  generated_by text null,
  reviewed_by uuid null,
  published_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists application_guides_tenant_status_idx
  on public.application_guides (tenant_id, status, updated_at desc);

create index if not exists application_guides_client_file_idx
  on public.application_guides (client_file_id, updated_at desc);

create table if not exists public.funding_profile_patterns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  pattern_type text not null check (pattern_type in ('strength', 'weakness', 'denial_cause', 'consistency_rule')),
  pattern_text text not null,
  evidence_summary text null,
  source_count integer not null default 1,
  confidence numeric(6,3) not null default 0.5 check (confidence >= 0 and confidence <= 1),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists funding_profile_patterns_tenant_status_idx
  on public.funding_profile_patterns (tenant_id, status, updated_at desc);

create index if not exists funding_profile_patterns_type_idx
  on public.funding_profile_patterns (pattern_type, status, confidence desc);

create table if not exists public.funding_profile_assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_file_id uuid null,
  assessment_version text not null default 'v1',
  input_snapshot jsonb not null default '{}'::jsonb,
  assessment_json jsonb not null default '{}'::jsonb,
  score numeric(8,3) null,
  risk_level text null,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'shared')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists funding_profile_assessments_tenant_status_idx
  on public.funding_profile_assessments (tenant_id, status, updated_at desc);

create index if not exists funding_profile_assessments_client_file_idx
  on public.funding_profile_assessments (client_file_id, updated_at desc);

create table if not exists public.application_walkthrough_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  guide_id uuid null,
  asset_type text not null check (asset_type in ('script', 'video', 'checklist')),
  title text not null,
  content_md text null,
  storage_path text null,
  status text not null default 'draft' check (status in ('draft', 'under_review', 'approved', 'published', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists application_walkthrough_assets_tenant_status_idx
  on public.application_walkthrough_assets (tenant_id, status, updated_at desc);

create index if not exists application_walkthrough_assets_guide_idx
  on public.application_walkthrough_assets (guide_id, updated_at desc);

create table if not exists public.funding_assistant_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  actor_user_id uuid null,
  event_type text not null,
  target_type text not null,
  target_id uuid null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists funding_assistant_events_tenant_created_idx
  on public.funding_assistant_events (tenant_id, created_at desc);

create index if not exists funding_assistant_events_type_created_idx
  on public.funding_assistant_events (event_type, created_at desc);

-- updated_at trigger support
drop trigger if exists trg_bank_rules_set_updated_at on public.bank_rules;
create trigger trg_bank_rules_set_updated_at
before update on public.bank_rules
for each row execute function public.set_updated_at();

drop trigger if exists trg_application_guides_set_updated_at on public.application_guides;
create trigger trg_application_guides_set_updated_at
before update on public.application_guides
for each row execute function public.set_updated_at();

drop trigger if exists trg_funding_profile_patterns_set_updated_at on public.funding_profile_patterns;
create trigger trg_funding_profile_patterns_set_updated_at
before update on public.funding_profile_patterns
for each row execute function public.set_updated_at();

drop trigger if exists trg_funding_profile_assessments_set_updated_at on public.funding_profile_assessments;
create trigger trg_funding_profile_assessments_set_updated_at
before update on public.funding_profile_assessments
for each row execute function public.set_updated_at();

drop trigger if exists trg_application_walkthrough_assets_set_updated_at on public.application_walkthrough_assets;
create trigger trg_application_walkthrough_assets_set_updated_at
before update on public.application_walkthrough_assets
for each row execute function public.set_updated_at();

alter table public.bank_rules enable row level security;
alter table public.application_guides enable row level security;
alter table public.funding_profile_patterns enable row level security;
alter table public.funding_profile_assessments enable row level security;
alter table public.application_walkthrough_assets enable row level security;
alter table public.funding_assistant_events enable row level security;

commit;
