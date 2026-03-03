-- Commission Ledger (educational, client-reported outcomes; no guarantee of funding outcomes).

create extension if not exists pgcrypto;

create or replace function public.nexus_commission_is_super_admin()
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

create or replace function public.nexus_commission_can_access_tenant(p_tenant_id uuid)
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

  if public.nexus_commission_is_super_admin() then
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

create or replace function public.nexus_commission_can_manage_tenant(p_tenant_id uuid)
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

  if public.nexus_commission_is_super_admin() then
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

create or replace function public.nexus_commission_user_has_premium(p_user_id uuid, p_tenant_id uuid)
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

create or replace function public.nexus_commission_has_disclosure_consent(p_user_id uuid, p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.consents c
    where c.user_id = p_user_id
      and (p_tenant_id is null or c.tenant_id = p_tenant_id)
      and c.consent_type = 'commission_disclosure'::public.consent_type
    order by c.accepted_at desc
    limit 1
  );
$fn$;

create table if not exists public.commission_agreements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null,
  rate_bps int not null default 1000 check (rate_bps >= 0 and rate_bps <= 10000),
  cap_cents bigint null check (cap_cents is null or cap_cents >= 0),
  effective_at timestamptz not null default now(),
  policy_version_id uuid not null references public.policy_versions(id) on delete restrict,
  consent_id uuid not null references public.consents(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.funding_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_file_id uuid not null,
  provider_name text not null,
  product_type text not null check (lower(product_type) in ('card', 'loc', 'loan')),
  outcome_status text not null default 'planned' check (outcome_status in ('planned', 'applied', 'approved', 'denied')),
  approved_amount_cents bigint null check (approved_amount_cents is null or approved_amount_cents >= 0),
  approval_date date null,
  evidence_upload_id uuid null references public.uploads(id) on delete set null,
  notes_md text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commission_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  funding_outcome_id uuid not null references public.funding_outcomes(id) on delete cascade,
  commission_rate_bps int not null check (commission_rate_bps >= 0 and commission_rate_bps <= 10000),
  base_amount_cents bigint not null check (base_amount_cents >= 0),
  commission_amount_cents bigint not null check (commission_amount_cents >= 0),
  status text not null default 'estimated' check (status in ('estimated', 'invoiced', 'paid', 'waived', 'disputed')),
  invoice_provider text not null default 'manual' check (invoice_provider in ('stripe', 'manual')),
  invoice_id text null,
  due_date date null,
  paid_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.nexus_commission_has_active_agreement(p_user_id uuid, p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.commission_agreements ca
    join public.consents c
      on c.id = ca.consent_id
    where ca.user_id = p_user_id
      and (p_tenant_id is null or ca.tenant_id = p_tenant_id)
      and ca.effective_at <= now()
      and c.user_id = ca.user_id
      and c.tenant_id = ca.tenant_id
      and c.consent_type = 'commission_disclosure'::public.consent_type
    order by ca.effective_at desc, ca.created_at desc
    limit 1
  );
$fn$;

grant execute on function public.nexus_commission_is_super_admin() to authenticated;
grant execute on function public.nexus_commission_can_access_tenant(uuid) to authenticated;
grant execute on function public.nexus_commission_can_manage_tenant(uuid) to authenticated;
grant execute on function public.nexus_commission_user_has_premium(uuid, uuid) to authenticated;
grant execute on function public.nexus_commission_has_disclosure_consent(uuid, uuid) to authenticated;
grant execute on function public.nexus_commission_has_active_agreement(uuid, uuid) to authenticated;

create unique index if not exists commission_agreements_user_consent_uidx
  on public.commission_agreements (user_id, consent_id);

create index if not exists commission_agreements_tenant_user_effective_idx
  on public.commission_agreements (tenant_id, user_id, effective_at desc, created_at desc);

create index if not exists commission_agreements_policy_idx
  on public.commission_agreements (policy_version_id, created_at desc);

create index if not exists funding_outcomes_tenant_user_status_idx
  on public.funding_outcomes (tenant_id, user_id, outcome_status, created_at desc);

create index if not exists funding_outcomes_client_file_idx
  on public.funding_outcomes (client_file_id, created_at desc);

create index if not exists commission_events_tenant_status_idx
  on public.commission_events (tenant_id, status, created_at desc);

create index if not exists commission_events_user_status_idx
  on public.commission_events (user_id, status, created_at desc);

create unique index if not exists commission_events_funding_outcome_uidx
  on public.commission_events (funding_outcome_id);

create or replace function public.nexus_commission_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_funding_outcomes_set_updated_at on public.funding_outcomes;
create trigger trg_funding_outcomes_set_updated_at
before update on public.funding_outcomes
for each row execute procedure public.nexus_commission_set_updated_at();

drop trigger if exists trg_commission_events_set_updated_at on public.commission_events;
create trigger trg_commission_events_set_updated_at
before update on public.commission_events
for each row execute procedure public.nexus_commission_set_updated_at();

create or replace function public.nexus_commission_validate_agreement()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  consent_row public.consents%rowtype;
begin
  select *
  into consent_row
  from public.consents c
  where c.id = new.consent_id
  limit 1;

  if consent_row.id is null then
    raise exception 'commission agreement consent_id not found';
  end if;

  if consent_row.user_id <> new.user_id then
    raise exception 'commission agreement consent user mismatch';
  end if;

  if consent_row.tenant_id <> new.tenant_id then
    raise exception 'commission agreement consent tenant mismatch';
  end if;

  if consent_row.consent_type <> 'commission_disclosure'::public.consent_type then
    raise exception 'commission agreement must link to commission_disclosure consent';
  end if;

  if consent_row.policy_version_id is not null and consent_row.policy_version_id <> new.policy_version_id then
    raise exception 'commission agreement policy_version_id must match consent policy_version_id';
  end if;

  if coalesce(new.version, '') = '' then
    new.version := coalesce(consent_row.version, 'v1');
  end if;

  if new.effective_at is null then
    new.effective_at := now();
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_commission_agreements_validate on public.commission_agreements;
create trigger trg_commission_agreements_validate
before insert or update on public.commission_agreements
for each row execute procedure public.nexus_commission_validate_agreement();

create or replace function public.nexus_commission_validate_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  outcome_row public.funding_outcomes%rowtype;
  agreement_row public.commission_agreements%rowtype;
  base_value bigint;
  computed_commission bigint;
begin
  select *
  into outcome_row
  from public.funding_outcomes fo
  where fo.id = new.funding_outcome_id
  limit 1;

  if outcome_row.id is null then
    raise exception 'funding outcome not found for commission event';
  end if;

  if outcome_row.tenant_id <> new.tenant_id or outcome_row.user_id <> new.user_id then
    raise exception 'commission event tenant/user mismatch with funding outcome';
  end if;

  if outcome_row.outcome_status <> 'approved' then
    raise exception 'commission events require approved funding outcome';
  end if;

  if outcome_row.approved_amount_cents is null or outcome_row.approved_amount_cents <= 0 then
    raise exception 'approved funding outcome must include approved_amount_cents';
  end if;

  select *
  into agreement_row
  from public.commission_agreements ca
  where ca.user_id = new.user_id
    and ca.tenant_id = new.tenant_id
    and ca.effective_at <= now()
  order by ca.effective_at desc, ca.created_at desc
  limit 1;

  if agreement_row.id is null then
    raise exception 'commission agreement is required before commission event creation';
  end if;

  if not exists (
    select 1
    from public.consents c
    where c.id = agreement_row.consent_id
      and c.user_id = agreement_row.user_id
      and c.tenant_id = agreement_row.tenant_id
      and c.consent_type = 'commission_disclosure'::public.consent_type
  ) then
    raise exception 'commission agreement must link to valid commission_disclosure consent';
  end if;

  if new.commission_rate_bps is null or new.commission_rate_bps <= 0 then
    new.commission_rate_bps := agreement_row.rate_bps;
  end if;

  base_value := coalesce(nullif(new.base_amount_cents, 0), outcome_row.approved_amount_cents);
  if base_value <= 0 then
    raise exception 'commission base amount must be positive';
  end if;
  new.base_amount_cents := base_value;

  computed_commission := floor((base_value::numeric * new.commission_rate_bps::numeric) / 10000.0)::bigint;
  if agreement_row.cap_cents is not null and computed_commission > agreement_row.cap_cents then
    computed_commission := agreement_row.cap_cents;
  end if;
  new.commission_amount_cents := greatest(0, computed_commission);

  if tg_op = 'INSERT' and coalesce(new.status, '') = '' then
    new.status := 'estimated';
  end if;

  if new.status = 'paid' and new.paid_at is null then
    new.paid_at := now();
  end if;

  if new.status <> 'paid' then
    new.paid_at := null;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_commission_events_validate on public.commission_events;
create trigger trg_commission_events_validate
before insert or update on public.commission_events
for each row execute procedure public.nexus_commission_validate_event();

alter table public.commission_agreements enable row level security;
alter table public.funding_outcomes enable row level security;
alter table public.commission_events enable row level security;

drop policy if exists commission_agreements_select_scope on public.commission_agreements;
create policy commission_agreements_select_scope
on public.commission_agreements
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_commission_can_access_tenant(tenant_id)
);

drop policy if exists commission_agreements_insert_scope on public.commission_agreements;
create policy commission_agreements_insert_scope
on public.commission_agreements
for insert to authenticated
with check (
  (
    auth.uid() = user_id
    and public.nexus_commission_can_access_tenant(tenant_id)
  )
  or public.nexus_commission_can_manage_tenant(tenant_id)
);

drop policy if exists commission_agreements_update_scope on public.commission_agreements;
create policy commission_agreements_update_scope
on public.commission_agreements
for update to authenticated
using (public.nexus_commission_can_manage_tenant(tenant_id))
with check (public.nexus_commission_can_manage_tenant(tenant_id));

drop policy if exists commission_agreements_delete_scope on public.commission_agreements;
create policy commission_agreements_delete_scope
on public.commission_agreements
for delete to authenticated
using (public.nexus_commission_can_manage_tenant(tenant_id));

drop policy if exists funding_outcomes_select_scope on public.funding_outcomes;
create policy funding_outcomes_select_scope
on public.funding_outcomes
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_commission_can_access_tenant(tenant_id)
);

drop policy if exists funding_outcomes_insert_scope on public.funding_outcomes;
create policy funding_outcomes_insert_scope
on public.funding_outcomes
for insert to authenticated
with check (
  (
    auth.uid() = user_id
    and public.nexus_commission_can_access_tenant(tenant_id)
  )
  or public.nexus_commission_can_manage_tenant(tenant_id)
);

drop policy if exists funding_outcomes_update_scope on public.funding_outcomes;
create policy funding_outcomes_update_scope
on public.funding_outcomes
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_commission_can_manage_tenant(tenant_id)
)
with check (
  (
    auth.uid() = user_id
    and public.nexus_commission_can_access_tenant(tenant_id)
  )
  or public.nexus_commission_can_manage_tenant(tenant_id)
);

drop policy if exists funding_outcomes_delete_scope on public.funding_outcomes;
create policy funding_outcomes_delete_scope
on public.funding_outcomes
for delete to authenticated
using (
  auth.uid() = user_id
  or public.nexus_commission_can_manage_tenant(tenant_id)
);

drop policy if exists commission_events_select_scope on public.commission_events;
create policy commission_events_select_scope
on public.commission_events
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_commission_can_access_tenant(tenant_id)
);

drop policy if exists commission_events_insert_scope on public.commission_events;
create policy commission_events_insert_scope
on public.commission_events
for insert to authenticated
with check (
  (
    auth.uid() = user_id
    and exists (
      select 1
      from public.funding_outcomes fo
      where fo.id = commission_events.funding_outcome_id
        and fo.user_id = auth.uid()
        and fo.tenant_id = commission_events.tenant_id
    )
    and public.nexus_commission_user_has_premium(user_id, tenant_id)
    and public.nexus_commission_has_disclosure_consent(user_id, tenant_id)
    and public.nexus_commission_has_active_agreement(user_id, tenant_id)
  )
  or public.nexus_commission_can_manage_tenant(tenant_id)
);

drop policy if exists commission_events_update_scope on public.commission_events;
create policy commission_events_update_scope
on public.commission_events
for update to authenticated
using (public.nexus_commission_can_manage_tenant(tenant_id))
with check (public.nexus_commission_can_manage_tenant(tenant_id));

drop policy if exists commission_events_delete_scope on public.commission_events;
create policy commission_events_delete_scope
on public.commission_events
for delete to authenticated
using (public.nexus_commission_can_manage_tenant(tenant_id));

grant select, insert, update, delete on table public.commission_agreements to authenticated, service_role;
grant select, insert, update, delete on table public.funding_outcomes to authenticated, service_role;
grant select, insert, update, delete on table public.commission_events to authenticated, service_role;
