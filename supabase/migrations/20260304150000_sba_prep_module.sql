-- SBA Prep module (educational only, no approval/amount guarantees)

create extension if not exists pgcrypto;
create or replace function public.nexus_sba_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  is_admin boolean := false;
begin
  if to_regprocedure('public.nexus_is_master_admin_compat()') is not null then
    execute 'select public.nexus_is_master_admin_compat()' into is_admin;
    if coalesce(is_admin, false) then
      return true;
    end if;
  end if;

  return lower(coalesce(auth.jwt() ->> 'role', '')) in ('admin', 'super_admin');
end;
$fn$;
create or replace function public.nexus_sba_can_access_tenant(p_tenant_id uuid)
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

  if public.nexus_sba_is_admin() then
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
create or replace function public.nexus_sba_can_manage_tenant(p_tenant_id uuid)
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

  if public.nexus_sba_is_admin() then
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
create or replace function public.nexus_sba_user_has_premium(p_user_id uuid, p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = p_user_id
      and (p_tenant_id is null or s.tenant_id = p_tenant_id)
      and lower(coalesce(s.tier::text, s.plan_code::text)) = 'premium'
      and lower(coalesce(s.status::text, '')) in ('active', 'trialing')
    order by s.updated_at desc
    limit 1
  );
$fn$;
grant execute on function public.nexus_sba_is_admin() to authenticated;
grant execute on function public.nexus_sba_can_access_tenant(uuid) to authenticated;
grant execute on function public.nexus_sba_can_manage_tenant(uuid) to authenticated;
grant execute on function public.nexus_sba_user_has_premium(uuid, uuid) to authenticated;
create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null default 'documents',
  object_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index if not exists uploads_tenant_user_created_idx
  on public.uploads (tenant_id, user_id, created_at desc);
create unique index if not exists uploads_bucket_path_uidx
  on public.uploads (bucket, object_path);
create table if not exists public.sba_prep_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_file_id uuid not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'ready_to_apply', 'archived')),
  target_amount_cents int null check (target_amount_cents is null or target_amount_cents >= 0),
  target_timeline_months int null check (target_timeline_months is null or target_timeline_months between 1 and 24),
  readiness_score int not null default 0 check (readiness_score between 0 and 100),
  milestones jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.sba_documents_required (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  description_md text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.sba_document_links (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.sba_prep_plans(id) on delete cascade,
  required_doc_key text not null references public.sba_documents_required(key) on delete restrict,
  upload_id uuid null references public.uploads(id) on delete set null,
  status text not null default 'missing' check (status in ('missing', 'uploaded', 'verified')),
  verified_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, required_doc_key)
);
create index if not exists sba_prep_plans_tenant_user_status_idx
  on public.sba_prep_plans (tenant_id, user_id, status, updated_at desc);
create index if not exists sba_document_links_plan_status_idx
  on public.sba_document_links (plan_id, status, updated_at desc);
create index if not exists sba_document_links_upload_idx
  on public.sba_document_links (upload_id);
create or replace function public.nexus_sba_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
drop trigger if exists trg_sba_prep_plans_set_updated_at on public.sba_prep_plans;
create trigger trg_sba_prep_plans_set_updated_at
before update on public.sba_prep_plans
for each row execute procedure public.nexus_sba_set_updated_at();
drop trigger if exists trg_sba_document_links_set_updated_at on public.sba_document_links;
create trigger trg_sba_document_links_set_updated_at
before update on public.sba_document_links
for each row execute procedure public.nexus_sba_set_updated_at();
create or replace function public.nexus_sba_recompute_plan_readiness(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_milestones jsonb := '[]'::jsonb;
  v_total_docs int := 0;
  v_uploaded_docs int := 0;
  v_verified_docs int := 0;
  v_total_milestones int := 0;
  v_completed_milestones int := 0;
  v_docs_ratio numeric := 0;
  v_milestone_ratio numeric := 0;
  v_readiness int := 0;
  v_status text := 'in_progress';
begin
  if p_plan_id is null then
    return;
  end if;

  select coalesce(milestones, '[]'::jsonb)
  into v_milestones
  from public.sba_prep_plans
  where id = p_plan_id;

  if not found then
    return;
  end if;

  select
    count(*)::int,
    count(*) filter (where status in ('uploaded','verified'))::int,
    count(*) filter (where status = 'verified')::int
  into v_total_docs, v_uploaded_docs, v_verified_docs
  from public.sba_document_links
  where plan_id = p_plan_id;

  if jsonb_typeof(v_milestones) = 'array' then
    select
      count(*)::int,
      count(*) filter (where lower(coalesce(value ->> 'status', '')) in ('completed', 'done', 'verified'))::int
    into v_total_milestones, v_completed_milestones
    from jsonb_array_elements(v_milestones);
  end if;

  if v_total_docs > 0 then
    v_docs_ratio := v_uploaded_docs::numeric / v_total_docs::numeric;
  end if;

  if v_total_milestones > 0 then
    v_milestone_ratio := v_completed_milestones::numeric / v_total_milestones::numeric;
  end if;

  v_readiness := greatest(0, least(100, round((v_docs_ratio * 70) + (v_milestone_ratio * 30))::int));

  if v_total_docs > 0 and v_uploaded_docs = v_total_docs and v_readiness >= 85 then
    v_status := 'ready_to_apply';
  elsif v_uploaded_docs = 0 and v_completed_milestones = 0 then
    v_status := 'not_started';
  else
    v_status := 'in_progress';
  end if;

  update public.sba_prep_plans
  set readiness_score = v_readiness,
      status = case when status = 'archived' then status else v_status end,
      updated_at = now()
  where id = p_plan_id;
end;
$fn$;
grant execute on function public.nexus_sba_recompute_plan_readiness(uuid) to authenticated, service_role;
create or replace function public.nexus_sba_recompute_from_link_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.nexus_sba_recompute_plan_readiness(coalesce(new.plan_id, old.plan_id));
  return coalesce(new, old);
end;
$fn$;
drop trigger if exists trg_sba_document_links_recompute on public.sba_document_links;
create trigger trg_sba_document_links_recompute
after insert or update or delete on public.sba_document_links
for each row execute procedure public.nexus_sba_recompute_from_link_trigger();
alter table public.uploads enable row level security;
alter table public.sba_prep_plans enable row level security;
alter table public.sba_documents_required enable row level security;
alter table public.sba_document_links enable row level security;
-- uploads

drop policy if exists uploads_select_scope on public.uploads;
create policy uploads_select_scope
on public.uploads
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_sba_can_access_tenant(tenant_id)
);
drop policy if exists uploads_insert_scope on public.uploads;
create policy uploads_insert_scope
on public.uploads
for insert to authenticated
with check (
  (
    auth.uid() = user_id
    and public.nexus_sba_can_access_tenant(tenant_id)
    and public.nexus_sba_user_has_premium(user_id, tenant_id)
  )
  or public.nexus_sba_can_manage_tenant(tenant_id)
);
drop policy if exists uploads_update_scope on public.uploads;
create policy uploads_update_scope
on public.uploads
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_sba_can_manage_tenant(tenant_id)
)
with check (
  auth.uid() = user_id
  or public.nexus_sba_can_manage_tenant(tenant_id)
);
drop policy if exists uploads_delete_scope on public.uploads;
create policy uploads_delete_scope
on public.uploads
for delete to authenticated
using (
  auth.uid() = user_id
  or public.nexus_sba_can_manage_tenant(tenant_id)
);
-- sba_documents_required

drop policy if exists sba_documents_required_select_all on public.sba_documents_required;
create policy sba_documents_required_select_all
on public.sba_documents_required
for select to authenticated
using (true);
drop policy if exists sba_documents_required_admin_write on public.sba_documents_required;
create policy sba_documents_required_admin_write
on public.sba_documents_required
for all to authenticated
using (public.nexus_sba_is_admin())
with check (public.nexus_sba_is_admin());
-- sba_prep_plans

drop policy if exists sba_prep_plans_select_scope on public.sba_prep_plans;
create policy sba_prep_plans_select_scope
on public.sba_prep_plans
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_sba_can_access_tenant(tenant_id)
);
drop policy if exists sba_prep_plans_insert_scope on public.sba_prep_plans;
create policy sba_prep_plans_insert_scope
on public.sba_prep_plans
for insert to authenticated
with check (
  (
    auth.uid() = user_id
    and public.nexus_sba_can_access_tenant(tenant_id)
    and public.nexus_sba_user_has_premium(user_id, tenant_id)
  )
  or public.nexus_sba_can_manage_tenant(tenant_id)
);
drop policy if exists sba_prep_plans_update_scope on public.sba_prep_plans;
create policy sba_prep_plans_update_scope
on public.sba_prep_plans
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_sba_can_manage_tenant(tenant_id)
)
with check (
  (
    auth.uid() = user_id
    and public.nexus_sba_can_access_tenant(tenant_id)
    and public.nexus_sba_user_has_premium(user_id, tenant_id)
  )
  or public.nexus_sba_can_manage_tenant(tenant_id)
);
drop policy if exists sba_prep_plans_delete_scope on public.sba_prep_plans;
create policy sba_prep_plans_delete_scope
on public.sba_prep_plans
for delete to authenticated
using (
  auth.uid() = user_id
  or public.nexus_sba_can_manage_tenant(tenant_id)
);
-- sba_document_links

drop policy if exists sba_document_links_select_scope on public.sba_document_links;
create policy sba_document_links_select_scope
on public.sba_document_links
for select to authenticated
using (
  exists (
    select 1
    from public.sba_prep_plans p
    where p.id = plan_id
      and (
        p.user_id = auth.uid()
        or public.nexus_sba_can_access_tenant(p.tenant_id)
      )
  )
);
drop policy if exists sba_document_links_insert_scope on public.sba_document_links;
create policy sba_document_links_insert_scope
on public.sba_document_links
for insert to authenticated
with check (
  exists (
    select 1
    from public.sba_prep_plans p
    where p.id = plan_id
      and (
        p.user_id = auth.uid()
        or public.nexus_sba_can_manage_tenant(p.tenant_id)
      )
  )
);
drop policy if exists sba_document_links_update_client_scope on public.sba_document_links;
create policy sba_document_links_update_client_scope
on public.sba_document_links
for update to authenticated
using (
  exists (
    select 1
    from public.sba_prep_plans p
    where p.id = plan_id
      and p.user_id = auth.uid()
      and public.nexus_sba_user_has_premium(p.user_id, p.tenant_id)
  )
)
with check (
  status in ('missing', 'uploaded')
  and verified_by is null
  and exists (
    select 1
    from public.sba_prep_plans p
    where p.id = plan_id
      and p.user_id = auth.uid()
      and public.nexus_sba_user_has_premium(p.user_id, p.tenant_id)
  )
);
drop policy if exists sba_document_links_update_admin_scope on public.sba_document_links;
create policy sba_document_links_update_admin_scope
on public.sba_document_links
for update to authenticated
using (
  exists (
    select 1
    from public.sba_prep_plans p
    where p.id = plan_id
      and public.nexus_sba_can_manage_tenant(p.tenant_id)
  )
)
with check (
  exists (
    select 1
    from public.sba_prep_plans p
    where p.id = plan_id
      and public.nexus_sba_can_manage_tenant(p.tenant_id)
  )
);
drop policy if exists sba_document_links_delete_scope on public.sba_document_links;
create policy sba_document_links_delete_scope
on public.sba_document_links
for delete to authenticated
using (
  exists (
    select 1
    from public.sba_prep_plans p
    where p.id = plan_id
      and public.nexus_sba_can_manage_tenant(p.tenant_id)
  )
);
grant select, insert, update, delete on table public.uploads to authenticated, service_role;
grant select, insert, update, delete on table public.sba_prep_plans to authenticated, service_role;
grant select, insert, update, delete on table public.sba_documents_required to authenticated, service_role;
grant select, insert, update, delete on table public.sba_document_links to authenticated, service_role;
insert into public.sba_documents_required (key, title, description_md)
values
  ('pnl', 'Profit and Loss Statements', 'Last 2-3 years and year-to-date P&L statements for educational lender prep review.'),
  ('balance_sheet', 'Balance Sheets', 'Current and historical balance sheets to evaluate liquidity and leverage trends.'),
  ('bank_statements', 'Business Bank Statements', 'Recent 6-12 months statements to demonstrate cash flow consistency.'),
  ('tax_returns', 'Business Tax Returns', 'Federal returns (typically 2-3 years). Include all schedules where applicable.'),
  ('business_plan', 'Business Plan', 'Educational narrative draft describing mission, execution plan, and capital use.'),
  ('projection', 'Financial Projections', '12-24 month projections with assumptions and scenario notes.'),
  ('debt_schedule', 'Debt Schedule', 'Current debt obligations, payment terms, balances, and maturity dates.'),
  ('ownership_docs', 'Ownership and Formation Docs', 'Articles, operating agreement/bylaws, and ownership percentages.'),
  ('licenses', 'Licenses and Permits', 'Required local/state/federal licenses relevant to operations.'),
  ('personal_financial_statement', 'Personal Financial Statement', 'Owner personal financial statement where lender requirements request it.')
on conflict (key) do update
set title = excluded.title,
    description_md = excluded.description_md;
