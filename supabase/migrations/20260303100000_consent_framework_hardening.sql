-- Legal + consent framework hardening
-- Ensures super-admin compatibility, durable audit fields, and complete consent status visibility.

create extension if not exists pgcrypto;
create or replace function public.nexus_is_master_admin_compat()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  is_admin boolean := false;
begin
  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and lower(coalesce(tm.role, '')) in ('super_admin', 'admin')
      )
    $sql$ into is_admin;

    if coalesce(is_admin, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and lower(coalesce(tm.role, '')) in ('super_admin', 'admin')
      )
    $sql$ into is_admin;

    if coalesce(is_admin, false) then
      return true;
    end if;
  end if;

  return lower(coalesce(auth.jwt() ->> 'role', '')) in ('super_admin', 'admin');
end;
$fn$;
grant execute on function public.nexus_is_master_admin_compat() to authenticated;
create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid null,
  consent_type public.consent_type not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists consents_user_type_version_uidx
  on public.consents (user_id, consent_type, version);
create index if not exists consents_tenant_user_idx
  on public.consents (tenant_id, user_id, accepted_at desc);
create index if not exists consents_user_accepted_idx
  on public.consents (user_id, accepted_at desc);
alter table public.consents enable row level security;
drop policy if exists consents_select_own on public.consents;
create policy consents_select_own on public.consents
for select to authenticated
using (auth.uid() = user_id);
drop policy if exists consents_select_master_admin on public.consents;
drop policy if exists consents_select_super_admin on public.consents;
create policy consents_select_super_admin on public.consents
for select to authenticated
using (public.nexus_is_master_admin_compat());
drop policy if exists consents_insert_own on public.consents;
create policy consents_insert_own on public.consents
for insert to authenticated
with check (auth.uid() = user_id);
create table if not exists public.audit_events (
  id bigserial primary key,
  tenant_id uuid null,
  actor_user_id uuid,
  event_type text,
  metadata jsonb,
  created_at timestamptz default now()
);
alter table public.audit_events add column if not exists actor_user_id uuid;
alter table public.audit_events add column if not exists event_type text;
alter table public.audit_events add column if not exists metadata jsonb;
alter table public.audit_events add column if not exists created_at timestamptz;
do $do$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_events' and column_name = 'tenant_id'
  ) then
    execute 'alter table public.audit_events alter column tenant_id drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_events' and column_name = 'action'
  ) then
    execute 'alter table public.audit_events alter column action drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_events' and column_name = 'entity_type'
  ) then
    execute 'alter table public.audit_events alter column entity_type drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_events' and column_name = 'entity_id'
  ) then
    execute 'alter table public.audit_events alter column entity_id drop not null';
  end if;
end;
$do$;
do $do$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_events' and column_name = 'action'
  ) then
    execute $sql$
      update public.audit_events
      set event_type = coalesce(event_type, action, 'event')
      where event_type is null
    $sql$;
  else
    execute $sql$
      update public.audit_events
      set event_type = coalesce(event_type, 'event')
      where event_type is null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_events' and column_name = 'occurred_at'
  ) then
    execute $sql$
      update public.audit_events
      set created_at = coalesce(created_at, occurred_at, now())
      where created_at is null
    $sql$;
  else
    execute $sql$
      update public.audit_events
      set created_at = coalesce(created_at, now())
      where created_at is null
    $sql$;
  end if;

  execute $sql$
    update public.audit_events
    set metadata = coalesce(metadata, '{}'::jsonb)
    where metadata is null
  $sql$;
end;
$do$;
alter table public.audit_events alter column event_type set default 'event';
alter table public.audit_events alter column created_at set default now();
alter table public.audit_events alter column metadata set default '{}'::jsonb;
alter table public.audit_events alter column event_type set not null;
alter table public.audit_events alter column created_at set not null;
alter table public.audit_events alter column metadata set not null;
create index if not exists audit_events_tenant_created_idx
  on public.audit_events (tenant_id, created_at desc);
create table if not exists public.consent_requirements (
  consent_type public.consent_type primary key,
  current_version text not null,
  is_required boolean not null default false,
  description text,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.consent_requirements (consent_type, current_version, is_required, description)
values
  ('terms', 'v1', true, 'Terms of Service acceptance required for workspace access.'),
  ('privacy', 'v1', true, 'Privacy Policy acceptance required for workspace access.'),
  ('ai_disclosure', 'v1', true, 'AI Disclosure acceptance required for workspace access.'),
  ('disclaimers', 'v1', true, 'Educational disclaimers acceptance required for workspace access.'),
  ('comms_email', 'v1', true, 'Transactional email communications consent required for workspace access.'),
  ('docupost_mailing_auth', 'v1', false, 'Client mailing authorization for dispute package mailing.'),
  ('commission_disclosure', 'v1', false, 'Funding commission disclosure acceptance.'),
  ('sms_opt_in', 'v1', false, 'SMS opt-in consent.'),
  ('sms_opt_out', 'v1', false, 'SMS opt-out record.')
on conflict (consent_type) do nothing;
create or replace function public.nexus_all_known_user_ids()
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if to_regclass('public.consents') is not null then
    return query
    select distinct c.user_id
    from public.consents c
    where c.user_id is not null;
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    return query
    select distinct tm.user_id
    from public.tenant_memberships tm
    where tm.user_id is not null;
  end if;

  if to_regclass('public.tenant_members') is not null then
    return query
    select distinct tm.user_id
    from public.tenant_members tm
    where tm.user_id is not null;
  end if;
end;
$fn$;
grant execute on function public.nexus_all_known_user_ids() to authenticated;
create or replace view public.user_consent_status as
with cfg as (
  select
    coalesce((select current_version from public.consent_requirements where consent_type = 'terms'), 'v1') as terms_version,
    coalesce((select current_version from public.consent_requirements where consent_type = 'privacy'), 'v1') as privacy_version,
    coalesce((select current_version from public.consent_requirements where consent_type = 'ai_disclosure'), 'v1') as ai_disclosure_version,
    coalesce((select current_version from public.consent_requirements where consent_type = 'disclaimers'), 'v1') as disclaimers_version,
    coalesce((select current_version from public.consent_requirements where consent_type = 'comms_email'), 'v1') as comms_email_version
),
latest as (
  select
    c.user_id,
    c.tenant_id,
    c.consent_type,
    c.version,
    c.accepted_at,
    row_number() over (
      partition by c.user_id, c.consent_type
      order by c.accepted_at desc, c.created_at desc
    ) as rn
  from public.consents c
),
users as (
  select distinct u.user_id
  from public.nexus_all_known_user_ids() u
  where u.user_id is not null
),
required as (
  select cr.consent_type, cr.current_version
  from public.consent_requirements cr
  where cr.is_required = true
)
select
  u.user_id,
  nullif(max(l.tenant_id::text), '')::uuid as tenant_id,
  coalesce(bool_or(l.consent_type = 'terms' and l.version = cfg.terms_version and l.rn = 1), false) as terms_accepted,
  coalesce(bool_or(l.consent_type = 'privacy' and l.version = cfg.privacy_version and l.rn = 1), false) as privacy_accepted,
  coalesce(bool_or(l.consent_type = 'ai_disclosure' and l.version = cfg.ai_disclosure_version and l.rn = 1), false) as ai_disclosure_accepted,
  coalesce(bool_or(l.consent_type = 'disclaimers' and l.version = cfg.disclaimers_version and l.rn = 1), false) as disclaimers_accepted,
  coalesce(bool_or(l.consent_type = 'comms_email' and l.version = cfg.comms_email_version and l.rn = 1), false) as comms_email_accepted,
  case
    when exists (select 1 from required) then
      not exists (
        select 1
        from required r
        where not exists (
          select 1
          from latest rl
          where rl.user_id = u.user_id
            and rl.consent_type = r.consent_type
            and rl.version = r.current_version
            and rl.rn = 1
        )
      )
    else false
  end as has_required_consents,
  max(l.accepted_at) as last_accepted_at
from users u
left join latest l on l.user_id = u.user_id
cross join cfg
group by
  u.user_id,
  cfg.terms_version,
  cfg.privacy_version,
  cfg.ai_disclosure_version,
  cfg.disclaimers_version,
  cfg.comms_email_version;
grant select on public.user_consent_status to authenticated;
grant select, insert on public.consents to authenticated, service_role;
grant select, insert on public.audit_events to authenticated, service_role;
