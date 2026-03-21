-- Legal pages + user consent framework
-- Phase 1 launch prerequisite

create extension if not exists pgcrypto;
-- Compatibility helper: supports projects that use either tenant_memberships,
-- tenant_members, or JWT-only role claims.
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
          and tm.role = 'admin'
      )
    $sql$ into is_admin;
    return coalesce(is_admin, false);
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.role = 'admin'
      )
    $sql$ into is_admin;
    return coalesce(is_admin, false);
  end if;

  return coalesce((auth.jwt() ->> 'role') = 'admin', false);
end;
$fn$;
grant execute on function public.nexus_is_master_admin_compat() to authenticated;
-- 1) Versioned consent enum
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'consent_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.consent_type AS ENUM (
      'terms',
      'privacy',
      'ai_disclosure',
      'disclaimers',
      'comms_email',
      'docupost_mailing_auth',
      'commission_disclosure',
      'sms_opt_in',
      'sms_opt_out'
    );
  END IF;
END $do$;
-- 2) Durable user consent records
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
DROP POLICY IF EXISTS consents_select_own ON public.consents;
CREATE POLICY consents_select_own ON public.consents
FOR SELECT TO authenticated
USING (auth.uid() = user_id);
DROP POLICY IF EXISTS consents_select_master_admin ON public.consents;
CREATE POLICY consents_select_master_admin ON public.consents
FOR SELECT TO authenticated
USING (public.nexus_is_master_admin_compat());
DROP POLICY IF EXISTS consents_insert_own ON public.consents;
CREATE POLICY consents_insert_own ON public.consents
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
-- 3) Keep audit_events compatible with consent logging contract.
create table if not exists public.audit_events (
  id bigserial primary key,
  tenant_id uuid not null,
  actor_user_id uuid,
  event_type text,
  metadata jsonb,
  created_at timestamptz default now()
);
alter table public.audit_events add column if not exists event_type text;
alter table public.audit_events add column if not exists created_at timestamptz;
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_events'
      AND column_name = 'action'
  ) THEN
    EXECUTE $sql$
      UPDATE public.audit_events
      SET event_type = coalesce(event_type, action, 'event')
      WHERE event_type IS NULL
    $sql$;
  ELSE
    EXECUTE $sql$
      UPDATE public.audit_events
      SET event_type = coalesce(event_type, 'event')
      WHERE event_type IS NULL
    $sql$;
  END IF;
END $do$;
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_events'
      AND column_name = 'occurred_at'
  ) THEN
    EXECUTE $sql$
      UPDATE public.audit_events
      SET created_at = coalesce(created_at, occurred_at, now())
      WHERE created_at IS NULL
    $sql$;
  ELSE
    EXECUTE $sql$
      UPDATE public.audit_events
      SET created_at = coalesce(created_at, now())
      WHERE created_at IS NULL
    $sql$;
  END IF;
END $do$;
alter table public.audit_events alter column created_at set default now();
-- 4) Summarized status view for consent gate + admin oversight
create or replace view public.user_consent_status as
with latest as (
  select
    c.user_id,
    c.tenant_id,
    c.consent_type,
    c.version,
    c.accepted_at,
    row_number() over (partition by c.user_id, c.consent_type order by c.accepted_at desc, c.created_at desc) as rn
  from public.consents c
)
select
  l.user_id,
  nullif(max(l.tenant_id::text), '')::uuid as tenant_id,
  bool_or(l.consent_type = 'terms' and l.version = 'v1' and l.rn = 1) as terms_accepted,
  bool_or(l.consent_type = 'privacy' and l.version = 'v1' and l.rn = 1) as privacy_accepted,
  bool_or(l.consent_type = 'ai_disclosure' and l.version = 'v1' and l.rn = 1) as ai_disclosure_accepted,
  bool_or(l.consent_type = 'disclaimers' and l.version = 'v1' and l.rn = 1) as disclaimers_accepted,
  bool_or(l.consent_type = 'comms_email' and l.version = 'v1' and l.rn = 1) as comms_email_accepted,
  (
    bool_or(l.consent_type = 'terms' and l.version = 'v1' and l.rn = 1)
    and bool_or(l.consent_type = 'privacy' and l.version = 'v1' and l.rn = 1)
    and bool_or(l.consent_type = 'ai_disclosure' and l.version = 'v1' and l.rn = 1)
    and bool_or(l.consent_type = 'disclaimers' and l.version = 'v1' and l.rn = 1)
    and bool_or(l.consent_type = 'comms_email' and l.version = 'v1' and l.rn = 1)
  ) as has_required_consents,
  coalesce(max(l.accepted_at), now()) as last_accepted_at
from latest l
group by l.user_id;
grant select on public.user_consent_status to authenticated;
