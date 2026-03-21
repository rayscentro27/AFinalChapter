-- Grants Engine (educational + client-approval driven)
-- No guarantees of grant outcomes. No automatic submission.

create extension if not exists pgcrypto;
create or replace function public.nexus_grants_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  is_admin boolean := false;
begin
  if to_regprocedure('public.nexus_is_super_admin_only()') is not null then
    execute 'select public.nexus_is_super_admin_only()' into is_admin;
    if coalesce(is_admin, false) then
      return true;
    end if;
  end if;

  if to_regprocedure('public.nexus_is_master_admin_compat()') is not null then
    execute 'select public.nexus_is_master_admin_compat()' into is_admin;
    if coalesce(is_admin, false) then
      return true;
    end if;
  end if;

  return lower(coalesce(auth.jwt() ->> 'role', '')) in ('admin', 'super_admin');
end;
$fn$;
create or replace function public.nexus_grants_can_access_tenant(p_tenant_id uuid)
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

  if public.nexus_grants_is_admin() then
    return true;
  end if;

  if to_regprocedure('public.nexus_can_read_tenant(uuid)') is not null then
    execute 'select public.nexus_can_read_tenant($1)' into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
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
create or replace function public.nexus_grants_can_manage_tenant(p_tenant_id uuid)
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

  if public.nexus_grants_is_admin() then
    return true;
  end if;

  if to_regprocedure('public.nexus_can_manage_tenant(uuid)') is not null then
    execute 'select public.nexus_can_manage_tenant($1)' into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
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
grant execute on function public.nexus_grants_is_admin() to authenticated;
grant execute on function public.nexus_grants_can_access_tenant(uuid) to authenticated;
grant execute on function public.nexus_grants_can_manage_tenant(uuid) to authenticated;
create table if not exists public.grants_catalog (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  name text not null,
  sponsor text not null,
  url text,
  geography text[] not null default '{}'::text[],
  industry_tags text[] not null default '{}'::text[],
  eligibility_md text not null,
  award_range_md text,
  deadline_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.grant_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_file_id uuid not null,
  status text not null check (status in ('shortlisted','dismissed','drafting','submitted','awarded','denied')),
  grant_id uuid not null references public.grants_catalog(id) on delete cascade,
  match_score int not null default 0,
  match_reasons jsonb not null default '[]'::jsonb,
  notes_md text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.grant_application_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_file_id uuid not null,
  grant_match_id uuid not null references public.grant_matches(id) on delete cascade,
  status text not null check (status in ('draft','needs_review','approved_to_submit','submitted')),
  draft_md text not null,
  draft_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.grant_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  grant_match_id uuid not null references public.grant_matches(id) on delete cascade,
  submission_method text not null check (submission_method in ('client_self_submit','assisted_submit')),
  submitted_at timestamptz,
  confirmation_ref text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','awarded','denied')),
  payload_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists grants_catalog_active_deadline_idx
  on public.grants_catalog (is_active, deadline_date);
create index if not exists grants_catalog_geo_idx
  on public.grants_catalog using gin (geography);
create index if not exists grants_catalog_tags_idx
  on public.grants_catalog using gin (industry_tags);
create index if not exists grant_matches_tenant_user_status_idx
  on public.grant_matches (tenant_id, user_id, status, created_at desc);
create index if not exists grant_matches_grant_status_idx
  on public.grant_matches (grant_id, status, updated_at desc);
create unique index if not exists grant_matches_unique_client_grant_idx
  on public.grant_matches (tenant_id, user_id, client_file_id, grant_id);
create index if not exists grant_drafts_match_status_idx
  on public.grant_application_drafts (grant_match_id, status, updated_at desc);
create index if not exists grant_submissions_match_status_idx
  on public.grant_submissions (grant_match_id, status, updated_at desc);
create unique index if not exists grant_submissions_unique_match_method_idx
  on public.grant_submissions (grant_match_id, submission_method);
create or replace function public.nexus_grants_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
drop trigger if exists trg_grants_catalog_set_updated_at on public.grants_catalog;
create trigger trg_grants_catalog_set_updated_at
before update on public.grants_catalog
for each row execute procedure public.nexus_grants_set_updated_at();
drop trigger if exists trg_grant_matches_set_updated_at on public.grant_matches;
create trigger trg_grant_matches_set_updated_at
before update on public.grant_matches
for each row execute procedure public.nexus_grants_set_updated_at();
drop trigger if exists trg_grant_application_drafts_set_updated_at on public.grant_application_drafts;
create trigger trg_grant_application_drafts_set_updated_at
before update on public.grant_application_drafts
for each row execute procedure public.nexus_grants_set_updated_at();
drop trigger if exists trg_grant_submissions_set_updated_at on public.grant_submissions;
create trigger trg_grant_submissions_set_updated_at
before update on public.grant_submissions
for each row execute procedure public.nexus_grants_set_updated_at();
alter table public.grants_catalog enable row level security;
alter table public.grant_matches enable row level security;
alter table public.grant_application_drafts enable row level security;
alter table public.grant_submissions enable row level security;
-- grants_catalog: all authenticated users can read active rows; admin can manage.
drop policy if exists grants_catalog_select_active on public.grants_catalog;
create policy grants_catalog_select_active
on public.grants_catalog
for select to authenticated
using (is_active = true or public.nexus_grants_is_admin());
drop policy if exists grants_catalog_admin_insert on public.grants_catalog;
create policy grants_catalog_admin_insert
on public.grants_catalog
for insert to authenticated
with check (public.nexus_grants_is_admin());
drop policy if exists grants_catalog_admin_update on public.grants_catalog;
create policy grants_catalog_admin_update
on public.grants_catalog
for update to authenticated
using (public.nexus_grants_is_admin())
with check (public.nexus_grants_is_admin());
drop policy if exists grants_catalog_admin_delete on public.grants_catalog;
create policy grants_catalog_admin_delete
on public.grants_catalog
for delete to authenticated
using (public.nexus_grants_is_admin());
-- grant_matches
drop policy if exists grant_matches_select_scope on public.grant_matches;
create policy grant_matches_select_scope
on public.grant_matches
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_grants_can_access_tenant(tenant_id)
);
drop policy if exists grant_matches_insert_scope on public.grant_matches;
create policy grant_matches_insert_scope
on public.grant_matches
for insert to authenticated
with check (
  (
    auth.uid() = user_id
    and public.nexus_grants_can_access_tenant(tenant_id)
  )
  or public.nexus_grants_can_manage_tenant(tenant_id)
);
drop policy if exists grant_matches_update_scope on public.grant_matches;
create policy grant_matches_update_scope
on public.grant_matches
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_grants_can_manage_tenant(tenant_id)
)
with check (
  (
    auth.uid() = user_id
    and public.nexus_grants_can_access_tenant(tenant_id)
  )
  or public.nexus_grants_can_manage_tenant(tenant_id)
);
drop policy if exists grant_matches_delete_scope on public.grant_matches;
create policy grant_matches_delete_scope
on public.grant_matches
for delete to authenticated
using (
  auth.uid() = user_id
  or public.nexus_grants_can_manage_tenant(tenant_id)
);
-- grant_application_drafts
drop policy if exists grant_drafts_select_scope on public.grant_application_drafts;
create policy grant_drafts_select_scope
on public.grant_application_drafts
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_grants_can_access_tenant(tenant_id)
);
drop policy if exists grant_drafts_insert_scope on public.grant_application_drafts;
create policy grant_drafts_insert_scope
on public.grant_application_drafts
for insert to authenticated
with check (
  (
    auth.uid() = user_id
    and public.nexus_grants_can_access_tenant(tenant_id)
  )
  or public.nexus_grants_can_manage_tenant(tenant_id)
);
drop policy if exists grant_drafts_update_scope on public.grant_application_drafts;
create policy grant_drafts_update_scope
on public.grant_application_drafts
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_grants_can_manage_tenant(tenant_id)
)
with check (
  (
    auth.uid() = user_id
    and public.nexus_grants_can_access_tenant(tenant_id)
  )
  or public.nexus_grants_can_manage_tenant(tenant_id)
);
drop policy if exists grant_drafts_delete_scope on public.grant_application_drafts;
create policy grant_drafts_delete_scope
on public.grant_application_drafts
for delete to authenticated
using (
  auth.uid() = user_id
  or public.nexus_grants_can_manage_tenant(tenant_id)
);
-- grant_submissions
-- Only client owner or tenant admin can mark submitted/awarded/denied through updates.
drop policy if exists grant_submissions_select_scope on public.grant_submissions;
create policy grant_submissions_select_scope
on public.grant_submissions
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_grants_can_access_tenant(tenant_id)
);
drop policy if exists grant_submissions_insert_scope on public.grant_submissions;
create policy grant_submissions_insert_scope
on public.grant_submissions
for insert to authenticated
with check (
  (
    auth.uid() = user_id
    and public.nexus_grants_can_access_tenant(tenant_id)
  )
  or public.nexus_grants_can_manage_tenant(tenant_id)
);
drop policy if exists grant_submissions_update_scope on public.grant_submissions;
create policy grant_submissions_update_scope
on public.grant_submissions
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_grants_can_manage_tenant(tenant_id)
)
with check (
  (
    auth.uid() = user_id
    and public.nexus_grants_can_access_tenant(tenant_id)
  )
  or public.nexus_grants_can_manage_tenant(tenant_id)
);
drop policy if exists grant_submissions_delete_scope on public.grant_submissions;
create policy grant_submissions_delete_scope
on public.grant_submissions
for delete to authenticated
using (
  auth.uid() = user_id
  or public.nexus_grants_can_manage_tenant(tenant_id)
);
grant select, insert, update, delete on table public.grants_catalog to authenticated, service_role;
grant select, insert, update, delete on table public.grant_matches to authenticated, service_role;
grant select, insert, update, delete on table public.grant_application_drafts to authenticated, service_role;
grant select, insert, update, delete on table public.grant_submissions to authenticated, service_role;
-- Policy key used for authorize_submit approvals.
insert into public.policy_documents (key, title, is_active, require_reaccept_on_publish)
values ('grants_disclaimer', 'Grants Submission Disclaimer', true, false)
on conflict (key) do update
set title = excluded.title,
    is_active = excluded.is_active,
    updated_at = now();
insert into public.policy_versions (
  document_id,
  version,
  content_md,
  content_hash,
  published_at,
  is_published,
  created_at
)
select
  pd.id,
  'v1',
  $$## Grants Educational Disclaimer
All grants information, templates, and matching scores are educational aids.

- No guarantee of eligibility, acceptance, award amount, or timeline.
- Program administrators and sponsors make all final decisions.
- Client decides whether to submit and is responsible for final content accuracy.
- Nexus does not auto-submit grant applications without explicit approval.$$::text,
  encode(extensions.digest($$## Grants Educational Disclaimer
All grants information, templates, and matching scores are educational aids.

- No guarantee of eligibility, acceptance, award amount, or timeline.
- Program administrators and sponsors make all final decisions.
- Client decides whether to submit and is responsible for final content accuracy.
- Nexus does not auto-submit grant applications without explicit approval.$$::text, 'sha256'), 'hex'),
  now(),
  true,
  now()
from public.policy_documents pd
where pd.key = 'grants_disclaimer'
  and not exists (
    select 1
    from public.policy_versions pv
    where pv.document_id = pd.id
      and pv.version = 'v1'
  );
create or replace function public.nexus_grants_latest_policy_version_id(p_key text)
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select pv.id
  from public.policy_documents pd
  join public.policy_versions pv
    on pv.document_id = pd.id
   and pv.is_published = true
  where pd.key = p_key
  order by pv.published_at desc nulls last, pv.created_at desc
  limit 1;
$fn$;
grant execute on function public.nexus_grants_latest_policy_version_id(text) to authenticated;
insert into public.grants_catalog (
  source,
  name,
  sponsor,
  url,
  geography,
  industry_tags,
  eligibility_md,
  award_range_md,
  deadline_date,
  is_active
)
select
  s.source,
  s.name,
  s.sponsor,
  s.url,
  s.geography,
  s.industry_tags,
  s.eligibility_md,
  s.award_range_md,
  s.deadline_date,
  true
from (
  values
    (
      'manual',
      'Community Resilience Micro-Grant (Placeholder)',
      'Regional Development Coalition',
      'https://example.org/grants/community-resilience',
      array['US','AZ','NM']::text[],
      array['services','retail','community']::text[],
      'Educational placeholder: typically requires active small business registration, basic financial statements, and community impact summary.',
      '$5,000 - $25,000',
      (current_date + interval '45 days')::date
    ),
    (
      'partner',
      'Women Founder Expansion Grant (Placeholder)',
      'Founder Equity Network',
      'https://example.org/grants/women-founder-expansion',
      array['US']::text[],
      array['saas','professional_services','healthcare']::text[],
      'Educational placeholder: often targets majority women-owned businesses with 1+ year operating history and growth plan narrative.',
      '$10,000 - $50,000',
      (current_date + interval '30 days')::date
    ),
    (
      'web',
      'Rural Business Innovation Grant (Placeholder)',
      'Innovation Foundation',
      'https://example.org/grants/rural-innovation',
      array['US','CO','UT','WY']::text[],
      array['agriculture','manufacturing','logistics']::text[],
      'Educational placeholder: commonly requests rural location evidence, project timeline, budget, and measurable outcomes.',
      '$15,000 - $75,000',
      (current_date + interval '60 days')::date
    )
) as s(source, name, sponsor, url, geography, industry_tags, eligibility_md, award_range_md, deadline_date)
where not exists (
  select 1
  from public.grants_catalog g
  where lower(g.name) = lower(s.name)
    and lower(g.sponsor) = lower(s.sponsor)
);
