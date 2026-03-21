-- Prompt 7: Production Email Orchestrator (Sender + Brevo + MailerLite)

create extension if not exists pgcrypto;
-- Compatibility helpers may already exist from previous prompts.
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
create or replace function public.nexus_can_access_tenant_compat(t uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  has_access boolean := false;
begin
  if t is null then
    return false;
  end if;

  if public.nexus_is_master_admin_compat() then
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
    $sql$ into has_access using t;

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
    $sql$ into has_access using t;

    if coalesce(has_access, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;
grant execute on function public.nexus_can_access_tenant_compat(uuid) to authenticated;
create or replace function public.nexus_email_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
create table if not exists public.esp_providers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  provider text not null check (provider in ('sender', 'brevo', 'mailerlite')),
  is_enabled boolean not null default true,
  priority integer not null default 100,
  capabilities jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);
create index if not exists esp_providers_tenant_priority_idx
  on public.esp_providers (tenant_id, is_enabled, priority);
create table if not exists public.esp_routing_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  message_type text not null check (message_type in ('transactional', 'billing', 'system', 'onboarding', 'reminders', 'marketing', 'newsletter')),
  primary_provider text not null check (primary_provider in ('sender', 'brevo', 'mailerlite')),
  fallback_provider text null check (fallback_provider in ('sender', 'brevo', 'mailerlite')),
  throttle_per_min integer not null default 60 check (throttle_per_min > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, message_type)
);
create index if not exists esp_routing_rules_tenant_type_idx
  on public.esp_routing_rules (tenant_id, message_type);
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
create index if not exists esp_contacts_tenant_user_idx
  on public.esp_contacts (tenant_id, user_id);
create index if not exists esp_contacts_tenant_email_idx
  on public.esp_contacts (tenant_id, email);
create table if not exists public.esp_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid null references auth.users(id) on delete set null,
  to_email text not null,
  message_type text not null check (message_type in ('transactional', 'billing', 'system', 'onboarding', 'reminders', 'marketing', 'newsletter')),
  subject text not null,
  template_key text,
  provider text not null check (provider in ('sender', 'brevo', 'mailerlite')),
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'blocked', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'unsupported_send')),
  error text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists esp_messages_tenant_created_idx
  on public.esp_messages (tenant_id, created_at desc);
create index if not exists esp_messages_tenant_status_idx
  on public.esp_messages (tenant_id, status, created_at desc);
create index if not exists esp_messages_provider_message_idx
  on public.esp_messages (provider, provider_message_id);
create table if not exists public.esp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  provider text not null check (provider in ('sender', 'brevo', 'mailerlite')),
  provider_message_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists esp_webhook_events_tenant_created_idx
  on public.esp_webhook_events (tenant_id, created_at desc);
create index if not exists esp_webhook_events_provider_message_idx
  on public.esp_webhook_events (provider, provider_message_id, created_at desc);
create table if not exists public.esp_send_counters (
  id bigserial primary key,
  tenant_id uuid not null,
  provider text not null check (provider in ('sender', 'brevo', 'mailerlite')),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, window_start)
);
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
-- Providers: admin/super admin only.
DROP POLICY IF EXISTS esp_providers_select_admin ON public.esp_providers;
create policy esp_providers_select_admin
on public.esp_providers
for select to authenticated
using (public.nexus_is_master_admin_compat() or public.nexus_can_access_tenant_compat(tenant_id));
DROP POLICY IF EXISTS esp_providers_write_admin ON public.esp_providers;
create policy esp_providers_write_admin
on public.esp_providers
for all to authenticated
using (public.nexus_is_master_admin_compat())
with check (public.nexus_is_master_admin_compat());
-- Routing: admin/super admin only.
DROP POLICY IF EXISTS esp_routing_rules_select_admin ON public.esp_routing_rules;
create policy esp_routing_rules_select_admin
on public.esp_routing_rules
for select to authenticated
using (public.nexus_is_master_admin_compat() or public.nexus_can_access_tenant_compat(tenant_id));
DROP POLICY IF EXISTS esp_routing_rules_write_admin ON public.esp_routing_rules;
create policy esp_routing_rules_write_admin
on public.esp_routing_rules
for all to authenticated
using (public.nexus_is_master_admin_compat())
with check (public.nexus_is_master_admin_compat());
-- Contacts: user reads own, admins read tenant, writes for own or admin.
DROP POLICY IF EXISTS esp_contacts_select_own_or_admin ON public.esp_contacts;
create policy esp_contacts_select_own_or_admin
on public.esp_contacts
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_is_master_admin_compat()
  or public.nexus_can_access_tenant_compat(tenant_id)
);
DROP POLICY IF EXISTS esp_contacts_insert_own_or_admin ON public.esp_contacts;
create policy esp_contacts_insert_own_or_admin
on public.esp_contacts
for insert to authenticated
with check (
  auth.uid() = user_id
  or public.nexus_is_master_admin_compat()
  or public.nexus_can_access_tenant_compat(tenant_id)
);
DROP POLICY IF EXISTS esp_contacts_update_own_or_admin ON public.esp_contacts;
create policy esp_contacts_update_own_or_admin
on public.esp_contacts
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_is_master_admin_compat()
  or public.nexus_can_access_tenant_compat(tenant_id)
)
with check (
  auth.uid() = user_id
  or public.nexus_is_master_admin_compat()
  or public.nexus_can_access_tenant_compat(tenant_id)
);
-- Messages: user reads own, admins read tenant, writes for own or admin.
DROP POLICY IF EXISTS esp_messages_select_own_or_admin ON public.esp_messages;
create policy esp_messages_select_own_or_admin
on public.esp_messages
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_is_master_admin_compat()
  or public.nexus_can_access_tenant_compat(tenant_id)
);
DROP POLICY IF EXISTS esp_messages_insert_own_or_admin ON public.esp_messages;
create policy esp_messages_insert_own_or_admin
on public.esp_messages
for insert to authenticated
with check (
  auth.uid() = user_id
  or public.nexus_is_master_admin_compat()
  or public.nexus_can_access_tenant_compat(tenant_id)
);
DROP POLICY IF EXISTS esp_messages_update_admin ON public.esp_messages;
create policy esp_messages_update_admin
on public.esp_messages
for update to authenticated
using (public.nexus_is_master_admin_compat())
with check (public.nexus_is_master_admin_compat());
-- Webhook events: admin visibility, service/admin writes.
DROP POLICY IF EXISTS esp_webhook_events_select_admin ON public.esp_webhook_events;
create policy esp_webhook_events_select_admin
on public.esp_webhook_events
for select to authenticated
using (
  public.nexus_is_master_admin_compat()
  or (tenant_id is not null and public.nexus_can_access_tenant_compat(tenant_id))
);
DROP POLICY IF EXISTS esp_webhook_events_insert_admin ON public.esp_webhook_events;
create policy esp_webhook_events_insert_admin
on public.esp_webhook_events
for insert to authenticated
with check (
  public.nexus_is_master_admin_compat()
  or (tenant_id is not null and public.nexus_can_access_tenant_compat(tenant_id))
);
-- Counters: admin only.
DROP POLICY IF EXISTS esp_send_counters_select_admin ON public.esp_send_counters;
create policy esp_send_counters_select_admin
on public.esp_send_counters
for select to authenticated
using (public.nexus_is_master_admin_compat());
DROP POLICY IF EXISTS esp_send_counters_write_admin ON public.esp_send_counters;
create policy esp_send_counters_write_admin
on public.esp_send_counters
for all to authenticated
using (public.nexus_is_master_admin_compat())
with check (public.nexus_is_master_admin_compat());
grant select, insert, update on public.esp_providers to authenticated, service_role;
grant select, insert, update on public.esp_routing_rules to authenticated, service_role;
grant select, insert, update on public.esp_contacts to authenticated, service_role;
grant select, insert, update on public.esp_messages to authenticated, service_role;
grant select, insert on public.esp_webhook_events to authenticated, service_role;
grant select, insert, update on public.esp_send_counters to authenticated, service_role;
-- Seed defaults for known tenants.
do $seed$
begin
  if to_regclass('public.tenants') is not null then
    insert into public.esp_providers (tenant_id, provider, is_enabled, priority, capabilities, config)
    select t.id, p.provider, true, p.priority, p.capabilities, '{}'::jsonb
    from public.tenants t
    cross join (
      values
        ('sender', 10, '{"transactional": true, "marketing": true}'::jsonb),
        ('brevo', 20, '{"transactional": true, "marketing": true}'::jsonb),
        ('mailerlite', 30, '{"transactional": false, "marketing": true}'::jsonb)
    ) as p(provider, priority, capabilities)
    on conflict (tenant_id, provider) do nothing;

    insert into public.esp_routing_rules (tenant_id, message_type, primary_provider, fallback_provider, throttle_per_min)
    select t.id, m.message_type, m.primary_provider, m.fallback_provider, m.throttle_per_min
    from public.tenants t
    cross join (
      values
        ('transactional', 'sender', 'brevo', 60),
        ('billing', 'sender', 'brevo', 60),
        ('system', 'sender', 'brevo', 60),
        ('onboarding', 'sender', 'brevo', 60),
        ('reminders', 'sender', 'brevo', 60),
        ('marketing', 'mailerlite', 'sender', 30),
        ('newsletter', 'mailerlite', 'sender', 30)
    ) as m(message_type, primary_provider, fallback_provider, throttle_per_min)
    on conflict (tenant_id, message_type) do nothing;
  end if;
end;
$seed$;
