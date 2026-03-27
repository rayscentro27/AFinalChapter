-- Supabase content pipeline tables

create table if not exists content_requests (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  channel text not null,
  status text not null default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists content_scripts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references content_requests(id),
  script text,
  status text not null default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists content_transcripts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references content_requests(id),
  transcript text,
  status text not null default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists content_assets (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references content_requests(id),
  asset_url text,
  type text,
  status text not null default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists content_outputs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references content_requests(id),
  output_url text,
  channel text,
  review_status text not null default 'needs_review',
  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
