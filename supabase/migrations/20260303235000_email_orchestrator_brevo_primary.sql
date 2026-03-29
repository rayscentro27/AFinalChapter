-- Email orchestrator alignment: Brevo primary, MailerLite optional.
-- Removes Sender from active provider routing and tightens tenant/admin RLS semantics.

create extension if not exists pgcrypto;
create or replace function public.nexus_email_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
create or replace function public.nexus_email_can_read_tenant(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  has_access boolean := false;
begin
  if p_tenant_id is null then
    return false;
  end if;

  if to_regprocedure('public.nexus_is_super_admin_only()') is not null and public.nexus_is_super_admin_only() then
    return true;
  end if;

  if to_regprocedure('public.nexus_is_master_admin_compat()') is not null and public.nexus_is_master_admin_compat() then
    return true;
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
      )
    $sql$ into has_access using p_tenant_id;

    if coalesce(has_access, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
      )
    $sql$ into has_access using p_tenant_id;

    if coalesce(has_access, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;
grant execute on function public.nexus_email_can_read_tenant(uuid) to authenticated;
create or replace function public.nexus_email_can_manage_tenant(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  has_admin boolean := false;
begin
  if p_tenant_id is null then
    return false;
  end if;

  if to_regprocedure('public.nexus_is_super_admin_only()') is not null and public.nexus_is_super_admin_only() then
    return true;
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
          and lower(coalesce(tm.role, '')) in ('admin', 'owner', 'super_admin')
      )
    $sql$ into has_admin using p_tenant_id;

    if coalesce(has_admin, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
          and lower(coalesce(tm.role, '')) in ('admin', 'owner', 'super_admin')
      )
    $sql$ into has_admin using p_tenant_id;

    if coalesce(has_admin, false) then
      return true;
    end if;
  end if;

  if to_regprocedure('public.nexus_is_master_admin_compat()') is not null then
    return public.nexus_is_master_admin_compat();
  end if;

  return false;
end;
$fn$;
grant execute on function public.nexus_email_can_manage_tenant(uuid) to authenticated;
create table if not exists public.esp_providers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  provider text not null,
  is_enabled boolean not null default true,
  priority integer not null default 100,
  capabilities jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);
create table if not exists public.esp_routing_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  message_type text not null,
  primary_provider text not null,
  fallback_provider text null,
  throttle_per_min integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, message_type)
);
create table if not exists public.esp_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid null references auth.users(id) on delete set null,
  email text not null,
  full_name text,
  consent_transactional boolean not null default true,
  consent_marketing boolean not null default false,
  unsubscribed boolean not null default false,
  tags text[] not null default '{}'::text[],
  provider_refs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);
create table if not exists public.esp_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid null references auth.users(id) on delete set null,
  to_email text not null,
  message_type text not null,
  subject text not null,
  template_key text,
  provider text not null,
  provider_message_id text,
  status text not null default 'queued',
  error text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.esp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  provider text not null,
  provider_message_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.esp_send_counters (
  id bigserial primary key,
  tenant_id uuid not null,
  provider text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, window_start)
);
alter table public.esp_providers
  add column if not exists tenant_id uuid,
  add column if not exists provider text,
  add column if not exists is_enabled boolean,
  add column if not exists priority integer,
  add column if not exists capabilities jsonb,
  add column if not exists config jsonb,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;
alter table public.esp_routing_rules
  add column if not exists tenant_id uuid,
  add column if not exists message_type text,
  add column if not exists primary_provider text,
  add column if not exists fallback_provider text,
  add column if not exists throttle_per_min integer,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;
alter table public.esp_contacts
  add column if not exists tenant_id uuid,
  add column if not exists user_id uuid,
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists consent_transactional boolean,
  add column if not exists consent_marketing boolean,
  add column if not exists unsubscribed boolean,
  add column if not exists tags text[],
  add column if not exists provider_refs jsonb,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;
alter table public.esp_messages
  add column if not exists tenant_id uuid,
  add column if not exists user_id uuid,
  add column if not exists to_email text,
  add column if not exists message_type text,
  add column if not exists subject text,
  add column if not exists template_key text,
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists status text,
  add column if not exists error text,
  add column if not exists meta jsonb,
  add column if not exists created_at timestamptz;
alter table public.esp_webhook_events
  add column if not exists tenant_id uuid,
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists event_type text,
  add column if not exists payload jsonb,
  add column if not exists created_at timestamptz;
alter table public.esp_send_counters
  add column if not exists tenant_id uuid,
  add column if not exists provider text,
  add column if not exists window_start timestamptz,
  add column if not exists request_count integer,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;
update public.esp_routing_rules
set
  primary_provider = case when lower(coalesce(primary_provider, '')) = 'sender' then 'brevo' else primary_provider end,
  fallback_provider = case when lower(coalesce(fallback_provider, '')) = 'sender' then 'brevo' else fallback_provider end;
update public.esp_messages
set provider = 'brevo'
where lower(coalesce(provider, '')) = 'sender';
update public.esp_webhook_events
set provider = 'brevo'
where lower(coalesce(provider, '')) = 'sender';
update public.esp_send_counters
set provider = 'brevo'
where lower(coalesce(provider, '')) = 'sender';
delete from public.esp_providers
where lower(coalesce(provider, '')) = 'sender';
alter table public.esp_providers
  alter column is_enabled set default true,
  alter column priority set default 100,
  alter column capabilities set default '{}'::jsonb,
  alter column config set default '{}'::jsonb,
  alter column created_at set default now(),
  alter column updated_at set default now();
alter table public.esp_routing_rules
  alter column throttle_per_min set default 60,
  alter column created_at set default now(),
  alter column updated_at set default now();
alter table public.esp_contacts
  alter column consent_transactional set default true,
  alter column consent_marketing set default false,
  alter column unsubscribed set default false,
  alter column tags set default '{}'::text[],
  alter column provider_refs set default '{}'::jsonb,
  alter column created_at set default now(),
  alter column updated_at set default now();
alter table public.esp_messages
  alter column status set default 'queued',
  alter column meta set default '{}'::jsonb,
  alter column created_at set default now();
alter table public.esp_webhook_events
  alter column payload set default '{}'::jsonb,
  alter column created_at set default now();
alter table public.esp_send_counters
  alter column request_count set default 0,
  alter column created_at set default now(),
  alter column updated_at set default now();
update public.esp_providers
set
  is_enabled = coalesce(is_enabled, true),
  priority = coalesce(priority, 100),
  capabilities = coalesce(capabilities, '{}'::jsonb),
  config = coalesce(config, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;
update public.esp_routing_rules
set
  throttle_per_min = greatest(coalesce(throttle_per_min, 60), 1),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;
update public.esp_contacts
set
  consent_transactional = coalesce(consent_transactional, true),
  consent_marketing = coalesce(consent_marketing, false),
  unsubscribed = coalesce(unsubscribed, false),
  tags = coalesce(tags, '{}'::text[]),
  provider_refs = coalesce(provider_refs, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;
update public.esp_messages
set
  status = coalesce(status, 'queued'),
  meta = coalesce(meta, '{}'::jsonb),
  created_at = coalesce(created_at, now())
where true;
update public.esp_webhook_events
set
  payload = coalesce(payload, '{}'::jsonb),
  created_at = coalesce(created_at, now())
where true;
update public.esp_send_counters
set
  request_count = greatest(coalesce(request_count, 0), 0),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;
alter table public.esp_providers
  alter column tenant_id set not null,
  alter column provider set not null,
  alter column is_enabled set not null,
  alter column priority set not null,
  alter column capabilities set not null,
  alter column config set not null,
  alter column created_at set not null,
  alter column updated_at set not null;
alter table public.esp_routing_rules
  alter column tenant_id set not null,
  alter column message_type set not null,
  alter column primary_provider set not null,
  alter column throttle_per_min set not null,
  alter column created_at set not null,
  alter column updated_at set not null;
alter table public.esp_contacts
  alter column tenant_id set not null,
  alter column email set not null,
  alter column consent_transactional set not null,
  alter column consent_marketing set not null,
  alter column unsubscribed set not null,
  alter column tags set not null,
  alter column provider_refs set not null,
  alter column created_at set not null,
  alter column updated_at set not null;
alter table public.esp_messages
  alter column tenant_id set not null,
  alter column to_email set not null,
  alter column message_type set not null,
  alter column subject set not null,
  alter column provider set not null,
  alter column status set not null,
  alter column meta set not null,
  alter column created_at set not null;
alter table public.esp_webhook_events
  alter column provider set not null,
  alter column event_type set not null,
  alter column payload set not null,
  alter column created_at set not null;
alter table public.esp_send_counters
  alter column tenant_id set not null,
  alter column provider set not null,
  alter column window_start set not null,
  alter column request_count set not null,
  alter column created_at set not null,
  alter column updated_at set not null;
alter table public.esp_providers drop constraint if exists esp_providers_provider_check;
alter table public.esp_routing_rules drop constraint if exists esp_routing_rules_primary_provider_check;
alter table public.esp_routing_rules drop constraint if exists esp_routing_rules_fallback_provider_check;
alter table public.esp_messages drop constraint if exists esp_messages_provider_check;
alter table public.esp_webhook_events drop constraint if exists esp_webhook_events_provider_check;
alter table public.esp_send_counters drop constraint if exists esp_send_counters_provider_check;
alter table public.esp_messages drop constraint if exists esp_messages_message_type_check;
alter table public.esp_messages drop constraint if exists esp_messages_status_check;
alter table public.esp_routing_rules drop constraint if exists esp_routing_rules_message_type_check;
alter table public.esp_providers
  add constraint esp_providers_provider_check
  check (provider in ('brevo', 'mailerlite'));
alter table public.esp_routing_rules
  add constraint esp_routing_rules_message_type_check
  check (message_type in ('transactional', 'billing', 'system', 'onboarding', 'reminders', 'marketing', 'newsletter')),
  add constraint esp_routing_rules_primary_provider_check
  check (primary_provider in ('brevo', 'mailerlite')),
  add constraint esp_routing_rules_fallback_provider_check
  check (fallback_provider is null or fallback_provider in ('brevo', 'mailerlite')),
  add constraint esp_routing_rules_throttle_check
  check (throttle_per_min > 0);
alter table public.esp_messages
  add constraint esp_messages_message_type_check
  check (message_type in ('transactional', 'billing', 'system', 'onboarding', 'reminders', 'marketing', 'newsletter')),
  add constraint esp_messages_provider_check
  check (provider in ('brevo', 'mailerlite')),
  add constraint esp_messages_status_check
  check (status in ('queued', 'sent', 'failed', 'blocked', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'unsupported_send'));
alter table public.esp_webhook_events
  add constraint esp_webhook_events_provider_check
  check (provider in ('brevo', 'mailerlite'));
alter table public.esp_send_counters
  add constraint esp_send_counters_provider_check
  check (provider in ('brevo', 'mailerlite'));
create unique index if not exists esp_providers_tenant_provider_uidx
  on public.esp_providers (tenant_id, provider);
create index if not exists esp_providers_tenant_priority_idx
  on public.esp_providers (tenant_id, is_enabled, priority);
create unique index if not exists esp_routing_rules_tenant_type_uidx
  on public.esp_routing_rules (tenant_id, message_type);
create index if not exists esp_routing_rules_tenant_type_idx
  on public.esp_routing_rules (tenant_id, message_type);
create unique index if not exists esp_contacts_tenant_email_uidx
  on public.esp_contacts (tenant_id, email);
create index if not exists esp_contacts_tenant_user_idx
  on public.esp_contacts (tenant_id, user_id);
create index if not exists esp_contacts_tenant_email_idx
  on public.esp_contacts (tenant_id, email);
create index if not exists esp_messages_tenant_created_idx
  on public.esp_messages (tenant_id, created_at desc);
create index if not exists esp_messages_tenant_status_idx
  on public.esp_messages (tenant_id, status, created_at desc);
create index if not exists esp_messages_provider_message_idx
  on public.esp_messages (provider, provider_message_id);
create index if not exists esp_webhook_events_tenant_created_idx
  on public.esp_webhook_events (tenant_id, created_at desc);
create index if not exists esp_webhook_events_provider_message_idx
  on public.esp_webhook_events (provider, provider_message_id, created_at desc);
create unique index if not exists esp_send_counters_unique_window_uidx
  on public.esp_send_counters (tenant_id, provider, window_start);
create index if not exists esp_send_counters_lookup_idx
  on public.esp_send_counters (tenant_id, provider, window_start desc);
drop trigger if exists trg_esp_providers_set_updated_at on public.esp_providers;
create trigger trg_esp_providers_set_updated_at
before update on public.esp_providers
for each row execute procedure public.nexus_email_set_updated_at();
drop trigger if exists trg_esp_routing_rules_set_updated_at on public.esp_routing_rules;
create trigger trg_esp_routing_rules_set_updated_at
before update on public.esp_routing_rules
for each row execute procedure public.nexus_email_set_updated_at();
drop trigger if exists trg_esp_contacts_set_updated_at on public.esp_contacts;
create trigger trg_esp_contacts_set_updated_at
before update on public.esp_contacts
for each row execute procedure public.nexus_email_set_updated_at();
drop trigger if exists trg_esp_send_counters_set_updated_at on public.esp_send_counters;
create trigger trg_esp_send_counters_set_updated_at
before update on public.esp_send_counters
for each row execute procedure public.nexus_email_set_updated_at();
alter table public.esp_providers enable row level security;
alter table public.esp_routing_rules enable row level security;
alter table public.esp_contacts enable row level security;
alter table public.esp_messages enable row level security;
alter table public.esp_webhook_events enable row level security;
alter table public.esp_send_counters enable row level security;
drop policy if exists esp_providers_select_admin on public.esp_providers;
drop policy if exists esp_providers_write_admin on public.esp_providers;
create policy esp_providers_select_admin
on public.esp_providers
for select to authenticated
using (public.nexus_email_can_manage_tenant(tenant_id));
create policy esp_providers_write_admin
on public.esp_providers
for all to authenticated
using (public.nexus_email_can_manage_tenant(tenant_id))
with check (public.nexus_email_can_manage_tenant(tenant_id));
drop policy if exists esp_routing_rules_select_admin on public.esp_routing_rules;
drop policy if exists esp_routing_rules_write_admin on public.esp_routing_rules;
create policy esp_routing_rules_select_admin
on public.esp_routing_rules
for select to authenticated
using (public.nexus_email_can_manage_tenant(tenant_id));
create policy esp_routing_rules_write_admin
on public.esp_routing_rules
for all to authenticated
using (public.nexus_email_can_manage_tenant(tenant_id))
with check (public.nexus_email_can_manage_tenant(tenant_id));
drop policy if exists esp_contacts_select_own_or_admin on public.esp_contacts;
drop policy if exists esp_contacts_insert_own_or_admin on public.esp_contacts;
drop policy if exists esp_contacts_update_own_or_admin on public.esp_contacts;
create policy esp_contacts_select_own_or_admin
on public.esp_contacts
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_email_can_manage_tenant(tenant_id)
);
create policy esp_contacts_insert_own_or_admin
on public.esp_contacts
for insert to authenticated
with check (
  auth.uid() = user_id
  or public.nexus_email_can_manage_tenant(tenant_id)
);
create policy esp_contacts_update_own_or_admin
on public.esp_contacts
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_email_can_manage_tenant(tenant_id)
)
with check (
  auth.uid() = user_id
  or public.nexus_email_can_manage_tenant(tenant_id)
);
drop policy if exists esp_messages_select_own_or_admin on public.esp_messages;
drop policy if exists esp_messages_insert_own_or_admin on public.esp_messages;
drop policy if exists esp_messages_update_admin on public.esp_messages;
create policy esp_messages_select_own_or_admin
on public.esp_messages
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_email_can_manage_tenant(tenant_id)
);
create policy esp_messages_insert_own_or_admin
on public.esp_messages
for insert to authenticated
with check (
  auth.uid() = user_id
  or public.nexus_email_can_manage_tenant(tenant_id)
);
create policy esp_messages_update_admin
on public.esp_messages
for update to authenticated
using (public.nexus_email_can_manage_tenant(tenant_id))
with check (public.nexus_email_can_manage_tenant(tenant_id));
drop policy if exists esp_webhook_events_select_admin on public.esp_webhook_events;
drop policy if exists esp_webhook_events_insert_admin on public.esp_webhook_events;
create policy esp_webhook_events_select_admin
on public.esp_webhook_events
for select to authenticated
using (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id));
create policy esp_webhook_events_insert_admin
on public.esp_webhook_events
for insert to authenticated
with check (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id));
drop policy if exists esp_send_counters_select_admin on public.esp_send_counters;
drop policy if exists esp_send_counters_write_admin on public.esp_send_counters;
create policy esp_send_counters_select_admin
on public.esp_send_counters
for select to authenticated
using (public.nexus_email_can_manage_tenant(tenant_id));
create policy esp_send_counters_write_admin
on public.esp_send_counters
for all to authenticated
using (public.nexus_email_can_manage_tenant(tenant_id))
with check (public.nexus_email_can_manage_tenant(tenant_id));
grant select, insert, update on public.esp_providers to authenticated, service_role;
grant select, insert, update on public.esp_routing_rules to authenticated, service_role;
grant select, insert, update on public.esp_contacts to authenticated, service_role;
grant select, insert, update on public.esp_messages to authenticated, service_role;
grant select, insert on public.esp_webhook_events to authenticated, service_role;
grant select, insert, update on public.esp_send_counters to authenticated, service_role;
with tenant_pool as (
  select distinct t.id as tenant_id
  from public.tenants t
  union
  select distinct ep.tenant_id from public.esp_providers ep where ep.tenant_id is not null
  union
  select distinct er.tenant_id from public.esp_routing_rules er where er.tenant_id is not null
  union
  select distinct ec.tenant_id from public.esp_contacts ec where ec.tenant_id is not null
  union
  select distinct em.tenant_id from public.esp_messages em where em.tenant_id is not null
)
insert into public.esp_providers (tenant_id, provider, is_enabled, priority, capabilities, config)
select
  tp.tenant_id,
  seed.provider,
  seed.is_enabled,
  seed.priority,
  seed.capabilities,
  '{}'::jsonb
from tenant_pool tp
cross join (
  values
    ('brevo'::text, true, 10, '{"transactional": true, "marketing": true}'::jsonb),
    ('mailerlite'::text, false, 20, '{"transactional": false, "marketing": true, "contact_sync": true}'::jsonb)
) as seed(provider, is_enabled, priority, capabilities)
on conflict (tenant_id, provider) do update
set
  capabilities = excluded.capabilities,
  updated_at = now();
with tenant_pool as (
  select distinct t.id as tenant_id
  from public.tenants t
  union
  select distinct ep.tenant_id from public.esp_providers ep where ep.tenant_id is not null
  union
  select distinct er.tenant_id from public.esp_routing_rules er where er.tenant_id is not null
)
insert into public.esp_routing_rules (tenant_id, message_type, primary_provider, fallback_provider, throttle_per_min)
select
  tp.tenant_id,
  seed.message_type,
  seed.primary_provider,
  seed.fallback_provider,
  seed.throttle_per_min
from tenant_pool tp
cross join (
  values
    ('transactional'::text, 'brevo'::text, null::text, 90),
    ('billing'::text, 'brevo'::text, null::text, 90),
    ('system'::text, 'brevo'::text, null::text, 90),
    ('onboarding'::text, 'brevo'::text, null::text, 60),
    ('reminders'::text, 'brevo'::text, null::text, 60),
    ('marketing'::text, 'mailerlite'::text, 'brevo'::text, 30),
    ('newsletter'::text, 'mailerlite'::text, 'brevo'::text, 30)
) as seed(message_type, primary_provider, fallback_provider, throttle_per_min)
on conflict (tenant_id, message_type) do update
set
  primary_provider = case
    when lower(coalesce(public.esp_routing_rules.primary_provider, '')) = 'sender' then excluded.primary_provider
    else public.esp_routing_rules.primary_provider
  end,
  fallback_provider = case
    when lower(coalesce(public.esp_routing_rules.fallback_provider, '')) = 'sender' then excluded.fallback_provider
    else public.esp_routing_rules.fallback_provider
  end,
  throttle_per_min = greatest(coalesce(public.esp_routing_rules.throttle_per_min, excluded.throttle_per_min), 1),
  updated_at = now();
