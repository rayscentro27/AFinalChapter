-- Membership contract + entitlement hardening
-- Adds paid-upgrade consent types and DB-level feature entitlement helper.

create extension if not exists pgcrypto;
-- Preserve super-admin compatibility across role labels.
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
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'consent_type' AND n.nspname = 'public'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'consent_type'
      AND e.enumlabel = 'membership_agreement'
  ) THEN
    ALTER TYPE public.consent_type ADD VALUE 'membership_agreement';
  END IF;
END $do$;
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'consent_type' AND n.nspname = 'public'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'consent_type'
      AND e.enumlabel = 'refund_policy'
  ) THEN
    ALTER TYPE public.consent_type ADD VALUE 'refund_policy';
  END IF;
END $do$;
create or replace function public.can_access_feature(
  p_user_id uuid,
  p_feature_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  normalized_key text := upper(coalesce(trim(p_feature_key), ''));
  required_plan text := 'FREE';
  requires_commission_disclosure boolean := false;
  current_plan text := 'FREE';
  current_status public.subscription_status := 'active';
  commission_ok boolean := false;
begin
  if p_user_id is null or normalized_key = '' then
    return false;
  end if;

  if auth.uid() is distinct from p_user_id and not public.nexus_is_master_admin_compat() then
    return false;
  end if;

  if normalized_key in ('DISPUTE_LETTERS', 'ROADMAP') then
    required_plan := 'FREE';
  elsif normalized_key in ('BUSINESS_FORMATION', 'DOCUPOST_MAILING', 'GRANTS') then
    required_plan := 'GROWTH';
  elsif normalized_key in ('FUNDING_SEQUENCE', 'SBA_PREP', 'INVESTMENT_LIBRARY') then
    required_plan := 'PREMIUM';
  else
    return false;
  end if;

  if normalized_key in ('FUNDING_SEQUENCE', 'SBA_PREP') then
    requires_commission_disclosure := true;
  end if;

  if required_plan = 'FREE' then
    return true;
  end if;

  select s.plan_code, s.status
    into current_plan, current_status
  from public.subscriptions s
  where s.user_id = p_user_id
  order by s.updated_at desc, s.created_at desc
  limit 1;

  if current_plan is null then
    return false;
  end if;

  if current_status not in ('active', 'trialing') then
    return false;
  end if;

  if required_plan = 'GROWTH' and current_plan not in ('GROWTH', 'PREMIUM') then
    return false;
  end if;

  if required_plan = 'PREMIUM' and current_plan <> 'PREMIUM' then
    return false;
  end if;

  if requires_commission_disclosure then
    select exists (
      select 1
      from public.consents c
      where c.user_id = p_user_id
        and c.consent_type = 'commission_disclosure'::public.consent_type
    ) into commission_ok;

    if not commission_ok then
      return false;
    end if;
  end if;

  return true;
end;
$fn$;
grant execute on function public.can_access_feature(uuid, text) to authenticated;
