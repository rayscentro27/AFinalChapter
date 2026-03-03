-- SMS compliance alignment
-- Adds strict super-admin helper, SMS status RPC alias, and super-admin write policy for SMS templates.

create or replace function public.nexus_is_super_admin_only()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  is_super boolean := false;
begin
  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and lower(coalesce(tm.role, '')) = 'super_admin'
      )
    $sql$ into is_super;

    if coalesce(is_super, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and lower(coalesce(tm.role, '')) = 'super_admin'
      )
    $sql$ into is_super;

    if coalesce(is_super, false) then
      return true;
    end if;
  end if;

  return lower(coalesce(auth.jwt() ->> 'role', '')) = 'super_admin';
end;
$fn$;

grant execute on function public.nexus_is_super_admin_only() to authenticated;

-- Alias required by product surface: getSmsConsentStatus(user_id)
create or replace function public.getsmsconsentstatus(p_user_id uuid default auth.uid())
returns table (
  user_id uuid,
  is_opted_in boolean,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  phone_e164 text,
  purpose text[],
  last_method text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select *
  from public.get_sms_consent_status(p_user_id);
$fn$;

grant execute on function public.getsmsconsentstatus(uuid) to authenticated;

-- Quoted camelCase alias for direct SQL integrations.
create or replace function public."getSmsConsentStatus"(p_user_id uuid default auth.uid())
returns table (
  user_id uuid,
  is_opted_in boolean,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  phone_e164 text,
  purpose text[],
  last_method text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select *
  from public.get_sms_consent_status(p_user_id);
$fn$;

grant execute on function public."getSmsConsentStatus"(uuid) to authenticated;

-- SMS template writes restricted to super_admin.
drop policy if exists sms_templates_admin_write on public.sms_templates;
create policy sms_templates_admin_write
on public.sms_templates
for all to authenticated
using (public.nexus_is_super_admin_only())
with check (public.nexus_is_super_admin_only());

-- Explicit SMS consent read policy for super_admin visibility.
drop policy if exists consents_select_sms_super_admin on public.consents;
create policy consents_select_sms_super_admin
on public.consents
for select to authenticated
using (
  consent_type in ('sms_opt_in'::public.consent_type, 'sms_opt_out'::public.consent_type)
  and public.nexus_is_super_admin_only()
);
