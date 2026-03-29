-- Unified Inbox attachments pipeline (safe to re-run)

create extension if not exists pgcrypto;

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contact_id uuid null,
  conversation_id uuid null,
  message_id uuid null,
  storage_bucket text not null,
  storage_path text not null,
  content_type text not null,
  size_bytes int not null,
  sha256 text null,
  created_at timestamptz not null default now()
);

alter table if exists public.attachments
  add column if not exists contact_id uuid,
  add column if not exists conversation_id uuid,
  add column if not exists content_type text,
  add column if not exists sha256 text,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists size_bytes int,
  add column if not exists created_at timestamptz default now();

-- Backfill compatibility with legacy columns.
update public.attachments
set content_type = coalesce(content_type, mime_type, 'application/octet-stream')
where content_type is null;

update public.attachments
set storage_bucket = coalesce(nullif(storage_bucket, ''), 'attachments')
where storage_bucket is null or storage_bucket = '';

update public.attachments
set storage_path = coalesce(storage_path, 'legacy/' || id::text)
where storage_path is null;

update public.attachments
set size_bytes = coalesce(size_bytes, 0)
where size_bytes is null;

alter table if exists public.attachments
  alter column storage_bucket set default 'attachments',
  alter column created_at set default now();

-- Make message_id optional for pre-send uploads.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'attachments'
      and column_name = 'message_id'
      and is_nullable = 'NO'
  ) then
    execute 'alter table public.attachments alter column message_id drop not null';
  end if;
end $$;

-- Legacy schema compatibility: provider was required in earlier attachments schema.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'attachments'
      and column_name = 'provider'
      and is_nullable = 'NO'
  ) then
    execute 'alter table public.attachments alter column provider drop not null';
  end if;
end $$;

alter table if exists public.messages
  add column if not exists attachments jsonb;

update public.messages
set attachments = coalesce(attachments, '[]'::jsonb)
where attachments is null;

create index if not exists attachments_tenant_conversation_created_idx
  on public.attachments (tenant_id, conversation_id, created_at desc);

create index if not exists attachments_tenant_message_idx
  on public.attachments (tenant_id, message_id);

-- Ensure private attachments bucket exists.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf','text/plain']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
