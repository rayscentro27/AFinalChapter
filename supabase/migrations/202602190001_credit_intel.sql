create extension if not exists pgcrypto;
-- -----------------------------
-- Client profiles (minimum fields for credit-intel matching)
-- -----------------------------
create table if not exists public.client_profiles (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,

  status text not null default 'build',
  fico int,
  inquiries_6_12 int,
  inquiries_12_24 int,
  oldest_account_months int,
  total_income_annual numeric,
  case_complexity text not null default 'medium',
  recent_denials boolean not null default false,
  phone_e164 text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (tenant_id, user_id),
  constraint client_profiles_case_complexity_ck
    check (case_complexity in ('low', 'medium', 'high')),
  constraint client_profiles_phone_e164_ck
    check (phone_e164 is null or phone_e164 ~ '^\\+[1-9][0-9]{7,14}$')
);
alter table public.client_profiles
  add column if not exists status text not null default 'build',
  add column if not exists fico int,
  add column if not exists inquiries_6_12 int,
  add column if not exists inquiries_12_24 int,
  add column if not exists oldest_account_months int,
  add column if not exists total_income_annual numeric,
  add column if not exists case_complexity text not null default 'medium',
  add column if not exists recent_denials boolean not null default false,
  add column if not exists phone_e164 text,
  add column if not exists updated_at timestamptz not null default now();
create index if not exists client_profiles_tenant_status_idx
on public.client_profiles (tenant_id, status);
create index if not exists client_profiles_tenant_complexity_idx
on public.client_profiles (tenant_id, case_complexity);
alter table public.client_profiles enable row level security;
drop policy if exists client_profiles_select on public.client_profiles;
create policy client_profiles_select on public.client_profiles
for select
using (public.nexus_is_master_admin() or public.nexus_can_access_tenant(tenant_id));
drop policy if exists client_profiles_insert on public.client_profiles;
create policy client_profiles_insert on public.client_profiles
for insert
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));
drop policy if exists client_profiles_update on public.client_profiles;
create policy client_profiles_update on public.client_profiles
for update
using (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id))
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));
drop policy if exists client_profiles_delete on public.client_profiles;
create policy client_profiles_delete on public.client_profiles
for delete
using (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));
-- -----------------------------
-- Client alert preferences (consent + thresholds)
-- -----------------------------
create table if not exists public.client_alert_prefs (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,

  sms_opt_in boolean not null default false,
  phone_e164 text,
  consent_captured_at timestamptz,

  similarity_threshold int not null default 75,
  thresholds jsonb not null default jsonb_build_object(
    'fico_delta', 15,
    'inquiries_6_12_delta', 1,
    'inquiries_12_24_delta', 2,
    'oldest_account_months_delta', 24,
    'income_min_ratio', 0.8,
    'actionable_similarity_min', 75
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (tenant_id, user_id),
  constraint client_alert_prefs_similarity_ck
    check (similarity_threshold >= 0 and similarity_threshold <= 100),
  constraint client_alert_prefs_phone_e164_ck
    check (phone_e164 is null or phone_e164 ~ '^\\+[1-9][0-9]{7,14}$')
);
create index if not exists client_alert_prefs_tenant_optin_idx
on public.client_alert_prefs (tenant_id, sms_opt_in);
alter table public.client_alert_prefs enable row level security;
drop policy if exists client_alert_prefs_select on public.client_alert_prefs;
create policy client_alert_prefs_select on public.client_alert_prefs
for select
using (public.nexus_is_master_admin() or public.nexus_can_access_tenant(tenant_id));
drop policy if exists client_alert_prefs_insert on public.client_alert_prefs;
create policy client_alert_prefs_insert on public.client_alert_prefs
for insert
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));
drop policy if exists client_alert_prefs_update on public.client_alert_prefs;
create policy client_alert_prefs_update on public.client_alert_prefs
for update
using (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id))
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));
-- -----------------------------
-- Verified manual datapoints (Option B)
-- -----------------------------
create table if not exists public.credit_intel_datapoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by_user_id uuid not null,

  source_name text not null,
  source_type text,
  community_context text,

  profile_signals jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,

  screenshot_urls text[] not null default '{}'::text[],
  screenshot_verified boolean not null default true,
  redaction_confirmed boolean not null default true,
  manual_entry boolean not null default true,
  verification_notes text not null default '',

  reported_at timestamptz,
  expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint credit_intel_datapoints_verified_ck
    check (screenshot_verified = true and redaction_confirmed = true),
  constraint credit_intel_datapoints_manual_only_ck
    check (manual_entry = true)
);
create index if not exists credit_intel_datapoints_tenant_created_idx
on public.credit_intel_datapoints (tenant_id, created_at desc);
create index if not exists credit_intel_datapoints_tenant_verified_idx
on public.credit_intel_datapoints (tenant_id, screenshot_verified, redaction_confirmed);
alter table public.credit_intel_datapoints enable row level security;
drop policy if exists credit_intel_datapoints_select on public.credit_intel_datapoints;
create policy credit_intel_datapoints_select on public.credit_intel_datapoints
for select
using (public.nexus_is_master_admin() or public.nexus_can_access_tenant(tenant_id));
drop policy if exists credit_intel_datapoints_insert on public.credit_intel_datapoints;
create policy credit_intel_datapoints_insert on public.credit_intel_datapoints
for insert
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));
drop policy if exists credit_intel_datapoints_update on public.credit_intel_datapoints;
create policy credit_intel_datapoints_update on public.credit_intel_datapoints
for update
using (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id))
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));
-- -----------------------------
-- Matches + alert history
-- -----------------------------
create table if not exists public.credit_intel_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  datapoint_id uuid not null references public.credit_intel_datapoints(id) on delete cascade,
  user_id uuid not null,

  similarity_score numeric(5,2) not null default 0,
  status text not null default 'candidate' check (
    status in ('candidate', 'alerted', 'suppressed', 'blocked_human_review', 'reviewed')
  ),

  thresholds_used jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,

  high_risk_gate boolean not null default false,
  human_review_required boolean not null default false,

  alert_sent boolean not null default false,
  alert_channel text not null default 'sms',
  alert_message text,
  twilio_sid text,
  alerted_at timestamptz,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint credit_intel_matches_unique unique (tenant_id, datapoint_id, user_id)
);
create index if not exists credit_intel_matches_tenant_status_idx
on public.credit_intel_matches (tenant_id, status, created_at desc);
create index if not exists credit_intel_matches_tenant_user_idx
on public.credit_intel_matches (tenant_id, user_id, created_at desc);
alter table public.credit_intel_matches enable row level security;
drop policy if exists credit_intel_matches_select on public.credit_intel_matches;
create policy credit_intel_matches_select on public.credit_intel_matches
for select
using (public.nexus_is_master_admin() or public.nexus_can_access_tenant(tenant_id));
drop policy if exists credit_intel_matches_insert on public.credit_intel_matches;
create policy credit_intel_matches_insert on public.credit_intel_matches
for insert
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));
drop policy if exists credit_intel_matches_update on public.credit_intel_matches;
create policy credit_intel_matches_update on public.credit_intel_matches
for update
using (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id))
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));
-- -----------------------------
-- updated_at trigger helper
-- -----------------------------
create or replace function public.credit_intel_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_client_profiles_updated_at on public.client_profiles;
create trigger trg_client_profiles_updated_at
before update on public.client_profiles
for each row execute function public.credit_intel_touch_updated_at();
drop trigger if exists trg_client_alert_prefs_updated_at on public.client_alert_prefs;
create trigger trg_client_alert_prefs_updated_at
before update on public.client_alert_prefs
for each row execute function public.credit_intel_touch_updated_at();
drop trigger if exists trg_credit_intel_datapoints_updated_at on public.credit_intel_datapoints;
create trigger trg_credit_intel_datapoints_updated_at
before update on public.credit_intel_datapoints
for each row execute function public.credit_intel_touch_updated_at();
drop trigger if exists trg_credit_intel_matches_updated_at on public.credit_intel_matches;
create trigger trg_credit_intel_matches_updated_at
before update on public.credit_intel_matches
for each row execute function public.credit_intel_touch_updated_at();
