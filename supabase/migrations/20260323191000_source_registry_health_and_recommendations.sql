begin;

create extension if not exists pgcrypto;

create table if not exists public.research_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  org_id uuid references public.organizations(id) on delete set null,
  source_type text not null check (source_type in ('website', 'youtube_channel', 'rss', 'api', 'manual_upload')),
  label text not null,
  canonical_url text not null,
  domain text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'paused', 'review', 'error')),
  priority integer not null default 50 check (priority >= 0 and priority <= 100),
  active boolean not null default true,
  paused boolean not null default false,
  schedule_paused boolean not null default false,
  schedule_status text not null default 'scheduled'
    check (schedule_status in ('scheduled', 'paused', 'error', 'idle')),
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_run_status text,
  last_sync_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists research_sources_tenant_url_uniq
  on public.research_sources (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), canonical_url);

create index if not exists research_sources_status_priority_idx
  on public.research_sources (status, priority desc, updated_at desc);

create index if not exists research_sources_domain_idx
  on public.research_sources (domain);

create table if not exists public.source_scan_policies (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.research_sources(id) on delete cascade,
  policy_name text not null default 'default',
  poll_interval_minutes integer not null default 60 check (poll_interval_minutes >= 1),
  max_results_per_poll integer not null default 100 check (max_results_per_poll >= 1),
  depth_level text not null default 'standard'
    check (depth_level in ('light', 'standard', 'deep')),
  allow_manual_runs boolean not null default true,
  entity_filters jsonb not null default '[]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists source_scan_policies_source_name_uniq
  on public.source_scan_policies (source_id, policy_name);

create index if not exists source_scan_policies_active_idx
  on public.source_scan_policies (source_id, is_active, updated_at desc);

create table if not exists public.source_health_scores (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.research_sources(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  availability_pct numeric(5,2),
  avg_latency_ms integer,
  error_count integer not null default 0,
  duplicate_count integer not null default 0,
  items_retrieved integer not null default 0,
  score numeric(5,2) not null default 100.0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists source_health_scores_source_period_idx
  on public.source_health_scores (source_id, period_end desc);

create table if not exists public.source_duplicates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.research_sources(id) on delete cascade,
  duplicate_source_id uuid not null references public.research_sources(id) on delete cascade,
  duplicate_reason text not null,
  confidence numeric(5,2) not null default 50.0,
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'confirmed', 'dismissed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists source_duplicates_source_idx
  on public.source_duplicates (source_id, created_at desc);

create index if not exists source_duplicates_duplicate_idx
  on public.source_duplicates (duplicate_source_id, created_at desc);

create table if not exists public.source_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  org_id uuid references public.organizations(id) on delete set null,
  source_type text not null,
  label text not null,
  canonical_url text,
  domain text,
  rationale text,
  confidence_score numeric(5,2) not null default 50.0,
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'accepted', 'rejected', 'queued')),
  recommended_by text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists source_recommendations_status_idx
  on public.source_recommendations (status, confidence_score desc, created_at desc);

create index if not exists source_recommendations_tenant_idx
  on public.source_recommendations (tenant_id, created_at desc);

drop trigger if exists trg_research_sources_set_updated_at on public.research_sources;
create trigger trg_research_sources_set_updated_at
before update on public.research_sources
for each row execute function public.set_updated_at();

drop trigger if exists trg_source_scan_policies_set_updated_at on public.source_scan_policies;
create trigger trg_source_scan_policies_set_updated_at
before update on public.source_scan_policies
for each row execute function public.set_updated_at();

drop trigger if exists trg_source_recommendations_set_updated_at on public.source_recommendations;
create trigger trg_source_recommendations_set_updated_at
before update on public.source_recommendations
for each row execute function public.set_updated_at();

alter table public.research_sources enable row level security;
alter table public.source_scan_policies enable row level security;
alter table public.source_health_scores enable row level security;
alter table public.source_duplicates enable row level security;
alter table public.source_recommendations enable row level security;

drop policy if exists research_sources_admin_select on public.research_sources;
create policy research_sources_admin_select on public.research_sources
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists research_sources_admin_write on public.research_sources;
create policy research_sources_admin_write on public.research_sources
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists source_scan_policies_admin_select on public.source_scan_policies;
create policy source_scan_policies_admin_select on public.source_scan_policies
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists source_scan_policies_admin_write on public.source_scan_policies;
create policy source_scan_policies_admin_write on public.source_scan_policies
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists source_health_scores_admin_select on public.source_health_scores;
create policy source_health_scores_admin_select on public.source_health_scores
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists source_health_scores_admin_write on public.source_health_scores;
create policy source_health_scores_admin_write on public.source_health_scores
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists source_duplicates_admin_select on public.source_duplicates;
create policy source_duplicates_admin_select on public.source_duplicates
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists source_duplicates_admin_write on public.source_duplicates;
create policy source_duplicates_admin_write on public.source_duplicates
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

drop policy if exists source_recommendations_admin_select on public.source_recommendations;
create policy source_recommendations_admin_select on public.source_recommendations
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists source_recommendations_admin_write on public.source_recommendations;
create policy source_recommendations_admin_write on public.source_recommendations
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

commit;