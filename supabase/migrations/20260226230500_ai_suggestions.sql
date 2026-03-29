-- AI-ranked identity and merge suggestions
-- Safe to run multiple times.

create extension if not exists pgcrypto;
create table if not exists public.identity_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  suggestion_type text not null,
  source_contact_id uuid not null,
  target_contact_id uuid not null,
  strength text not null,
  score int not null,
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  acted_at timestamptz,
  acted_by uuid,
  unique (tenant_id, suggestion_type, source_contact_id, target_contact_id)
);
create index if not exists identity_suggestions_tenant_status_created_idx
  on public.identity_suggestions (tenant_id, status, created_at desc);
create index if not exists identity_suggestions_tenant_type_status_idx
  on public.identity_suggestions (tenant_id, suggestion_type, status, score desc, created_at desc);
