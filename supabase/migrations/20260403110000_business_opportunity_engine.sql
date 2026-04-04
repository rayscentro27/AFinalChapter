-- Business Opportunity Engine
-- Educational matching layer connected to business setup, funding readiness, and grants.

create extension if not exists pgcrypto;

create or replace function public.nexus_opportunities_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  allowed boolean := false;
begin
  if to_regprocedure('public.nexus_is_super_admin_only()') is not null then
    execute 'select public.nexus_is_super_admin_only()' into allowed;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regprocedure('public.nexus_is_master_admin_compat()') is not null then
    execute 'select public.nexus_is_master_admin_compat()' into allowed;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  return lower(coalesce(auth.jwt() ->> 'role', '')) in ('admin', 'super_admin');
end;
$fn$;

create or replace function public.nexus_opportunities_can_access_tenant(p_tenant_id uuid)
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

  if public.nexus_opportunities_is_admin() then
    return true;
  end if;

  if to_regprocedure('public.nexus_can_read_tenant(uuid)') is not null then
    execute 'select public.nexus_can_read_tenant($1)' into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1 from public.tenant_memberships tm
        where tm.user_id = auth.uid() and tm.tenant_id = $1
      )
    $sql$ into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1 from public.tenant_members tm
        where tm.user_id = auth.uid() and tm.tenant_id = $1
      )
    $sql$ into allowed using p_tenant_id;
    if coalesce(allowed, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;

grant execute on function public.nexus_opportunities_is_admin() to authenticated;
grant execute on function public.nexus_opportunities_can_access_tenant(uuid) to authenticated;

create table if not exists public.business_opportunities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null,
  opportunity_type text not null,
  summary_md text not null,
  difficulty_level text not null check (difficulty_level in ('easy','medium','hard')),
  startup_cost_min_cents integer not null default 0,
  startup_cost_max_cents integer not null default 0,
  time_to_revenue_days integer,
  recommended_funding_min_cents integer,
  recommended_funding_max_cents integer,
  ideal_readiness_min integer not null default 0,
  ideal_readiness_max integer not null default 100,
  ideal_business_path text check (ideal_business_path in ('new_business','existing_business_optimization')),
  naics_tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_opportunity_tags (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.business_opportunities(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  unique(opportunity_id, tag)
);

create table if not exists public.business_opportunity_requirements (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.business_opportunities(id) on delete cascade,
  requirement_key text not null,
  label text not null,
  description text not null,
  is_required boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(opportunity_id, requirement_key)
);

create table if not exists public.business_opportunity_steps (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.business_opportunities(id) on delete cascade,
  step_key text not null,
  label text not null,
  description text not null,
  action_path text,
  sort_order integer not null default 100,
  is_required boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(opportunity_id, step_key)
);

create table if not exists public.business_opportunity_grants (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.business_opportunities(id) on delete cascade,
  grant_id uuid references public.grants_catalog(id) on delete set null,
  notes_md text,
  created_at timestamptz not null default now()
);

create table if not exists public.client_opportunity_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.business_opportunities(id) on delete cascade,
  status text not null default 'recommended' check (status in ('recommended','saved','started','dismissed','completed')),
  match_score integer not null default 0,
  funding_fit_score integer not null default 0,
  difficulty_fit_score integer not null default 0,
  readiness_fit_score integer not null default 0,
  grant_boost_score integer not null default 0,
  startup_cost_penalty integer not null default 0,
  estimated_funding_min_cents integer,
  estimated_funding_max_cents integer,
  reasons jsonb not null default '[]'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, user_id, opportunity_id)
);

create table if not exists public.client_opportunity_progress (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.business_opportunities(id) on delete cascade,
  current_step_key text,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed','blocked')),
  notes_md text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, user_id, opportunity_id)
);

create index if not exists business_opportunities_active_idx
  on public.business_opportunities (is_active, difficulty_level, category);
create index if not exists business_opportunity_tags_tag_idx
  on public.business_opportunity_tags (tag);
create index if not exists client_opportunity_matches_tenant_user_score_idx
  on public.client_opportunity_matches (tenant_id, user_id, match_score desc, updated_at desc);
create index if not exists client_opportunity_progress_tenant_user_idx
  on public.client_opportunity_progress (tenant_id, user_id, updated_at desc);

alter table public.business_opportunities enable row level security;
alter table public.business_opportunity_tags enable row level security;
alter table public.business_opportunity_requirements enable row level security;
alter table public.business_opportunity_steps enable row level security;
alter table public.business_opportunity_grants enable row level security;
alter table public.client_opportunity_matches enable row level security;
alter table public.client_opportunity_progress enable row level security;

drop policy if exists business_opportunities_read on public.business_opportunities;
create policy business_opportunities_read on public.business_opportunities
for select to authenticated
using (is_active = true or public.nexus_opportunities_is_admin());

drop policy if exists business_opportunity_tags_read on public.business_opportunity_tags;
create policy business_opportunity_tags_read on public.business_opportunity_tags
for select to authenticated
using (
  exists (
    select 1
    from public.business_opportunities bo
    where bo.id = opportunity_id
      and (bo.is_active = true or public.nexus_opportunities_is_admin())
  )
);

drop policy if exists business_opportunity_requirements_read on public.business_opportunity_requirements;
create policy business_opportunity_requirements_read on public.business_opportunity_requirements
for select to authenticated
using (
  exists (
    select 1 from public.business_opportunities bo
    where bo.id = opportunity_id
      and (bo.is_active = true or public.nexus_opportunities_is_admin())
  )
);

drop policy if exists business_opportunity_steps_read on public.business_opportunity_steps;
create policy business_opportunity_steps_read on public.business_opportunity_steps
for select to authenticated
using (
  exists (
    select 1 from public.business_opportunities bo
    where bo.id = opportunity_id
      and (bo.is_active = true or public.nexus_opportunities_is_admin())
  )
);

drop policy if exists business_opportunity_grants_read on public.business_opportunity_grants;
create policy business_opportunity_grants_read on public.business_opportunity_grants
for select to authenticated
using (
  exists (
    select 1 from public.business_opportunities bo
    where bo.id = opportunity_id
      and (bo.is_active = true or public.nexus_opportunities_is_admin())
  )
);

drop policy if exists client_opportunity_matches_read on public.client_opportunity_matches;
create policy client_opportunity_matches_read on public.client_opportunity_matches
for select to authenticated
using (public.nexus_opportunities_can_access_tenant(tenant_id));

drop policy if exists client_opportunity_matches_write on public.client_opportunity_matches;
create policy client_opportunity_matches_write on public.client_opportunity_matches
for all to authenticated
using (public.nexus_opportunities_can_access_tenant(tenant_id))
with check (public.nexus_opportunities_can_access_tenant(tenant_id));

drop policy if exists client_opportunity_progress_read on public.client_opportunity_progress;
create policy client_opportunity_progress_read on public.client_opportunity_progress
for select to authenticated
using (public.nexus_opportunities_can_access_tenant(tenant_id));

drop policy if exists client_opportunity_progress_write on public.client_opportunity_progress;
create policy client_opportunity_progress_write on public.client_opportunity_progress
for all to authenticated
using (public.nexus_opportunities_can_access_tenant(tenant_id))
with check (public.nexus_opportunities_can_access_tenant(tenant_id));

insert into public.business_opportunities (
  slug, name, category, opportunity_type, summary_md, difficulty_level,
  startup_cost_min_cents, startup_cost_max_cents, time_to_revenue_days,
  recommended_funding_min_cents, recommended_funding_max_cents,
  ideal_readiness_min, ideal_readiness_max, ideal_business_path, naics_tags, metadata
)
values
  (
    'online-consulting-business',
    'Online Consulting Business',
    'Professional Services',
    'service_business',
    'Low-overhead consulting model with fast launch potential and strong fundability alignment.',
    'easy',
    200000, 600000, 30,
    500000, 1500000,
    25, 80, 'new_business',
    array['541611','consulting','services'],
    jsonb_build_object('time_to_revenue_label','30-45 days','grant_connected',true)
  ),
  (
    'education-and-training-studio',
    'Education And Training Studio',
    'Education',
    'knowledge_business',
    'Education-first offer with scalable training packages and grant-friendly positioning.',
    'medium',
    300000, 900000, 45,
    800000, 2500000,
    35, 85, 'new_business',
    array['611430','education','training'],
    jsonb_build_object('time_to_revenue_label','45-60 days','grant_connected',true)
  ),
  (
    'digital-services-agency',
    'Digital Services Agency',
    'Digital Services',
    'agency',
    'Remote-first agency model suited to online operators, recurring service offers, and flexible funding use.',
    'easy',
    250000, 700000, 30,
    700000, 2000000,
    30, 90, 'existing_business_optimization',
    array['518210','digital','agency'],
    jsonb_build_object('time_to_revenue_label','30-45 days','grant_connected',false)
  )
on conflict (slug) do update
set
  name = excluded.name,
  category = excluded.category,
  opportunity_type = excluded.opportunity_type,
  summary_md = excluded.summary_md,
  difficulty_level = excluded.difficulty_level,
  startup_cost_min_cents = excluded.startup_cost_min_cents,
  startup_cost_max_cents = excluded.startup_cost_max_cents,
  time_to_revenue_days = excluded.time_to_revenue_days,
  recommended_funding_min_cents = excluded.recommended_funding_min_cents,
  recommended_funding_max_cents = excluded.recommended_funding_max_cents,
  ideal_readiness_min = excluded.ideal_readiness_min,
  ideal_readiness_max = excluded.ideal_readiness_max,
  ideal_business_path = excluded.ideal_business_path,
  naics_tags = excluded.naics_tags,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.business_opportunity_tags (opportunity_id, tag)
select bo.id, tag_value
from public.business_opportunities bo
cross join lateral unnest(
  case bo.slug
    when 'online-consulting-business' then array['fundable','remote','service','grant-friendly']
    when 'education-and-training-studio' then array['education','grant-friendly','scalable','program-based']
    when 'digital-services-agency' then array['digital','remote','recurring-revenue','agency']
    else array['general']
  end
) as tag_value
on conflict (opportunity_id, tag) do nothing;

insert into public.business_opportunity_requirements (opportunity_id, requirement_key, label, description, is_required, sort_order, metadata)
select bo.id, req.requirement_key, req.label, req.description, req.is_required, req.sort_order, req.metadata
from public.business_opportunities bo
join lateral (
  values
    ('business_foundation','Business Foundation','Complete core business identity and readiness steps.', true, 10, jsonb_build_object('source','phase6_seed')),
    ('website_identity','Website + Identity','Choose a domain, website preview, and business email.', true, 20, jsonb_build_object('source','phase6_seed')),
    ('funding_readiness','Funding Readiness','Build enough readiness to support realistic startup capital.', true, 30, jsonb_build_object('source','phase6_seed'))
) as req(requirement_key, label, description, is_required, sort_order, metadata) on true
on conflict (opportunity_id, requirement_key) do nothing;

insert into public.business_opportunity_steps (opportunity_id, step_key, label, description, action_path, sort_order, is_required, metadata)
select bo.id, step.step_key, step.label, step.description, step.action_path, step.sort_order, step.is_required, step.metadata
from public.business_opportunities bo
join lateral (
  values
    ('foundation','Complete Business Foundation','Finish the business profile and readiness checklist.','/portal/business',10,true,jsonb_build_object('module','business')),
    ('credit','Upload + Analyze Credit','Upload a report and review analysis before funding moves.','/portal/credit',20,true,jsonb_build_object('module','credit')),
    ('funding','Review Funding Fit','Use funding readiness and range signals to validate feasibility.','/portal/funding',30,true,jsonb_build_object('module','funding')),
    ('grants','Review Grant Relevance','Check grants that fit the opportunity and current profile.','/portal/grants',40,false,jsonb_build_object('module','grants'))
) as step(step_key, label, description, action_path, sort_order, is_required, metadata) on true
on conflict (opportunity_id, step_key) do nothing;
