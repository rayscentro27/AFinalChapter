-- supabase_sso.sql
-- Tenant SSO settings + domain allowlist + MFA toggles.

create extension if not exists pgcrypto;

create table if not exists public.tenant_auth_settings (
  tenant_id uuid primary key,
  sso_enabled boolean not null default false,
  allowed_email_domains jsonb not null default '[]'::jsonb,
  require_email_verified boolean not null default true,
  require_mfa_for_admin boolean not null default false,
  require_mfa_for_merge boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenant_auth_settings
  add column if not exists sso_enabled boolean not null default false;

alter table public.tenant_auth_settings
  add column if not exists allowed_email_domains jsonb not null default '[]'::jsonb;

alter table public.tenant_auth_settings
  add column if not exists require_email_verified boolean not null default true;

alter table public.tenant_auth_settings
  add column if not exists require_mfa_for_admin boolean not null default false;

alter table public.tenant_auth_settings
  add column if not exists require_mfa_for_merge boolean not null default true;

alter table public.tenant_auth_settings
  add column if not exists created_at timestamptz not null default now();

alter table public.tenant_auth_settings
  add column if not exists updated_at timestamptz not null default now();
