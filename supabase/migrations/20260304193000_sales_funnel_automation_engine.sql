-- Sales Funnel Automation Engine
-- Visitor -> Lead -> Nurture -> Signup -> Onboarding -> Upgrade -> Outcome
-- Educational-only positioning; no guaranteed outcomes.

create extension if not exists pgcrypto;

create or replace function public.nexus_funnel_is_super_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  is_admin boolean := false;
begin
  if to_regprocedure('public.nexus_is_super_admin_only()') is not null then
    execute 'select public.nexus_is_super_admin_only()' into is_admin;
    if coalesce(is_admin, false) then
      return true;
    end if;
  end if;

  if to_regprocedure('public.nexus_is_master_admin_compat()') is not null then
    execute 'select public.nexus_is_master_admin_compat()' into is_admin;
    if coalesce(is_admin, false) then
      return true;
    end if;
  end if;

  return lower(coalesce(auth.jwt() ->> 'role', '')) in ('admin', 'super_admin');
end;
$fn$;

create or replace function public.nexus_funnel_can_access_tenant(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  allowed boolean := false;
begin
  if p_tenant_id is null then
    return false;
  end if;

  if public.nexus_funnel_is_super_admin() then
    return true;
  end if;

  if to_regprocedure('public.nexus_can_read_tenant(uuid)') is not null then
    execute 'select public.nexus_can_read_tenant($1)' into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regprocedure('public.nexus_workflow_can_access_tenant(uuid)') is not null then
    execute 'select public.nexus_workflow_can_access_tenant($1)' into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
      )
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
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
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;

create or replace function public.nexus_funnel_can_manage_tenant(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  allowed boolean := false;
begin
  if p_tenant_id is null then
    return false;
  end if;

  if public.nexus_funnel_is_super_admin() then
    return true;
  end if;

  if to_regprocedure('public.nexus_can_manage_tenant(uuid)') is not null then
    execute 'select public.nexus_can_manage_tenant($1)' into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regprocedure('public.nexus_workflow_can_manage_tenant(uuid)') is not null then
    execute 'select public.nexus_workflow_can_manage_tenant($1)' into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
          and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'super_admin')
      )
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
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
          and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'super_admin')
      )
    $sql$ into allowed using p_tenant_id;

    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;

grant execute on function public.nexus_funnel_is_super_admin() to authenticated;
grant execute on function public.nexus_funnel_can_access_tenant(uuid) to authenticated;
grant execute on function public.nexus_funnel_can_manage_tenant(uuid) to authenticated;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null references public.tenants(id) on delete set null,
  email text not null,
  phone_e164 text null,
  first_name text null,
  last_name text null,
  source text null,
  status text not null default 'new' check (status in ('new','nurturing','converted','unsubscribed','dead')),
  marketing_opt_in boolean not null default false,
  marketing_opt_in_consent_id uuid null references public.consents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.funnel_sequences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.funnel_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.funnel_sequences(id) on delete cascade,
  step_order int not null,
  wait_minutes int not null default 0,
  action_type text not null check (action_type in ('SEND_EMAIL','TAG_LEAD','START_WORKFLOW','CREATE_TASK','SHOW_OFFER','NOOP')),
  action_payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.funnel_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  sequence_id uuid not null references public.funnel_sequences(id) on delete cascade,
  status text not null default 'enrolled' check (status in ('enrolled','paused','completed','canceled')),
  current_step int not null default 0,
  next_run_at timestamptz not null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null unique,
  title text not null,
  body_md text not null,
  target_tier text not null check (target_tier in ('growth','premium')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.funnel_metrics_daily (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  day date not null,
  visitors int not null default 0,
  leads int not null default 0,
  optins int not null default 0,
  signups int not null default 0,
  upgrades_growth int not null default 0,
  upgrades_premium int not null default 0,
  outcomes_approved int not null default 0,
  primary key (tenant_id, day)
);

create table if not exists public.lead_user_links (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (tenant_id, lead_id)
);

create table if not exists public.offers_inbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_key text not null,
  status text not null default 'unseen' check (status in ('unseen','seen','clicked','dismissed','accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.unsubscribe_tokens (
  token text primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_capture_rate_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  key_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists leads_tenant_email_uidx
  on public.leads (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), email);

create index if not exists leads_email_lower_idx
  on public.leads ((lower(email)));

create index if not exists leads_status_idx
  on public.leads (tenant_id, status, created_at desc);

create index if not exists lead_events_lead_created_idx
  on public.lead_events (lead_id, created_at desc);

create index if not exists lead_events_tenant_event_idx
  on public.lead_events (tenant_id, event_type, created_at desc);

create unique index if not exists funnel_steps_sequence_order_uidx
  on public.funnel_steps (sequence_id, step_order);

create unique index if not exists funnel_enrollments_active_uidx
  on public.funnel_enrollments (lead_id, sequence_id);

create index if not exists funnel_enrollments_tenant_next_run_idx
  on public.funnel_enrollments (tenant_id, next_run_at);

create index if not exists lead_user_links_user_idx
  on public.lead_user_links (user_id, linked_at desc);

create unique index if not exists lead_user_links_tenant_user_uidx
  on public.lead_user_links (tenant_id, user_id);

create index if not exists offers_inbox_user_status_idx
  on public.offers_inbox (user_id, status, created_at desc);

create index if not exists unsubscribe_tokens_lead_idx
  on public.unsubscribe_tokens (lead_id, expires_at desc);

create index if not exists lead_capture_rate_limits_scope_key_idx
  on public.lead_capture_rate_limits (scope, key_hash, created_at desc);

create or replace function public.nexus_funnel_touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_leads_touch_updated_at on public.leads;
create trigger trg_leads_touch_updated_at
before update on public.leads
for each row execute procedure public.nexus_funnel_touch_updated_at();

drop trigger if exists trg_funnel_sequences_touch_updated_at on public.funnel_sequences;
create trigger trg_funnel_sequences_touch_updated_at
before update on public.funnel_sequences
for each row execute procedure public.nexus_funnel_touch_updated_at();

drop trigger if exists trg_funnel_enrollments_touch_updated_at on public.funnel_enrollments;
create trigger trg_funnel_enrollments_touch_updated_at
before update on public.funnel_enrollments
for each row execute procedure public.nexus_funnel_touch_updated_at();

drop trigger if exists trg_offers_inbox_touch_updated_at on public.offers_inbox;
create trigger trg_offers_inbox_touch_updated_at
before update on public.offers_inbox
for each row execute procedure public.nexus_funnel_touch_updated_at();

alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.funnel_sequences enable row level security;
alter table public.funnel_steps enable row level security;
alter table public.funnel_enrollments enable row level security;
alter table public.offers enable row level security;
alter table public.funnel_metrics_daily enable row level security;
alter table public.lead_user_links enable row level security;
alter table public.offers_inbox enable row level security;
alter table public.unsubscribe_tokens enable row level security;
alter table public.lead_capture_rate_limits enable row level security;

-- leads

drop policy if exists leads_select_linked_or_admin on public.leads;
create policy leads_select_linked_or_admin
on public.leads
for select to authenticated
using (
  exists (
    select 1
    from public.lead_user_links lul
    where lul.lead_id = leads.id
      and lul.user_id = auth.uid()
  )
  or (tenant_id is not null and public.nexus_funnel_can_access_tenant(tenant_id))
);

drop policy if exists leads_insert_admin_only on public.leads;

drop policy if exists leads_update_linked_or_admin on public.leads;
create policy leads_update_linked_or_admin
on public.leads
for update to authenticated
using (
  exists (
    select 1
    from public.lead_user_links lul
    where lul.lead_id = leads.id
      and lul.user_id = auth.uid()
  )
  or (tenant_id is not null and public.nexus_funnel_can_manage_tenant(tenant_id))
)
with check (
  exists (
    select 1
    from public.lead_user_links lul
    where lul.lead_id = leads.id
      and lul.user_id = auth.uid()
  )
  or (tenant_id is not null and public.nexus_funnel_can_manage_tenant(tenant_id))
);

drop policy if exists leads_delete_admin_only on public.leads;
create policy leads_delete_admin_only
on public.leads
for delete to authenticated
using (tenant_id is not null and public.nexus_funnel_can_manage_tenant(tenant_id));

-- lead_user_links

drop policy if exists lead_user_links_select_own_or_admin on public.lead_user_links;
create policy lead_user_links_select_own_or_admin
on public.lead_user_links
for select to authenticated
using (user_id = auth.uid() or public.nexus_funnel_can_access_tenant(tenant_id));

drop policy if exists lead_user_links_insert_admin on public.lead_user_links;
create policy lead_user_links_insert_admin
on public.lead_user_links
for insert to authenticated
with check (public.nexus_funnel_can_manage_tenant(tenant_id));

drop policy if exists lead_user_links_update_admin on public.lead_user_links;
create policy lead_user_links_update_admin
on public.lead_user_links
for update to authenticated
using (public.nexus_funnel_can_manage_tenant(tenant_id))
with check (public.nexus_funnel_can_manage_tenant(tenant_id));

drop policy if exists lead_user_links_delete_admin on public.lead_user_links;
create policy lead_user_links_delete_admin
on public.lead_user_links
for delete to authenticated
using (public.nexus_funnel_can_manage_tenant(tenant_id));

-- lead_events

drop policy if exists lead_events_select_linked_or_admin on public.lead_events;
create policy lead_events_select_linked_or_admin
on public.lead_events
for select to authenticated
using (
  public.nexus_funnel_can_access_tenant(tenant_id)
  or exists (
    select 1
    from public.lead_user_links lul
    where lul.lead_id = lead_events.lead_id
      and lul.user_id = auth.uid()
  )
);

drop policy if exists lead_events_insert_linked_or_admin on public.lead_events;
create policy lead_events_insert_linked_or_admin
on public.lead_events
for insert to authenticated
with check (
  public.nexus_funnel_can_manage_tenant(tenant_id)
  or exists (
    select 1
    from public.lead_user_links lul
    where lul.lead_id = lead_events.lead_id
      and lul.user_id = auth.uid()
  )
);

-- funnel_sequences

drop policy if exists funnel_sequences_select_active_or_admin on public.funnel_sequences;
create policy funnel_sequences_select_active_or_admin
on public.funnel_sequences
for select to authenticated
using (is_active = true or public.nexus_funnel_can_access_tenant(tenant_id));

drop policy if exists funnel_sequences_insert_admin on public.funnel_sequences;
create policy funnel_sequences_insert_admin
on public.funnel_sequences
for insert to authenticated
with check (public.nexus_funnel_can_manage_tenant(tenant_id));

drop policy if exists funnel_sequences_update_admin on public.funnel_sequences;
create policy funnel_sequences_update_admin
on public.funnel_sequences
for update to authenticated
using (public.nexus_funnel_can_manage_tenant(tenant_id))
with check (public.nexus_funnel_can_manage_tenant(tenant_id));

drop policy if exists funnel_sequences_delete_admin on public.funnel_sequences;
create policy funnel_sequences_delete_admin
on public.funnel_sequences
for delete to authenticated
using (public.nexus_funnel_can_manage_tenant(tenant_id));

-- funnel_steps

drop policy if exists funnel_steps_select_active_or_admin on public.funnel_steps;
create policy funnel_steps_select_active_or_admin
on public.funnel_steps
for select to authenticated
using (
  exists (
    select 1
    from public.funnel_sequences fs
    where fs.id = funnel_steps.sequence_id
      and (fs.is_active = true or public.nexus_funnel_can_access_tenant(fs.tenant_id))
  )
);

drop policy if exists funnel_steps_insert_admin on public.funnel_steps;
create policy funnel_steps_insert_admin
on public.funnel_steps
for insert to authenticated
with check (
  exists (
    select 1
    from public.funnel_sequences fs
    where fs.id = funnel_steps.sequence_id
      and public.nexus_funnel_can_manage_tenant(fs.tenant_id)
  )
);

drop policy if exists funnel_steps_update_admin on public.funnel_steps;
create policy funnel_steps_update_admin
on public.funnel_steps
for update to authenticated
using (
  exists (
    select 1
    from public.funnel_sequences fs
    where fs.id = funnel_steps.sequence_id
      and public.nexus_funnel_can_manage_tenant(fs.tenant_id)
  )
)
with check (
  exists (
    select 1
    from public.funnel_sequences fs
    where fs.id = funnel_steps.sequence_id
      and public.nexus_funnel_can_manage_tenant(fs.tenant_id)
  )
);

drop policy if exists funnel_steps_delete_admin on public.funnel_steps;
create policy funnel_steps_delete_admin
on public.funnel_steps
for delete to authenticated
using (
  exists (
    select 1
    from public.funnel_sequences fs
    where fs.id = funnel_steps.sequence_id
      and public.nexus_funnel_can_manage_tenant(fs.tenant_id)
  )
);

-- funnel_enrollments

drop policy if exists funnel_enrollments_select_scope on public.funnel_enrollments;
create policy funnel_enrollments_select_scope
on public.funnel_enrollments
for select to authenticated
using (
  public.nexus_funnel_can_access_tenant(tenant_id)
  or exists (
    select 1
    from public.lead_user_links lul
    where lul.lead_id = funnel_enrollments.lead_id
      and lul.user_id = auth.uid()
  )
);

drop policy if exists funnel_enrollments_insert_admin on public.funnel_enrollments;
create policy funnel_enrollments_insert_admin
on public.funnel_enrollments
for insert to authenticated
with check (public.nexus_funnel_can_manage_tenant(tenant_id));

drop policy if exists funnel_enrollments_update_admin on public.funnel_enrollments;
create policy funnel_enrollments_update_admin
on public.funnel_enrollments
for update to authenticated
using (public.nexus_funnel_can_manage_tenant(tenant_id))
with check (public.nexus_funnel_can_manage_tenant(tenant_id));

drop policy if exists funnel_enrollments_delete_admin on public.funnel_enrollments;
create policy funnel_enrollments_delete_admin
on public.funnel_enrollments
for delete to authenticated
using (public.nexus_funnel_can_manage_tenant(tenant_id));

-- offers

drop policy if exists offers_select_active_or_admin on public.offers;
create policy offers_select_active_or_admin
on public.offers
for select to authenticated
using (is_active = true or public.nexus_funnel_can_access_tenant(tenant_id));

drop policy if exists offers_insert_admin on public.offers;
create policy offers_insert_admin
on public.offers
for insert to authenticated
with check (public.nexus_funnel_can_manage_tenant(tenant_id));

drop policy if exists offers_update_admin on public.offers;
create policy offers_update_admin
on public.offers
for update to authenticated
using (public.nexus_funnel_can_manage_tenant(tenant_id))
with check (public.nexus_funnel_can_manage_tenant(tenant_id));

drop policy if exists offers_delete_admin on public.offers;
create policy offers_delete_admin
on public.offers
for delete to authenticated
using (public.nexus_funnel_can_manage_tenant(tenant_id));

-- offers_inbox

drop policy if exists offers_inbox_select_scope on public.offers_inbox;
create policy offers_inbox_select_scope
on public.offers_inbox
for select to authenticated
using (user_id = auth.uid() or public.nexus_funnel_can_access_tenant(tenant_id));

drop policy if exists offers_inbox_insert_admin on public.offers_inbox;
create policy offers_inbox_insert_admin
on public.offers_inbox
for insert to authenticated
with check (public.nexus_funnel_can_manage_tenant(tenant_id));

drop policy if exists offers_inbox_update_scope on public.offers_inbox;
create policy offers_inbox_update_scope
on public.offers_inbox
for update to authenticated
using (user_id = auth.uid() or public.nexus_funnel_can_manage_tenant(tenant_id))
with check (user_id = auth.uid() or public.nexus_funnel_can_manage_tenant(tenant_id));

drop policy if exists offers_inbox_delete_admin on public.offers_inbox;
create policy offers_inbox_delete_admin
on public.offers_inbox
for delete to authenticated
using (public.nexus_funnel_can_manage_tenant(tenant_id));

-- funnel_metrics_daily

drop policy if exists funnel_metrics_daily_select_admin on public.funnel_metrics_daily;
create policy funnel_metrics_daily_select_admin
on public.funnel_metrics_daily
for select to authenticated
using (public.nexus_funnel_can_access_tenant(tenant_id));

drop policy if exists funnel_metrics_daily_write_admin on public.funnel_metrics_daily;
create policy funnel_metrics_daily_write_admin
on public.funnel_metrics_daily
for all to authenticated
using (public.nexus_funnel_can_manage_tenant(tenant_id))
with check (public.nexus_funnel_can_manage_tenant(tenant_id));

-- unsubscribe_tokens & rate_limit rows are function-managed only

drop policy if exists unsubscribe_tokens_admin_all on public.unsubscribe_tokens;
create policy unsubscribe_tokens_admin_all
on public.unsubscribe_tokens
for all to authenticated
using (
  exists (
    select 1
    from public.leads l
    where l.id = unsubscribe_tokens.lead_id
      and l.tenant_id is not null
      and public.nexus_funnel_can_manage_tenant(l.tenant_id)
  )
)
with check (
  exists (
    select 1
    from public.leads l
    where l.id = unsubscribe_tokens.lead_id
      and l.tenant_id is not null
      and public.nexus_funnel_can_manage_tenant(l.tenant_id)
  )
);

drop policy if exists lead_capture_rate_limits_admin_all on public.lead_capture_rate_limits;
create policy lead_capture_rate_limits_admin_all
on public.lead_capture_rate_limits
for all to authenticated
using (public.nexus_funnel_is_super_admin())
with check (public.nexus_funnel_is_super_admin());

grant select, insert, update, delete on table public.leads to authenticated, service_role;
grant select, insert, update, delete on table public.lead_events to authenticated, service_role;
grant select, insert, update, delete on table public.funnel_sequences to authenticated, service_role;
grant select, insert, update, delete on table public.funnel_steps to authenticated, service_role;
grant select, insert, update, delete on table public.funnel_enrollments to authenticated, service_role;
grant select, insert, update, delete on table public.offers to authenticated, service_role;
grant select, insert, update, delete on table public.funnel_metrics_daily to authenticated, service_role;
grant select, insert, update, delete on table public.lead_user_links to authenticated, service_role;
grant select, insert, update, delete on table public.offers_inbox to authenticated, service_role;
grant select, insert, update, delete on table public.unsubscribe_tokens to authenticated, service_role;
grant select, insert, update, delete on table public.lead_capture_rate_limits to authenticated, service_role;

with default_tenant as (
  select id as tenant_id
  from public.tenants
  order by created_at asc
  limit 1
)
insert into public.offers (tenant_id, key, title, body_md, target_tier, is_active)
select
  dt.tenant_id,
  seed.key,
  seed.title,
  seed.body_md,
  seed.target_tier,
  true
from default_tenant dt
cross join (
  values
    (
      'upgrade_growth_v1',
      'Upgrade to Growth: Structured Educational Tools',
      'Unlock expanded educational templates, workflow automation, and guided roadmap tools. Results vary and are not guaranteed.',
      'growth'
    ),
    (
      'upgrade_premium_v1',
      'Upgrade to Premium: Grants + SBA + Funding Research',
      'Access premium educational workflow modules including Grants, SBA Prep, and Funding Research. Nexus does not guarantee approvals or outcomes.',
      'premium'
    )
) as seed(key, title, body_md, target_tier)
on conflict (key) do update
set
  title = excluded.title,
  body_md = excluded.body_md,
  target_tier = excluded.target_tier,
  is_active = excluded.is_active;

with default_tenant as (
  select id as tenant_id
  from public.tenants
  order by created_at asc
  limit 1
)
insert into public.funnel_sequences (tenant_id, key, name, description, is_active)
select
  dt.tenant_id,
  seed.key,
  seed.name,
  seed.description,
  true
from default_tenant dt
cross join (
  values
    (
      'default_nurture_v1',
      'Default Nurture V1',
      'Educational marketing sequence for opted-in leads before signup.'
    ),
    (
      'onboarding_transactional_v1',
      'Onboarding Transactional V1',
      'Transactional onboarding sequence after signup conversion.'
    )
) as seed(key, name, description)
on conflict (key) do update
set
  tenant_id = excluded.tenant_id,
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.funnel_steps (sequence_id, step_order, wait_minutes, action_type, action_payload)
select fs.id, s.step_order, s.wait_minutes, s.action_type, s.action_payload
from public.funnel_sequences fs
join (
  values
    (
      'default_nurture_v1',
      1,
      0,
      'SEND_EMAIL',
      jsonb_build_object(
        'message_type','marketing',
        'template_key','funnel_nurture_welcome_v1',
        'subject','Welcome to Nexus Educational Updates',
        'html','<p>Welcome. You requested educational updates from Nexus.</p><p>We share templates, workflows, and practical readiness education only.</p>'
      )
    ),
    (
      'default_nurture_v1',
      2,
      1440,
      'SEND_EMAIL',
      jsonb_build_object(
        'message_type','marketing',
        'template_key','funnel_credit_readiness_v1',
        'subject','Credit Readiness: 5 Educational Factors',
        'html','<p>Educational focus: payment history, utilization, age of credit, mix, and recent inquiries.</p><p>No guarantees of outcomes.</p>'
      )
    ),
    (
      'default_nurture_v1',
      3,
      2880,
      'SEND_EMAIL',
      jsonb_build_object(
        'message_type','marketing',
        'template_key','funnel_upload_credit_report_v1',
        'subject','How to upload your annual credit report',
        'html','<p>Learn how to upload reports and review educational workflow tools in your portal.</p><p>Results vary and are not guaranteed.</p>'
      )
    ),
    (
      'default_nurture_v1',
      4,
      0,
      'SHOW_OFFER',
      jsonb_build_object(
        'offer_key','upgrade_growth_v1',
        'cta_label','Create free account',
        'cta_path','/signup'
      )
    ),
    (
      'onboarding_transactional_v1',
      1,
      0,
      'SEND_EMAIL',
      jsonb_build_object(
        'message_type','transactional',
        'template_key','funnel_onboarding_welcome_v1',
        'subject','Welcome to your Nexus portal',
        'html','<p>Your portal is ready. Start with educational onboarding steps and upload your report when ready.</p>'
      )
    ),
    (
      'onboarding_transactional_v1',
      2,
      0,
      'START_WORKFLOW',
      jsonb_build_object(
        'template_key','FUNDING_ONBOARDING'
      )
    ),
    (
      'onboarding_transactional_v1',
      3,
      0,
      'CREATE_TASK',
      jsonb_build_object(
        'task_key','UPLOAD_CREDIT_REPORT',
        'title','Upload your annual credit report',
        'description','Upload your annual credit report to start educational analysis workflows.',
        'type','upload',
        'due_days',2
      )
    )
) as s(sequence_key, step_order, wait_minutes, action_type, action_payload)
  on fs.key = s.sequence_key
on conflict (sequence_id, step_order) do update
set
  wait_minutes = excluded.wait_minutes,
  action_type = excluded.action_type,
  action_payload = excluded.action_payload;
