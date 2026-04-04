create or replace function public.content_pipeline_assign_content_id()
returns trigger
language plpgsql
as $$
begin
  if new.content_id is null or btrim(new.content_id) = '' then
    new.content_id := 'content_' || replace(gen_random_uuid()::text, '-', '');
  end if;

  return new;
end;
$$;

create or replace function public.content_pipeline_link_content_id()
returns trigger
language plpgsql
as $$
declare
  parent_content_id text;
begin
  if new.content_id is null or btrim(new.content_id) = '' then
    if new.request_id is not null then
      select cr.content_id
        into parent_content_id
      from public.content_requests cr
      where cr.id = new.request_id;

      if parent_content_id is not null and btrim(parent_content_id) <> '' then
        new.content_id := parent_content_id;
      end if;
    end if;
  end if;

  if new.content_id is null or btrim(new.content_id) = '' then
    new.content_id := 'content_' || replace(gen_random_uuid()::text, '-', '');
  end if;

  return new;
end;
$$;

create or replace function public.content_pipeline_assign_script_id()
returns trigger
language plpgsql
as $$
begin
  if new.script_id is null or btrim(new.script_id) = '' then
    new.script_id := 'script_' || replace(gen_random_uuid()::text, '-', '');
  end if;

  return new;
end;
$$;

alter table public.content_requests
  add column if not exists content_id text;

alter table public.content_requests
  add column if not exists content_type text not null default 'general';

alter table public.content_requests
  add column if not exists niche text not null default 'general';

alter table public.content_requests
  add column if not exists target_platforms text[] not null default '{}'::text[];

alter table public.content_requests
  add column if not exists requested_by text not null default 'nova_media';

alter table public.content_requests
  add column if not exists approved_by text;

alter table public.content_requests
  add column if not exists approved_at timestamptz;

alter table public.content_requests
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.content_requests
set content_id = 'content_' || replace(gen_random_uuid()::text, '-', '')
where content_id is null or btrim(content_id) = '';

update public.content_requests
set content_type = coalesce(nullif(content_type, ''), 'general'),
    niche = coalesce(nullif(niche, ''), 'general'),
    target_platforms = coalesce(target_platforms, '{}'::text[]),
    requested_by = coalesce(nullif(requested_by, ''), 'nova_media'),
    metadata = coalesce(metadata, '{}'::jsonb);

alter table public.content_requests
  alter column content_id set not null;

alter table public.content_requests
  alter column status set default 'topic_received';

create unique index if not exists idx_content_requests_content_id
  on public.content_requests (content_id);

drop trigger if exists trg_content_requests_assign_content_id on public.content_requests;
create trigger trg_content_requests_assign_content_id
before insert on public.content_requests
for each row execute function public.content_pipeline_assign_content_id();

alter table public.content_scripts
  add column if not exists script_id text;

alter table public.content_scripts
  add column if not exists content_id text;

alter table public.content_scripts
  add column if not exists content_type text not null default 'general';

alter table public.content_scripts
  add column if not exists script_text text;

alter table public.content_scripts
  add column if not exists provider text not null default 'openclaw';

alter table public.content_scripts
  add column if not exists word_count integer not null default 0;

update public.content_scripts
set script_id = 'script_' || replace(gen_random_uuid()::text, '-', '')
where script_id is null or btrim(script_id) = '';

update public.content_scripts cs
set content_id = cr.content_id
from public.content_requests cr
where cs.request_id = cr.id
  and (cs.content_id is null or btrim(cs.content_id) = '');

update public.content_scripts
set script_text = coalesce(script_text, script),
    content_type = coalesce(nullif(content_type, ''), 'general'),
    provider = coalesce(nullif(provider, ''), 'openclaw'),
    word_count = coalesce(word_count, 0);

alter table public.content_scripts
  alter column script_id set not null;

create unique index if not exists idx_content_scripts_script_id
  on public.content_scripts (script_id);

create index if not exists idx_content_scripts_content_id
  on public.content_scripts (content_id);

drop trigger if exists trg_content_scripts_assign_content_id on public.content_scripts;
create trigger trg_content_scripts_assign_content_id
before insert or update on public.content_scripts
for each row execute function public.content_pipeline_link_content_id();

drop trigger if exists trg_content_scripts_assign_script_id on public.content_scripts;
create trigger trg_content_scripts_assign_script_id
before insert on public.content_scripts
for each row execute function public.content_pipeline_assign_script_id();

alter table public.content_assets
  add column if not exists content_id text;

alter table public.content_assets
  add column if not exists asset_type text not null default 'draft';

alter table public.content_assets
  add column if not exists local_path text;

alter table public.content_assets
  add column if not exists remote_url text;

alter table public.content_assets
  add column if not exists provider text;

alter table public.content_assets
  add column if not exists error text;

update public.content_assets ca
set content_id = cr.content_id
from public.content_requests cr
where ca.request_id = cr.id
  and (ca.content_id is null or btrim(ca.content_id) = '');

update public.content_assets
set asset_type = coalesce(nullif(asset_type, ''), coalesce(nullif(type, ''), 'draft'));

create index if not exists idx_content_assets_content_id
  on public.content_assets (content_id);

drop trigger if exists trg_content_assets_assign_content_id on public.content_assets;
create trigger trg_content_assets_assign_content_id
before insert or update on public.content_assets
for each row execute function public.content_pipeline_link_content_id();

alter table public.content_publish_log
  add column if not exists content_id text;

alter table public.content_publish_log
  add column if not exists platform text not null default 'unknown';

alter table public.content_publish_log
  add column if not exists post_url text;

alter table public.content_publish_log
  add column if not exists published_by text;

alter table public.content_publish_log
  add column if not exists notes text;

update public.content_publish_log cpl
set content_id = cr.content_id
from public.content_requests cr
where cpl.request_id = cr.id
  and (cpl.content_id is null or btrim(cpl.content_id) = '');

create index if not exists idx_content_publish_log_content_id
  on public.content_publish_log (content_id);

drop trigger if exists trg_content_publish_log_assign_content_id on public.content_publish_log;
create trigger trg_content_publish_log_assign_content_id
before insert or update on public.content_publish_log
for each row execute function public.content_pipeline_link_content_id();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_scripts_content_id_fkey'
  ) then
    alter table public.content_scripts
      add constraint content_scripts_content_id_fkey
      foreign key (content_id) references public.content_requests(content_id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_assets_content_id_fkey'
  ) then
    alter table public.content_assets
      add constraint content_assets_content_id_fkey
      foreign key (content_id) references public.content_requests(content_id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publish_log_content_id_fkey'
  ) then
    alter table public.content_publish_log
      add constraint content_publish_log_content_id_fkey
      foreign key (content_id) references public.content_requests(content_id)
      on delete cascade;
  end if;
end;
$$;
