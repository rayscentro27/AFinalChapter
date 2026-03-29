-- Document Center: durable generated-document index + approval proofs.

create extension if not exists pgcrypto;
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('credit', 'funding', 'grants', 'sba', 'legal')),
  title text not null,
  status text not null check (status in ('draft', 'needs_review', 'approved', 'finalized', 'mailed', 'archived')),
  source_type text not null check (source_type in ('ai_artifact', 'finalized_letter', 'upload', 'manual')),
  source_id uuid null,
  storage_path text,
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.document_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  approval_type text not null check (approval_type in ('review_ack', 'authorize_submit', 'authorize_mailing')),
  policy_version_id uuid null references public.policy_versions(id) on delete set null,
  approved_at timestamptz not null default now(),
  ip_hash text,
  user_agent text,
  notes text
);
create index if not exists documents_tenant_user_created_idx
  on public.documents (tenant_id, user_id, created_at desc);
create index if not exists documents_user_status_idx
  on public.documents (user_id, status, created_at desc);
create index if not exists documents_category_status_idx
  on public.documents (tenant_id, category, status, created_at desc);
create unique index if not exists documents_source_unique_idx
  on public.documents (source_type, source_id);
create index if not exists document_approvals_doc_approved_idx
  on public.document_approvals (document_id, approved_at desc);
create unique index if not exists document_approvals_unique_per_type_idx
  on public.document_approvals (document_id, user_id, approval_type);
create index if not exists document_approvals_tenant_user_idx
  on public.document_approvals (tenant_id, user_id, approved_at desc);
create or replace function public.nexus_documents_is_super_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if to_regprocedure('public.nexus_is_master_admin_compat()') is not null then
    return public.nexus_is_master_admin_compat();
  end if;

  return lower(coalesce(auth.jwt() ->> 'role', '')) in ('super_admin', 'admin');
end;
$fn$;
create or replace function public.nexus_documents_can_access_tenant(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  allowed boolean := false;
begin
  if p_tenant_id is null then
    return false;
  end if;

  if public.nexus_documents_is_super_admin() then
    return true;
  end if;

  if to_regprocedure('public.nexus_workflow_can_access_tenant(uuid)') is not null then
    execute 'select public.nexus_workflow_can_access_tenant($1)' into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
      )
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
      )
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;
create or replace function public.nexus_documents_can_manage_tenant(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  allowed boolean := false;
begin
  if p_tenant_id is null then
    return false;
  end if;

  if public.nexus_documents_is_super_admin() then
    return true;
  end if;

  if to_regprocedure('public.nexus_workflow_can_manage_tenant(uuid)') is not null then
    execute 'select public.nexus_workflow_can_manage_tenant($1)' into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
          and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'super_admin')
      )
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
          and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'super_admin')
      )
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;
grant execute on function public.nexus_documents_is_super_admin() to authenticated;
grant execute on function public.nexus_documents_can_access_tenant(uuid) to authenticated;
grant execute on function public.nexus_documents_can_manage_tenant(uuid) to authenticated;
create or replace function public.nexus_documents_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
drop trigger if exists trg_documents_set_updated_at on public.documents;
create trigger trg_documents_set_updated_at
before update on public.documents
for each row execute procedure public.nexus_documents_set_updated_at();
create or replace function public.nexus_create_document_from_artifact(
  p_tenant_id uuid,
  p_user_id uuid,
  p_category text,
  p_title text,
  p_status text,
  p_source_type text,
  p_source_id uuid,
  p_storage_path text,
  p_content_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  resolved_category text;
  resolved_status text;
  resolved_source_type text;
  resolved_title text;
  doc_id uuid;
begin
  if p_tenant_id is null or p_user_id is null then
    raise exception 'tenant_id and user_id are required';
  end if;

  resolved_category := lower(coalesce(p_category, 'credit'));
  if resolved_category not in ('credit', 'funding', 'grants', 'sba', 'legal') then
    resolved_category := 'legal';
  end if;

  resolved_status := lower(coalesce(p_status, 'draft'));
  if resolved_status not in ('draft', 'needs_review', 'approved', 'finalized', 'mailed', 'archived') then
    resolved_status := 'draft';
  end if;

  resolved_source_type := lower(coalesce(p_source_type, 'manual'));
  if resolved_source_type not in ('ai_artifact', 'finalized_letter', 'upload', 'manual') then
    resolved_source_type := 'manual';
  end if;

  resolved_title := nullif(trim(coalesce(p_title, '')), '');
  if resolved_title is null then
    resolved_title := initcap(resolved_category) || ' Document';
  end if;

  if p_source_id is not null then
    insert into public.documents (
      tenant_id,
      user_id,
      category,
      title,
      status,
      source_type,
      source_id,
      storage_path,
      content_hash
    )
    values (
      p_tenant_id,
      p_user_id,
      resolved_category,
      resolved_title,
      resolved_status,
      resolved_source_type,
      p_source_id,
      p_storage_path,
      p_content_hash
    )
    on conflict (source_type, source_id)
    do update
      set tenant_id = excluded.tenant_id,
          user_id = excluded.user_id,
          category = excluded.category,
          title = excluded.title,
          status = excluded.status,
          storage_path = excluded.storage_path,
          content_hash = excluded.content_hash,
          updated_at = now()
    returning id into doc_id;

    return doc_id;
  end if;

  insert into public.documents (
    tenant_id,
    user_id,
    category,
    title,
    status,
    source_type,
    source_id,
    storage_path,
    content_hash
  )
  values (
    p_tenant_id,
    p_user_id,
    resolved_category,
    resolved_title,
    resolved_status,
    resolved_source_type,
    null,
    p_storage_path,
    p_content_hash
  )
  returning id into doc_id;

  return doc_id;
end;
$fn$;
grant execute on function public.nexus_create_document_from_artifact(uuid, uuid, text, text, text, text, uuid, text, text)
  to authenticated, service_role;
create or replace function public.nexus_documents_from_finalized_letter()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  title_text text;
begin
  title_text := format('Dispute Letter - %s', upper(coalesce(new.bureau, 'credit')));

  perform public.nexus_create_document_from_artifact(
    new.tenant_id,
    new.user_id,
    'credit',
    title_text,
    'needs_review',
    'finalized_letter',
    new.id,
    new.final_pdf_path,
    new.final_doc_hash
  );

  return new;
end;
$fn$;
create or replace function public.nexus_documents_from_ai_letter_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  title_text text;
begin
  title_text := format('Dispute Draft - %s', upper(coalesce(new.bureau, 'credit')));

  perform public.nexus_create_document_from_artifact(
    new.tenant_id,
    new.user_id,
    'credit',
    title_text,
    'needs_review',
    'ai_artifact',
    new.id,
    null,
    null
  );

  return new;
end;
$fn$;
create or replace function public.nexus_documents_from_ai_artifact()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  payload jsonb;
  artifact_type text;
  artifact_title text;
  artifact_status text;
  artifact_category text;
  artifact_storage_path text;
  artifact_hash text;
  artifact_id uuid;
  tenant_id uuid;
  user_id uuid;
begin
  payload := to_jsonb(new);

  begin
    artifact_id := nullif(payload ->> 'id', '')::uuid;
  exception when others then
    artifact_id := null;
  end;

  begin
    tenant_id := nullif(payload ->> 'tenant_id', '')::uuid;
  exception when others then
    tenant_id := null;
  end;

  begin
    user_id := nullif(payload ->> 'user_id', '')::uuid;
  exception when others then
    user_id := null;
  end;

  if tenant_id is null or user_id is null then
    return new;
  end if;

  artifact_type := lower(coalesce(payload ->> 'artifact_type', payload ->> 'type', payload ->> 'key', 'artifact'));
  artifact_title := coalesce(payload ->> 'title', payload ->> 'name', initcap(replace(artifact_type, '_', ' ')));
  artifact_storage_path := coalesce(payload ->> 'storage_path', payload ->> 'path', payload ->> 'file_path');
  artifact_hash := coalesce(payload ->> 'content_hash', payload ->> 'hash_sha256', payload ->> 'checksum_sha256');
  artifact_status := lower(coalesce(payload ->> 'status', ''));

  artifact_category := case
    when artifact_type like '%grant%' then 'grants'
    when artifact_type like '%sba%' then 'sba'
    when artifact_type like '%fund%' or artifact_type like '%bank%' then 'funding'
    when artifact_type like '%dispute%' or artifact_type like '%credit%' then 'credit'
    else 'legal'
  end;

  if artifact_status not in ('draft', 'needs_review', 'approved', 'finalized', 'mailed', 'archived') then
    artifact_status := case
      when artifact_type like '%grant%' or artifact_type like '%dispute%' or artifact_type like '%letter%' then 'needs_review'
      else 'draft'
    end;
  end if;

  perform public.nexus_create_document_from_artifact(
    tenant_id,
    user_id,
    artifact_category,
    artifact_title,
    artifact_status,
    'ai_artifact',
    artifact_id,
    artifact_storage_path,
    artifact_hash
  );

  return new;
end;
$fn$;
create or replace function public.nexus_documents_mark_mailed_from_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if lower(coalesce(new.status, '')) <> 'sent' then
    return new;
  end if;

  update public.documents d
    set status = 'mailed',
        updated_at = now()
  where d.source_type = 'finalized_letter'
    and d.source_id in (
      select fl.id
      from public.finalized_letters fl
      where fl.dispute_packet_id = new.dispute_packet_id
    );

  return new;
end;
$fn$;
create or replace function public.nexus_document_approvals_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if lower(coalesce(new.approval_type, '')) in ('review_ack', 'authorize_submit', 'authorize_mailing') then
    update public.documents d
      set status = case
        when d.status in ('draft', 'needs_review') then 'approved'
        else d.status
      end,
      updated_at = now()
    where d.id = new.document_id
      and d.tenant_id = new.tenant_id;
  end if;

  begin
    insert into public.audit_events (
      tenant_id,
      actor_user_id,
      event_type,
      metadata
    )
    values (
      new.tenant_id,
      new.user_id,
      'DOCUMENT_APPROVAL',
      jsonb_build_object(
        'document_id', new.document_id,
        'approval_id', new.id,
        'approval_type', new.approval_type,
        'policy_version_id', new.policy_version_id,
        'notes', new.notes
      )
    );
  exception
    when undefined_column then
      insert into public.audit_events (
        tenant_id,
        actor_user_id,
        actor_type,
        action,
        entity_type,
        entity_id,
        metadata
      )
      values (
        new.tenant_id,
        new.user_id,
        'user',
        'DOCUMENT_APPROVAL',
        'document',
        new.document_id::text,
        jsonb_build_object(
          'document_id', new.document_id,
          'approval_id', new.id,
          'approval_type', new.approval_type,
          'policy_version_id', new.policy_version_id,
          'notes', new.notes
        )
      );
  end;

  return new;
end;
$fn$;
drop trigger if exists trg_finalized_letters_documents on public.finalized_letters;
create trigger trg_finalized_letters_documents
after insert on public.finalized_letters
for each row execute procedure public.nexus_documents_from_finalized_letter();
drop trigger if exists trg_ai_letter_drafts_documents on public.ai_letter_drafts;
create trigger trg_ai_letter_drafts_documents
after insert on public.ai_letter_drafts
for each row execute procedure public.nexus_documents_from_ai_letter_draft();
drop trigger if exists trg_mailing_events_documents_status on public.mailing_events;
create trigger trg_mailing_events_documents_status
after insert or update of status on public.mailing_events
for each row execute procedure public.nexus_documents_mark_mailed_from_event();
drop trigger if exists trg_document_approvals_after_insert on public.document_approvals;
create trigger trg_document_approvals_after_insert
after insert on public.document_approvals
for each row execute procedure public.nexus_document_approvals_after_insert();
-- Optional integration for existing ai_artifacts table in environments where Prompt 10 created it.
do $do$
begin
  if to_regclass('public.ai_artifacts') is not null then
    execute 'drop trigger if exists trg_ai_artifacts_documents on public.ai_artifacts';
    execute 'create trigger trg_ai_artifacts_documents after insert on public.ai_artifacts for each row execute procedure public.nexus_documents_from_ai_artifact()';
  end if;
end;
$do$;
alter table public.documents enable row level security;
alter table public.document_approvals enable row level security;
drop policy if exists documents_select_access on public.documents;
create policy documents_select_access
on public.documents
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_documents_can_access_tenant(tenant_id)
);
drop policy if exists documents_insert_access on public.documents;
create policy documents_insert_access
on public.documents
for insert to authenticated
with check (
  (
    auth.uid() = user_id
    and public.nexus_documents_can_access_tenant(tenant_id)
  )
  or public.nexus_documents_can_manage_tenant(tenant_id)
);
drop policy if exists documents_update_access on public.documents;
create policy documents_update_access
on public.documents
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_documents_can_manage_tenant(tenant_id)
)
with check (
  auth.uid() = user_id
  or public.nexus_documents_can_manage_tenant(tenant_id)
);
drop policy if exists documents_delete_access on public.documents;
create policy documents_delete_access
on public.documents
for delete to authenticated
using (
  auth.uid() = user_id
  or public.nexus_documents_can_manage_tenant(tenant_id)
);
drop policy if exists document_approvals_select_access on public.document_approvals;
create policy document_approvals_select_access
on public.document_approvals
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_documents_can_access_tenant(tenant_id)
);
drop policy if exists document_approvals_insert_access on public.document_approvals;
create policy document_approvals_insert_access
on public.document_approvals
for insert to authenticated
with check (
  (
    auth.uid() = user_id
    and exists (
      select 1
      from public.documents d
      where d.id = document_approvals.document_id
        and d.tenant_id = document_approvals.tenant_id
        and d.user_id = auth.uid()
    )
  )
  or public.nexus_documents_can_manage_tenant(tenant_id)
);
drop policy if exists document_approvals_update_manage on public.document_approvals;
create policy document_approvals_update_manage
on public.document_approvals
for update to authenticated
using (public.nexus_documents_can_manage_tenant(tenant_id))
with check (public.nexus_documents_can_manage_tenant(tenant_id));
drop policy if exists document_approvals_delete_manage on public.document_approvals;
create policy document_approvals_delete_manage
on public.document_approvals
for delete to authenticated
using (public.nexus_documents_can_manage_tenant(tenant_id));
grant select, insert, update, delete on table public.documents to authenticated, service_role;
grant select, insert, update, delete on table public.document_approvals to authenticated, service_role;
-- Backfill finalized letters into Document Center.
insert into public.documents (
  tenant_id,
  user_id,
  category,
  title,
  status,
  source_type,
  source_id,
  storage_path,
  content_hash
)
select
  fl.tenant_id,
  fl.user_id,
  'credit',
  format('Dispute Letter - %s', upper(coalesce(fl.bureau, 'credit'))),
  case
    when exists (
      select 1
      from public.mailing_events me
      where me.dispute_packet_id = fl.dispute_packet_id
        and lower(coalesce(me.status, '')) = 'sent'
    ) then 'mailed'
    else 'needs_review'
  end,
  'finalized_letter',
  fl.id,
  fl.final_pdf_path,
  fl.final_doc_hash
from public.finalized_letters fl
on conflict (source_type, source_id)
do update
  set status = excluded.status,
      storage_path = excluded.storage_path,
      content_hash = excluded.content_hash,
      updated_at = now();
-- Backfill AI dispute drafts as review-required artifacts.
insert into public.documents (
  tenant_id,
  user_id,
  category,
  title,
  status,
  source_type,
  source_id,
  storage_path,
  content_hash
)
select
  ad.tenant_id,
  ad.user_id,
  'credit',
  format('Dispute Draft - %s', upper(coalesce(ad.bureau, 'credit'))),
  'needs_review',
  'ai_artifact',
  ad.id,
  null,
  null
from public.ai_letter_drafts ad
on conflict (source_type, source_id)
do update
  set title = excluded.title,
      status = excluded.status,
      updated_at = now();
-- Backfill ai_artifacts (if table exists) without hard-coding column names.
do $do$
begin
  if to_regclass('public.ai_artifacts') is not null then
    execute $sql$
      insert into public.documents (
        tenant_id,
        user_id,
        category,
        title,
        status,
        source_type,
        source_id,
        storage_path,
        content_hash
      )
      select
        nullif(to_jsonb(a) ->> 'tenant_id', '')::uuid,
        nullif(to_jsonb(a) ->> 'user_id', '')::uuid,
        case
          when lower(coalesce(to_jsonb(a) ->> 'artifact_type', to_jsonb(a) ->> 'type', to_jsonb(a) ->> 'key', '')) like '%grant%' then 'grants'
          when lower(coalesce(to_jsonb(a) ->> 'artifact_type', to_jsonb(a) ->> 'type', to_jsonb(a) ->> 'key', '')) like '%sba%' then 'sba'
          when lower(coalesce(to_jsonb(a) ->> 'artifact_type', to_jsonb(a) ->> 'type', to_jsonb(a) ->> 'key', '')) like '%fund%'
            or lower(coalesce(to_jsonb(a) ->> 'artifact_type', to_jsonb(a) ->> 'type', to_jsonb(a) ->> 'key', '')) like '%bank%' then 'funding'
          when lower(coalesce(to_jsonb(a) ->> 'artifact_type', to_jsonb(a) ->> 'type', to_jsonb(a) ->> 'key', '')) like '%dispute%'
            or lower(coalesce(to_jsonb(a) ->> 'artifact_type', to_jsonb(a) ->> 'type', to_jsonb(a) ->> 'key', '')) like '%credit%' then 'credit'
          else 'legal'
        end,
        coalesce(to_jsonb(a) ->> 'title', to_jsonb(a) ->> 'name', 'AI Artifact'),
        case
          when lower(coalesce(to_jsonb(a) ->> 'status', '')) in ('draft', 'needs_review', 'approved', 'finalized', 'mailed', 'archived')
            then lower(to_jsonb(a) ->> 'status')
          when lower(coalesce(to_jsonb(a) ->> 'artifact_type', to_jsonb(a) ->> 'type', to_jsonb(a) ->> 'key', '')) like '%grant%'
            or lower(coalesce(to_jsonb(a) ->> 'artifact_type', to_jsonb(a) ->> 'type', to_jsonb(a) ->> 'key', '')) like '%dispute%'
            or lower(coalesce(to_jsonb(a) ->> 'artifact_type', to_jsonb(a) ->> 'type', to_jsonb(a) ->> 'key', '')) like '%letter%'
            then 'needs_review'
          else 'draft'
        end,
        'ai_artifact',
        nullif(to_jsonb(a) ->> 'id', '')::uuid,
        coalesce(to_jsonb(a) ->> 'storage_path', to_jsonb(a) ->> 'path', to_jsonb(a) ->> 'file_path'),
        coalesce(to_jsonb(a) ->> 'content_hash', to_jsonb(a) ->> 'hash_sha256', to_jsonb(a) ->> 'checksum_sha256')
      from public.ai_artifacts a
      where nullif(to_jsonb(a) ->> 'tenant_id', '') is not null
        and nullif(to_jsonb(a) ->> 'user_id', '') is not null
      on conflict (source_type, source_id)
      do update
        set title = excluded.title,
            status = excluded.status,
            storage_path = excluded.storage_path,
            content_hash = excluded.content_hash,
            updated_at = now()
    $sql$;
  end if;
end;
$do$;
