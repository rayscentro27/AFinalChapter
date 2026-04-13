create or replace function public.content_pipeline_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.content_requests (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  channel text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_requests_status_created_at
  on public.content_requests (status, created_at desc);

create index if not exists idx_content_requests_channel
  on public.content_requests (channel);

drop trigger if exists trg_content_requests_set_updated_at on public.content_requests;
create trigger trg_content_requests_set_updated_at
before update on public.content_requests
for each row execute function public.content_pipeline_touch_updated_at();

create table if not exists public.content_scripts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.content_requests(id) on delete cascade,
  script text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_scripts_request_id
  on public.content_scripts (request_id);

create index if not exists idx_content_scripts_status_created_at
  on public.content_scripts (status, created_at desc);

drop trigger if exists trg_content_scripts_set_updated_at on public.content_scripts;
create trigger trg_content_scripts_set_updated_at
before update on public.content_scripts
for each row execute function public.content_pipeline_touch_updated_at();

create table if not exists public.content_assets (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.content_requests(id) on delete cascade,
  asset_url text,
  type text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_assets_request_id
  on public.content_assets (request_id);

create index if not exists idx_content_assets_status_created_at
  on public.content_assets (status, created_at desc);

drop trigger if exists trg_content_assets_set_updated_at on public.content_assets;
create trigger trg_content_assets_set_updated_at
before update on public.content_assets
for each row execute function public.content_pipeline_touch_updated_at();

create table if not exists public.content_publish_log (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.content_requests(id) on delete cascade,
  asset_id uuid references public.content_assets(id) on delete set null,
  channel text,
  status text not null default 'queued',
  notes text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_publish_log_request_id
  on public.content_publish_log (request_id);

create index if not exists idx_content_publish_log_status_created_at
  on public.content_publish_log (status, created_at desc);

create index if not exists idx_content_publish_log_published_at
  on public.content_publish_log (published_at desc);

drop trigger if exists trg_content_publish_log_set_updated_at on public.content_publish_log;
create trigger trg_content_publish_log_set_updated_at
before update on public.content_publish_log
for each row execute function public.content_pipeline_touch_updated_at();
