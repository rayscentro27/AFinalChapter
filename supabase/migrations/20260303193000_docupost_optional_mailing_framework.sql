-- DocuPost optional mailing framework
-- Adds dispute packet + mailing event records with consent-gated authorization helpers.

create extension if not exists pgcrypto;

create or replace function public.nexus_can_read_tenant(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  has_access boolean := false;
begin
  if p_tenant_id is null then
    return false;
  end if;

  if public.nexus_is_super_admin_only() then
    return true;
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
      )
    $sql$ into has_access using p_tenant_id;

    if coalesce(has_access, false) then
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
    $sql$ into has_access using p_tenant_id;

    if coalesce(has_access, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;

grant execute on function public.nexus_can_read_tenant(uuid) to authenticated;

create or replace function public.nexus_can_manage_tenant(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  has_admin boolean := false;
begin
  if p_tenant_id is null then
    return false;
  end if;

  if public.nexus_is_super_admin_only() then
    return true;
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
          and lower(coalesce(tm.role, '')) in ('admin', 'super_admin')
      )
    $sql$ into has_admin using p_tenant_id;

    if coalesce(has_admin, false) then
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
          and lower(coalesce(tm.role, '')) in ('admin', 'super_admin')
      )
    $sql$ into has_admin using p_tenant_id;

    if coalesce(has_admin, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;

grant execute on function public.nexus_can_manage_tenant(uuid) to authenticated;

create or replace function public.nexus_docupost_recent_consent_id(
  p_user_id uuid,
  p_dispute_packet_id uuid,
  p_max_age_days integer default 30
)
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select c.id
  from public.consents c
  where c.user_id = p_user_id
    and c.consent_type = 'docupost_mailing_auth'::public.consent_type
    and c.accepted_at >= now() - make_interval(days => greatest(coalesce(p_max_age_days, 30), 0))
    and coalesce(c.metadata ->> 'dispute_packet_id', '') = p_dispute_packet_id::text
    and length(trim(coalesce(c.metadata ->> 'acknowledgement', ''))) > 0
  order by c.accepted_at desc, c.created_at desc
  limit 1;
$fn$;

grant execute on function public.nexus_docupost_recent_consent_id(uuid, uuid, integer) to authenticated;

create table if not exists public.dispute_packets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'mailed', 'mail_failed')),
  bureau text not null check (bureau in ('experian', 'equifax', 'transunion')),
  letter_version text not null,
  final_doc_storage_path text,
  final_doc_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dispute_packets_user_created_idx
  on public.dispute_packets (user_id, created_at desc);

create index if not exists dispute_packets_tenant_status_idx
  on public.dispute_packets (tenant_id, status, created_at desc);

create table if not exists public.mailing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  dispute_packet_id uuid not null references public.dispute_packets(id) on delete cascade,
  provider text not null default 'docupost',
  status text not null check (status in ('queued', 'submitted', 'sent', 'failed', 'canceled')),
  provider_reference_id text,
  to_name text not null,
  to_address_1 text not null,
  to_address_2 text,
  to_city text not null,
  to_state text not null,
  to_zip text not null,
  document_hash text not null,
  cost_cents integer,
  authorized_consent_id uuid references public.consents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mailing_events_packet_created_idx
  on public.mailing_events (dispute_packet_id, created_at desc);

create index if not exists mailing_events_tenant_status_idx
  on public.mailing_events (tenant_id, status, created_at desc);

create index if not exists mailing_events_provider_ref_idx
  on public.mailing_events (provider, provider_reference_id);

create or replace function public.nexus_docupost_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_dispute_packets_set_updated_at on public.dispute_packets;
create trigger trg_dispute_packets_set_updated_at
before update on public.dispute_packets
for each row execute procedure public.nexus_docupost_set_updated_at();

drop trigger if exists trg_mailing_events_set_updated_at on public.mailing_events;
create trigger trg_mailing_events_set_updated_at
before update on public.mailing_events
for each row execute procedure public.nexus_docupost_set_updated_at();

alter table public.dispute_packets enable row level security;
alter table public.mailing_events enable row level security;

-- dispute_packets: clients read own; admins/super_admin read/manage in tenant.
drop policy if exists dispute_packets_select_access on public.dispute_packets;
create policy dispute_packets_select_access
on public.dispute_packets
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_can_read_tenant(tenant_id)
  or public.nexus_is_super_admin_only()
);

drop policy if exists dispute_packets_insert_owner on public.dispute_packets;
create policy dispute_packets_insert_owner
on public.dispute_packets
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists dispute_packets_manage_tenant_admin on public.dispute_packets;
create policy dispute_packets_manage_tenant_admin
on public.dispute_packets
for all to authenticated
using (public.nexus_can_manage_tenant(tenant_id) or public.nexus_is_super_admin_only())
with check (public.nexus_can_manage_tenant(tenant_id) or public.nexus_is_super_admin_only());

drop policy if exists dispute_packets_update_owner on public.dispute_packets;
create policy dispute_packets_update_owner
on public.dispute_packets
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- mailing_events: clients read own; client inserts only with recent docupost authorization.
drop policy if exists mailing_events_select_access on public.mailing_events;
create policy mailing_events_select_access
on public.mailing_events
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_can_read_tenant(tenant_id)
  or public.nexus_is_super_admin_only()
);

drop policy if exists mailing_events_insert_owner_authorized on public.mailing_events;
create policy mailing_events_insert_owner_authorized
on public.mailing_events
for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.dispute_packets dp
    where dp.id = dispute_packet_id
      and dp.user_id = auth.uid()
      and dp.tenant_id = mailing_events.tenant_id
  )
  and public.nexus_docupost_recent_consent_id(auth.uid(), dispute_packet_id, 30) is not null
);

drop policy if exists mailing_events_manage_tenant_admin on public.mailing_events;
create policy mailing_events_manage_tenant_admin
on public.mailing_events
for all to authenticated
using (public.nexus_can_manage_tenant(tenant_id) or public.nexus_is_super_admin_only())
with check (public.nexus_can_manage_tenant(tenant_id) or public.nexus_is_super_admin_only());

grant select, insert, update, delete on table public.dispute_packets to authenticated, service_role;
grant select, insert, update, delete on table public.mailing_events to authenticated, service_role;
