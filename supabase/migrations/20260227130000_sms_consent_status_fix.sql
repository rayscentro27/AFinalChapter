-- Fix get_sms_consent_status for users with no consent rows

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
  latest_in_at timestamptz;
  latest_in_metadata jsonb := '{}'::jsonb;
  latest_out_at timestamptz;
  latest_out_metadata jsonb := '{}'::jsonb;
  effective_opt_in boolean := false;
begin
  if p_user_id is null then
    return;
  end if;

  if not public.nexus_can_access_user_compat(p_user_id) then
    return;
  end if;

  select c.accepted_at, coalesce(c.metadata, '{}'::jsonb)
    into latest_in_at, latest_in_metadata
  from public.consents c
  where c.user_id = p_user_id
    and c.consent_type = 'sms_opt_in'
  order by c.accepted_at desc, c.created_at desc
  limit 1;

  select c.accepted_at, coalesce(c.metadata, '{}'::jsonb)
    into latest_out_at, latest_out_metadata
  from public.consents c
  where c.user_id = p_user_id
    and c.consent_type = 'sms_opt_out'
  order by c.accepted_at desc, c.created_at desc
  limit 1;

  if latest_in_at is not null then
    if latest_out_at is null then
      effective_opt_in := true;
    elsif latest_in_at > latest_out_at then
      effective_opt_in := true;
    end if;
  end if;

  return query
  select
    p_user_id,
    effective_opt_in,
    latest_in_at,
    latest_out_at,
    coalesce(
      latest_in_metadata ->> 'phone_e164',
      latest_out_metadata ->> 'phone_e164'
    ) as phone_e164,
    case
      when jsonb_typeof(latest_in_metadata -> 'purpose') = 'array'
      then array(select jsonb_array_elements_text(latest_in_metadata -> 'purpose'))
      else null
    end as purpose,
    coalesce(latest_out_metadata ->> 'method', 'settings') as last_method;
end;
$fn$;

grant execute on function public.get_sms_consent_status(uuid) to authenticated;
