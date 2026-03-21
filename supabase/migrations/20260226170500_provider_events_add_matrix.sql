alter table if exists public.provider_events
  drop constraint if exists provider_events_provider_check;
alter table if exists public.provider_events
  add constraint provider_events_provider_check
  check (provider in ('twilio', 'meta', 'whatsapp', 'matrix', 'google_voice'));
