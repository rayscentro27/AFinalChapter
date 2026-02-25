-- Merge job tracking + undo metadata for reversible contact merges.

create table if not exists public.contact_merge_jobs (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_contact_id uuid not null references public.contacts(id) on delete cascade,
  into_contact_id uuid not null references public.contacts(id) on delete cascade,
  merged_by uuid null,
  reason text null,
  created_at timestamptz not null default now(),
  undone_at timestamptz null,
  undone_by uuid null,
  undo_reason text null
);

alter table if exists public.contact_merge_jobs
  add column if not exists merged_by uuid null,
  add column if not exists reason text null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists undone_at timestamptz null,
  add column if not exists undone_by uuid null,
  add column if not exists undo_reason text null;

create index if not exists cmj_tenant_created_idx
  on public.contact_merge_jobs (tenant_id, created_at desc);

create index if not exists cmj_tenant_undone_idx
  on public.contact_merge_jobs (tenant_id, undone_at);

create table if not exists public.contact_merge_job_items (
  id bigserial primary key,
  job_id bigint not null references public.contact_merge_jobs(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_type text not null,
  item_id text not null,
  from_contact_id uuid not null references public.contacts(id) on delete cascade,
  into_contact_id uuid not null references public.contacts(id) on delete cascade,
  snapshot jsonb null,
  created_at timestamptz not null default now()
);

alter table if exists public.contact_merge_job_items
  add column if not exists snapshot jsonb;

create unique index if not exists cmji_job_item_uq
  on public.contact_merge_job_items (job_id, item_type, item_id);

create index if not exists cmji_tenant_job_idx
  on public.contact_merge_job_items (tenant_id, job_id, item_type);

alter table public.contact_merge_jobs enable row level security;
alter table public.contact_merge_job_items enable row level security;

drop policy if exists contact_merge_jobs_select on public.contact_merge_jobs;
create policy contact_merge_jobs_select on public.contact_merge_jobs
for select using (
  exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = contact_merge_jobs.tenant_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists contact_merge_jobs_write on public.contact_merge_jobs;
create policy contact_merge_jobs_write on public.contact_merge_jobs
for all using (
  exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = contact_merge_jobs.tenant_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin', 'agent')
  )
) with check (
  exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = contact_merge_jobs.tenant_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin', 'agent')
  )
);

drop policy if exists contact_merge_job_items_select on public.contact_merge_job_items;
create policy contact_merge_job_items_select on public.contact_merge_job_items
for select using (
  exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = contact_merge_job_items.tenant_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists contact_merge_job_items_write on public.contact_merge_job_items;
create policy contact_merge_job_items_write on public.contact_merge_job_items
for all using (
  exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = contact_merge_job_items.tenant_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin', 'agent')
  )
) with check (
  exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = contact_merge_job_items.tenant_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin', 'agent')
  )
);
