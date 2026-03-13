-- Optional explicit auth fields for channel accounts (Meta-first outbox sender).
-- Kept nullable for backward compatibility; metadata fallback remains supported.

alter table public.channel_accounts
  add column if not exists access_token text,
  add column if not exists api_version text;

-- Seed default API version for existing rows when empty.
update public.channel_accounts
set api_version = coalesce(nullif(api_version, ''), 'v22.0')
where provider = 'meta';
