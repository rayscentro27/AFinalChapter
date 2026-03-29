-- Draft only. Do not auto-apply in production without review.

create table if not exists content_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  opportunity_key text not null,
  source_type text not null,
  source_ref_id text not null,
  topic text not null,
  content_bucket text not null,
  platform_targets text[] not null default '{}',
  angle_type text not null,
  score numeric(5,2) not null default 0,
  quality_score numeric(5,2) not null default 0,
  platform_fit_score jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  cooldown_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, opportunity_key)
);

create index if not exists idx_content_opportunities_tenant_status_created
  on content_opportunities (tenant_id, status, created_at desc);

create index if not exists idx_content_opportunities_tenant_bucket_score
  on content_opportunities (tenant_id, content_bucket, score desc);

create table if not exists content_scripts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  opportunity_id uuid not null references content_opportunities(id) on delete cascade,
  platform text not null,
  variant_key text not null,
  hook text not null,
  script_body text not null,
  cta_text text,
  status text not null default 'draft',
  model_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_content_scripts_tenant_opp_platform
  on content_scripts (tenant_id, opportunity_id, platform);

create table if not exists content_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  script_id uuid references content_scripts(id) on delete set null,
  asset_type text not null,
  payload jsonb not null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create index if not exists idx_content_assets_tenant_type_created
  on content_assets (tenant_id, asset_type, created_at desc);

create table if not exists content_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  review_status text not null,
  review_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_content_reviews_tenant_status_created
  on content_reviews (tenant_id, review_status, created_at desc);

create table if not exists content_calendar (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  content_asset_id uuid not null references content_assets(id) on delete cascade,
  platform text not null,
  scheduled_for timestamptz,
  schedule_status text not null default 'planned',
  priority int not null default 3,
  created_at timestamptz not null default now()
);

create index if not exists idx_content_calendar_tenant_status_schedule
  on content_calendar (tenant_id, schedule_status, scheduled_for);

create table if not exists content_generation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  run_type text not null,
  status text not null,
  input_count int not null default 0,
  output_count int not null default 0,
  error_count int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_content_generation_runs_tenant_type_started
  on content_generation_runs (tenant_id, run_type, started_at desc);
