drop table if exists public.content_publish_log, public.content_assets, public.content_scripts, public.content_requests cascade;

create table public.content_requests (
  id               uuid primary key default gen_random_uuid(),
  content_id       text unique not null,
  topic            text not null,
  content_type     text not null,
  niche            text not null,
  target_platforms text[] default '{}',
  requested_by     text default 'nova_media',
  status           text not null default 'topic_received',
  approved_by      text,
  approved_at      timestamptz,
  metadata         jsonb default '{}',
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create table public.content_scripts (
  id           uuid primary key default gen_random_uuid(),
  script_id    text unique not null,
  content_id   text references public.content_requests(content_id),
  content_type text not null,
  script_text  text not null,
  provider     text default 'openclaw',
  word_count   integer default 0,
  status       text default 'draft',
  created_at   timestamptz default now()
);

create table public.content_assets (
  id           uuid primary key default gen_random_uuid(),
  content_id   text references public.content_requests(content_id),
  asset_type   text not null,
  local_path   text,
  remote_url   text,
  provider     text,
  status       text default 'ready',
  error        text,
  created_at   timestamptz default now()
);

create table public.content_publish_log (
  id           uuid primary key default gen_random_uuid(),
  content_id   text references public.content_requests(content_id),
  platform     text not null,
  published_at timestamptz,
  post_url     text,
  published_by text,
  notes        text,
  created_at   timestamptz default now()
);

create index if not exists content_requests_status on public.content_requests(status);
create index if not exists content_scripts_content_id on public.content_scripts(content_id);
create index if not exists content_assets_content_id on public.content_assets(content_id);
