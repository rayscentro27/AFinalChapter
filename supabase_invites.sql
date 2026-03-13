-- supabase_invites.sql

create extension if not exists pgcrypto;

create table if not exists public.tenant_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  email text not null,
  role_id uuid not null references public.tenant_roles(id),
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  accepted_by uuid null,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create index if not exists tenant_invites_tenant_expires_idx
  on public.tenant_invites (tenant_id, expires_at desc);

create index if not exists tenant_invites_token_hash_idx
  on public.tenant_invites (token_hash);
