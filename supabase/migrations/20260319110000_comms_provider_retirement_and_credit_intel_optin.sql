-- Safe deprecation pass for retired communication channels/providers.
-- Goals:
-- 1) keep historical rows readable
-- 2) block new writes that re-introduce sms/twilio/whatsapp in active paths
-- 3) align credit-intel consent fields to portal_message + email

-- ---------------------------------------------------------------------------
-- Credit-intel consent alignment (non-destructive)
-- ---------------------------------------------------------------------------
alter table if exists public.client_alert_prefs
  add column if not exists portal_message_opt_in boolean,
  add column if not exists email_opt_in boolean;

update public.client_alert_prefs
set portal_message_opt_in = coalesce(portal_message_opt_in, sms_opt_in, false)
where portal_message_opt_in is null;

update public.client_alert_prefs
set email_opt_in = coalesce(email_opt_in, false)
where email_opt_in is null;

alter table if exists public.client_alert_prefs
  alter column portal_message_opt_in set default false,
  alter column email_opt_in set default false;

alter table if exists public.client_alert_prefs
  alter column portal_message_opt_in set not null,
  alter column email_opt_in set not null;

create index if not exists client_alert_prefs_tenant_portal_optin_idx
  on public.client_alert_prefs (tenant_id, portal_message_opt_in);

alter table if exists public.credit_intel_matches
  alter column alert_channel set default 'portal_message';

-- ---------------------------------------------------------------------------
-- Retired channel/provider guardrails for active writes
-- ---------------------------------------------------------------------------
create or replace function public.nexus_is_retired_comm_value(value text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(value, '')) in ('sms', 'twilio', 'whatsapp');
$$;

create or replace function public.nexus_reject_retired_comm_values()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_provider text := lower(coalesce(to_jsonb(new)->>'provider', ''));
  v_channel text := lower(coalesce(to_jsonb(new)->>'channel', ''));
  v_alert_channel text := lower(coalesce(to_jsonb(new)->>'alert_channel', ''));
  v_old_provider text := lower(coalesce(to_jsonb(old)->>'provider', ''));
  v_old_channel text := lower(coalesce(to_jsonb(old)->>'channel', ''));
  v_old_alert_channel text := lower(coalesce(to_jsonb(old)->>'alert_channel', ''));
begin
  if public.nexus_is_retired_comm_value(v_provider)
     and (tg_op = 'INSERT' or v_provider is distinct from v_old_provider)
  then
    raise exception 'provider % is retired; allowed active providers are meta/email/portal_message paths', v_provider
      using errcode = '23514';
  end if;

  if public.nexus_is_retired_comm_value(v_channel)
     and (tg_op = 'INSERT' or v_channel is distinct from v_old_channel)
  then
    raise exception 'channel % is retired; use portal_message, email, facebook_messenger, or instagram_messenger', v_channel
      using errcode = '23514';
  end if;

  if public.nexus_is_retired_comm_value(v_alert_channel)
     and (tg_op = 'INSERT' or v_alert_channel is distinct from v_old_alert_channel)
  then
    raise exception 'alert_channel % is retired; use portal_message or email', v_alert_channel
      using errcode = '23514';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.channel_accounts') is not null then
    execute 'drop trigger if exists trg_channel_accounts_reject_retired_comm_values on public.channel_accounts';
    execute 'create trigger trg_channel_accounts_reject_retired_comm_values before insert or update on public.channel_accounts for each row execute function public.nexus_reject_retired_comm_values()';
  end if;

  if to_regclass('public.provider_events') is not null then
    execute 'drop trigger if exists trg_provider_events_reject_retired_comm_values on public.provider_events';
    execute 'create trigger trg_provider_events_reject_retired_comm_values before insert or update on public.provider_events for each row execute function public.nexus_reject_retired_comm_values()';
  end if;

  if to_regclass('public.outbox_messages') is not null then
    execute 'drop trigger if exists trg_outbox_messages_reject_retired_comm_values on public.outbox_messages';
    execute 'create trigger trg_outbox_messages_reject_retired_comm_values before insert or update on public.outbox_messages for each row execute function public.nexus_reject_retired_comm_values()';
  end if;

  if to_regclass('public.message_delivery_events') is not null then
    execute 'drop trigger if exists trg_message_delivery_events_reject_retired_comm_values on public.message_delivery_events';
    execute 'create trigger trg_message_delivery_events_reject_retired_comm_values before insert or update on public.message_delivery_events for each row execute function public.nexus_reject_retired_comm_values()';
  end if;

  if to_regclass('public.conversation_participants') is not null then
    execute 'drop trigger if exists trg_conversation_participants_reject_retired_comm_values on public.conversation_participants';
    execute 'create trigger trg_conversation_participants_reject_retired_comm_values before insert or update on public.conversation_participants for each row execute function public.nexus_reject_retired_comm_values()';
  end if;

  if to_regclass('public.tenant_integrations') is not null then
    execute 'drop trigger if exists trg_tenant_integrations_reject_retired_comm_values on public.tenant_integrations';
    execute 'create trigger trg_tenant_integrations_reject_retired_comm_values before insert or update on public.tenant_integrations for each row execute function public.nexus_reject_retired_comm_values()';
  end if;

  if to_regclass('public.tenant_channel_pools') is not null then
    execute 'drop trigger if exists trg_tenant_channel_pools_reject_retired_comm_values on public.tenant_channel_pools';
    execute 'create trigger trg_tenant_channel_pools_reject_retired_comm_values before insert or update on public.tenant_channel_pools for each row execute function public.nexus_reject_retired_comm_values()';
  end if;

  if to_regclass('public.tenant_on_call') is not null then
    execute 'drop trigger if exists trg_tenant_on_call_reject_retired_comm_values on public.tenant_on_call';
    execute 'create trigger trg_tenant_on_call_reject_retired_comm_values before insert or update on public.tenant_on_call for each row execute function public.nexus_reject_retired_comm_values()';
  end if;

  if to_regclass('public.conversations') is not null then
    execute 'drop trigger if exists trg_conversations_reject_retired_comm_values on public.conversations';
    execute 'create trigger trg_conversations_reject_retired_comm_values before insert or update on public.conversations for each row execute function public.nexus_reject_retired_comm_values()';
  end if;

  if to_regclass('public.credit_intel_matches') is not null then
    execute 'drop trigger if exists trg_credit_intel_matches_reject_retired_comm_values on public.credit_intel_matches';
    execute 'create trigger trg_credit_intel_matches_reject_retired_comm_values before insert or update on public.credit_intel_matches for each row execute function public.nexus_reject_retired_comm_values()';
  end if;
end;
$$;
