-- SMS opt-in compliance framework (Prompt 3)
-- Consent + policy + templates only. No provider sending integration.

create extension if not exists pgcrypto;

-- Compatibility helpers
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

create or replace function public.nexus_can_access_user_compat(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select auth.uid() = p_user_id or public.nexus_is_master_admin_compat();
$fn$;

grant execute on function public.nexus_can_access_user_compat(uuid) to authenticated;

-- Communication preferences (email marketing toggle; transactional email remains always on)
create table if not exists public.communication_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid null,
  marketing_email_opt_in boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.communication_preferences enable row level security;

DROP POLICY IF EXISTS communication_preferences_select_own_or_admin ON public.communication_preferences;
create policy communication_preferences_select_own_or_admin
on public.communication_preferences
for select to authenticated
using (public.nexus_can_access_user_compat(user_id));

DROP POLICY IF EXISTS communication_preferences_insert_own_or_admin ON public.communication_preferences;
create policy communication_preferences_insert_own_or_admin
on public.communication_preferences
for insert to authenticated
with check (public.nexus_can_access_user_compat(user_id));

DROP POLICY IF EXISTS communication_preferences_update_own_or_admin ON public.communication_preferences;
create policy communication_preferences_update_own_or_admin
on public.communication_preferences
for update to authenticated
using (public.nexus_can_access_user_compat(user_id))
with check (public.nexus_can_access_user_compat(user_id));

-- SMS templates table for compliance-ready drafts (no sending in this phase)
create table if not exists public.sms_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('TASK_REMINDER', 'BILLING_ALERT', 'LOGIN_CODE', 'SUPPORT_FOLLOWUP')),
  body text not null,
  is_marketing boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sms_templates_marketing_idx on public.sms_templates (is_marketing);

alter table public.sms_templates enable row level security;

DROP POLICY IF EXISTS sms_templates_select_all ON public.sms_templates;
create policy sms_templates_select_all
on public.sms_templates
for select to authenticated
using (true);

DROP POLICY IF EXISTS sms_templates_admin_write ON public.sms_templates;
create policy sms_templates_admin_write
on public.sms_templates
for all to authenticated
using (public.nexus_is_master_admin_compat())
with check (public.nexus_is_master_admin_compat());

insert into public.sms_templates (key, body, is_marketing)
values
  (
    'TASK_REMINDER',
    'Hi {{first_name}}, reminder: {{task_title}} is still pending in your Nexus workspace. Reply HELP for support.',
    false
  ),
  (
    'BILLING_ALERT',
    'Hi {{first_name}}, billing alert for your Nexus membership: {{billing_status}}. Reply HELP for support.',
    false
  ),
  (
    'LOGIN_CODE',
    'Your Nexus login code is {{code}}. This code expires in {{minutes}} minutes.',
    false
  ),
  (
    'SUPPORT_FOLLOWUP',
    'Hi {{first_name}}, this is Nexus support checking in on {{topic}}. Reply STOP to opt out or HELP for help.',
    true
  )
on conflict (key) do update
set body = excluded.body,
    is_marketing = excluded.is_marketing,
    updated_at = now();

-- Server-side helper for current SMS consent state.
create or replace function public.get_sms_consent_status(p_user_id uuid default auth.uid())
returns table (
  user_id uuid,
  is_opted_in boolean,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  phone_e164 text,
  purpose text[],
  last_method text
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  latest_in record;
  latest_out record;
  effective_opt_in boolean := false;
begin
  if p_user_id is null then
    return;
  end if;

  if not public.nexus_can_access_user_compat(p_user_id) then
    return;
  end if;

  select c.accepted_at, c.metadata
  into latest_in
  from public.consents c
  where c.user_id = p_user_id
    and c.consent_type = 'sms_opt_in'
  order by c.accepted_at desc, c.created_at desc
  limit 1;

  select c.accepted_at, c.metadata
  into latest_out
  from public.consents c
  where c.user_id = p_user_id
    and c.consent_type = 'sms_opt_out'
  order by c.accepted_at desc, c.created_at desc
  limit 1;

  if latest_in.accepted_at is not null then
    if latest_out.accepted_at is null then
      effective_opt_in := true;
    elsif latest_in.accepted_at > latest_out.accepted_at then
      effective_opt_in := true;
    end if;
  end if;

  return query
  select
    p_user_id,
    effective_opt_in,
    latest_in.accepted_at,
    latest_out.accepted_at,
    coalesce(
      latest_in.metadata ->> 'phone_e164',
      latest_out.metadata ->> 'phone_e164'
    ) as phone_e164,
    case
      when jsonb_typeof(latest_in.metadata -> 'purpose') = 'array'
      then array(
        select jsonb_array_elements_text(latest_in.metadata -> 'purpose')
      )
      else null
    end as purpose,
    coalesce(latest_out.metadata ->> 'method', 'settings') as last_method;
end;
$fn$;

grant execute on function public.get_sms_consent_status(uuid) to authenticated;
