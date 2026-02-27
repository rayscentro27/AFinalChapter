-- Unified Inbox core tables/indexes (idempotent)
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  display_name text,
  primary_email text,
  primary_phone text,
  notes text,
  merged_into_contact_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.contacts
  add column if not exists tenant_id uuid,
  add column if not exists display_name text,
  add column if not exists primary_email text,
  add column if not exists primary_phone text,
  add column if not exists notes text,
  add column if not exists merged_into_contact_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists contacts_tenant_idx
  on public.contacts (tenant_id);

create index if not exists contacts_tenant_merged_idx
  on public.contacts (tenant_id, merged_into_contact_id);

create table if not exists public.contact_identities (
  id bigserial primary key,
  tenant_id uuid not null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  provider text not null,
  identity_type text not null,
  identity_value text not null,
  channel_account_id uuid null references public.channel_accounts(id) on delete set null,
  is_primary boolean not null default false,
  verified boolean not null default false,
  confidence int not null default 50,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists contact_identities_lookup_idx
  on public.contact_identities (tenant_id, provider, identity_type, identity_value);

create index if not exists contact_identities_contact_idx
  on public.contact_identities (tenant_id, contact_id);

create unique index if not exists contact_identities_identity_scope_uq
  on public.contact_identities (
    tenant_id,
    provider,
    identity_type,
    identity_value,
    coalesce(channel_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create table if not exists public.contact_merge_jobs (
  id bigserial primary key,
  tenant_id uuid not null,
  from_contact_id uuid not null references public.contacts(id) on delete cascade,
  into_contact_id uuid not null references public.contacts(id) on delete cascade,
  merged_by uuid null,
  reason text,
  created_at timestamptz not null default now(),
  undone_at timestamptz null,
  undone_by uuid null
);

alter table if exists public.contact_merge_jobs
  add column if not exists tenant_id uuid,
  add column if not exists from_contact_id uuid,
  add column if not exists into_contact_id uuid,
  add column if not exists merged_by uuid,
  add column if not exists reason text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists undone_at timestamptz,
  add column if not exists undone_by uuid;

create index if not exists contact_merge_jobs_tenant_created_idx
  on public.contact_merge_jobs (tenant_id, created_at desc);

create table if not exists public.contact_merge_job_items (
  id bigserial primary key,
  job_id bigint not null references public.contact_merge_jobs(id) on delete cascade,
  tenant_id uuid not null,
  item_type text not null,
  item_id text not null,
  from_contact_id uuid not null references public.contacts(id) on delete cascade,
  into_contact_id uuid not null references public.contacts(id) on delete cascade,
  snapshot jsonb null,
  created_at timestamptz not null default now()
);

alter table if exists public.contact_merge_job_items
  add column if not exists snapshot jsonb;

create index if not exists contact_merge_job_items_job_idx
  on public.contact_merge_job_items (job_id);

create index if not exists contact_merge_job_items_tenant_item_idx
  on public.contact_merge_job_items (tenant_id, item_type, item_id);

create table if not exists public.contact_merge_audit (
  id bigserial primary key,
  tenant_id uuid not null,
  from_contact_id uuid not null references public.contacts(id) on delete cascade,
  into_contact_id uuid not null references public.contacts(id) on delete cascade,
  merged_by uuid null,
  reason text,
  created_at timestamptz not null default now()
);
