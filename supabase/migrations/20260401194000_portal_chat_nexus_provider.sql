-- Add first-party portal chat as a real shared-channel provider.
-- This keeps portal messages inside the existing conversations/messages model.

do $$
begin
  alter type public.channel_provider add value if not exists 'nexus_chat';
exception
  when duplicate_object then null;
end $$;

alter table if exists public.channel_accounts
  drop constraint if exists channel_accounts_provider_check;

alter table if exists public.channel_accounts
  add constraint channel_accounts_provider_check
  check (provider in ('twilio', 'meta', 'whatsapp', 'nexus_chat'));
