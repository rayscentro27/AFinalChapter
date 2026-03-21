-- Funding Research Engine (Tier 1 educational packet + client-driven application tracker)
-- Educational use only. No guarantees of approvals or funding outcomes.

create extension if not exists pgcrypto;
create or replace function public.nexus_funding_is_super_admin()
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
create or replace function public.nexus_funding_can_access_tenant(p_tenant_id uuid)
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

  if public.nexus_funding_is_super_admin() then
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
create or replace function public.nexus_funding_can_manage_tenant(p_tenant_id uuid)
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

  if public.nexus_funding_is_super_admin() then
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
grant execute on function public.nexus_funding_is_super_admin() to authenticated;
grant execute on function public.nexus_funding_can_access_tenant(uuid) to authenticated;
grant execute on function public.nexus_funding_can_manage_tenant(uuid) to authenticated;
create table if not exists public.bank_catalog (
  id uuid primary key default gen_random_uuid(),
  is_active boolean not null default true,
  name text not null unique,
  regions text[] not null default '{}'::text[],
  products jsonb not null default '[]'::jsonb,
  requirements jsonb not null default '{}'::jsonb,
  notes_md text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.funding_research_packets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_file_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'delivered', 'archived')),
  input_snapshot jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.funding_applications_tracker (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  packet_id uuid not null references public.funding_research_packets(id) on delete cascade,
  bank_id uuid not null references public.bank_catalog(id) on delete restrict,
  product_key text not null,
  client_status text not null default 'planned' check (client_status in ('planned', 'applied', 'approved', 'denied')),
  approved_amount_cents bigint,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bank_catalog_active_name_idx
  on public.bank_catalog (is_active, name);
create index if not exists funding_research_packets_tenant_user_created_idx
  on public.funding_research_packets (tenant_id, user_id, created_at desc);
create index if not exists funding_research_packets_status_idx
  on public.funding_research_packets (tenant_id, status, created_at desc);
create unique index if not exists funding_tracker_packet_bank_product_uidx
  on public.funding_applications_tracker (packet_id, bank_id, product_key);
create index if not exists funding_tracker_user_status_idx
  on public.funding_applications_tracker (user_id, client_status, updated_at desc);
create index if not exists funding_tracker_tenant_status_idx
  on public.funding_applications_tracker (tenant_id, client_status, updated_at desc);
create or replace function public.nexus_funding_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
drop trigger if exists trg_bank_catalog_set_updated_at on public.bank_catalog;
create trigger trg_bank_catalog_set_updated_at
before update on public.bank_catalog
for each row execute procedure public.nexus_funding_set_updated_at();
drop trigger if exists trg_funding_research_packets_set_updated_at on public.funding_research_packets;
create trigger trg_funding_research_packets_set_updated_at
before update on public.funding_research_packets
for each row execute procedure public.nexus_funding_set_updated_at();
drop trigger if exists trg_funding_applications_tracker_set_updated_at on public.funding_applications_tracker;
create trigger trg_funding_applications_tracker_set_updated_at
before update on public.funding_applications_tracker
for each row execute procedure public.nexus_funding_set_updated_at();
create or replace function public.nexus_funding_tracker_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  event_name text;
  event_meta jsonb;
begin
  event_name := case when tg_op = 'INSERT' then 'funding.application_logged' else 'funding.application_status_changed' end;
  event_meta := jsonb_build_object(
    'tracker_id', new.id,
    'packet_id', new.packet_id,
    'bank_id', new.bank_id,
    'product_key', new.product_key,
    'client_status', new.client_status,
    'approved_amount_cents', new.approved_amount_cents,
    'opened_at', new.opened_at,
    'updated_at', new.updated_at
  );

  if tg_op = 'UPDATE' then
    event_meta := event_meta || jsonb_build_object(
      'previous_status', old.client_status,
      'previous_approved_amount_cents', old.approved_amount_cents
    );
  end if;

  begin
    insert into public.audit_events (
      tenant_id,
      actor_user_id,
      event_type,
      metadata
    ) values (
      new.tenant_id,
      new.user_id,
      event_name,
      event_meta
    );
  exception
    when undefined_table then
      null;
  end;

  return new;
end;
$fn$;
drop trigger if exists trg_funding_applications_tracker_audit on public.funding_applications_tracker;
create trigger trg_funding_applications_tracker_audit
after insert or update on public.funding_applications_tracker
for each row execute procedure public.nexus_funding_tracker_audit_event();
alter table public.bank_catalog enable row level security;
alter table public.funding_research_packets enable row level security;
alter table public.funding_applications_tracker enable row level security;
drop policy if exists bank_catalog_select_active on public.bank_catalog;
create policy bank_catalog_select_active
on public.bank_catalog
for select to authenticated
using (is_active = true);
drop policy if exists bank_catalog_select_admin_all on public.bank_catalog;
create policy bank_catalog_select_admin_all
on public.bank_catalog
for select to authenticated
using (public.nexus_funding_is_super_admin());
drop policy if exists bank_catalog_admin_insert on public.bank_catalog;
create policy bank_catalog_admin_insert
on public.bank_catalog
for insert to authenticated
with check (public.nexus_funding_is_super_admin());
drop policy if exists bank_catalog_admin_update on public.bank_catalog;
create policy bank_catalog_admin_update
on public.bank_catalog
for update to authenticated
using (public.nexus_funding_is_super_admin())
with check (public.nexus_funding_is_super_admin());
drop policy if exists bank_catalog_admin_delete on public.bank_catalog;
create policy bank_catalog_admin_delete
on public.bank_catalog
for delete to authenticated
using (public.nexus_funding_is_super_admin());
drop policy if exists funding_packets_select_scope on public.funding_research_packets;
create policy funding_packets_select_scope
on public.funding_research_packets
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_funding_can_access_tenant(tenant_id)
);
drop policy if exists funding_packets_insert_scope on public.funding_research_packets;
create policy funding_packets_insert_scope
on public.funding_research_packets
for insert to authenticated
with check (
  auth.uid() = user_id
  and public.nexus_funding_can_access_tenant(tenant_id)
);
drop policy if exists funding_packets_update_scope on public.funding_research_packets;
create policy funding_packets_update_scope
on public.funding_research_packets
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_funding_can_manage_tenant(tenant_id)
)
with check (
  (auth.uid() = user_id and public.nexus_funding_can_access_tenant(tenant_id))
  or public.nexus_funding_can_manage_tenant(tenant_id)
);
drop policy if exists funding_packets_delete_scope on public.funding_research_packets;
create policy funding_packets_delete_scope
on public.funding_research_packets
for delete to authenticated
using (
  auth.uid() = user_id
  or public.nexus_funding_can_manage_tenant(tenant_id)
);
drop policy if exists funding_tracker_select_scope on public.funding_applications_tracker;
create policy funding_tracker_select_scope
on public.funding_applications_tracker
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_funding_can_access_tenant(tenant_id)
);
drop policy if exists funding_tracker_insert_scope on public.funding_applications_tracker;
create policy funding_tracker_insert_scope
on public.funding_applications_tracker
for insert to authenticated
with check (
  (
    auth.uid() = user_id
    and exists (
      select 1
      from public.funding_research_packets p
      where p.id = funding_applications_tracker.packet_id
        and p.user_id = auth.uid()
        and p.tenant_id = funding_applications_tracker.tenant_id
    )
  )
  or public.nexus_funding_can_manage_tenant(tenant_id)
);
drop policy if exists funding_tracker_update_scope on public.funding_applications_tracker;
create policy funding_tracker_update_scope
on public.funding_applications_tracker
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_funding_can_manage_tenant(tenant_id)
)
with check (
  (
    auth.uid() = user_id
    and exists (
      select 1
      from public.funding_research_packets p
      where p.id = funding_applications_tracker.packet_id
        and p.user_id = auth.uid()
        and p.tenant_id = funding_applications_tracker.tenant_id
    )
  )
  or public.nexus_funding_can_manage_tenant(tenant_id)
);
drop policy if exists funding_tracker_delete_scope on public.funding_applications_tracker;
create policy funding_tracker_delete_scope
on public.funding_applications_tracker
for delete to authenticated
using (
  auth.uid() = user_id
  or public.nexus_funding_can_manage_tenant(tenant_id)
);
grant select, insert, update, delete on table public.bank_catalog to authenticated, service_role;
grant select, insert, update, delete on table public.funding_research_packets to authenticated, service_role;
grant select, insert, update, delete on table public.funding_applications_tracker to authenticated, service_role;
insert into public.bank_catalog (name, regions, products, requirements, notes_md)
select seed.name, seed.regions, seed.products, seed.requirements, seed.notes_md
from (
  values
    (
      'Starter Business Bank A',
      array['US', 'AZ', 'CA', 'TX']::text[],
      $$[
        {
          "key": "STARTER_CARD_0APR_12",
          "type": "card",
          "label": "Starter 0% APR Card (12 mo)",
          "intro_apr_percent": 0,
          "intro_apr_months": 12,
          "max_limit_cents": 2500000
        },
        {
          "key": "STARTER_LOC_9M",
          "type": "loc",
          "label": "Entry LOC Intro Offer (9 mo)",
          "intro_apr_percent": 0,
          "intro_apr_months": 9,
          "max_limit_cents": 1500000
        }
      ]$$::jsonb,
      $${
        "min_credit_score": 680,
        "preferred_years_in_business": 1,
        "relationship_banking_hint": "Open and maintain primary business checking for stronger profile context."
      }$$::jsonb,
      'Educational profile fit only. Client decides if and when to apply. No approval guarantees.'
    ),
    (
      'Regional Growth CU',
      array['US', 'NM', 'AZ', 'CO']::text[],
      $$[
        {
          "key": "GROWTH_CARD_0APR_15",
          "type": "card",
          "label": "Growth Rewards Card (15 mo 0% intro)",
          "intro_apr_percent": 0,
          "intro_apr_months": 15,
          "max_limit_cents": 3000000
        }
      ]$$::jsonb,
      $${
        "min_credit_score": 700,
        "preferred_years_in_business": 2,
        "relationship_banking_hint": "Existing deposit account history may improve review confidence."
      }$$::jsonb,
      'Educational comparison row for client-led submission sequencing. Results vary.'
    ),
    (
      'National Commerce Bank',
      array['US']::text[],
      $$[
        {
          "key": "NATIONAL_CARD_0APR_18",
          "type": "card",
          "label": "National Business Card (18 mo 0% intro)",
          "intro_apr_percent": 0,
          "intro_apr_months": 18,
          "max_limit_cents": 5000000
        },
        {
          "key": "NATIONAL_LOC_12",
          "type": "loc",
          "label": "Commerce LOC Intro (12 mo)",
          "intro_apr_percent": 0,
          "intro_apr_months": 12,
          "max_limit_cents": 4000000
        }
      ]$$::jsonb,
      $${
        "min_credit_score": 720,
        "preferred_years_in_business": 2,
        "relationship_banking_hint": "Demonstrate stable deposits and clean recent utilization trends."
      }$$::jsonb,
      'Use for educational planning and checklist sequencing only. Client submits applications directly.'
    )
) as seed(name, regions, products, requirements, notes_md)
where not exists (
  select 1
  from public.bank_catalog bc
  where lower(bc.name) = lower(seed.name)
);
