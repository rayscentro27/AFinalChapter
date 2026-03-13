-- supabase_enterprise_rbac.sql
-- Enterprise RBAC: custom roles + permissions, with legacy role backfill.

create extension if not exists pgcrypto;

create table if not exists public.tenant_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  key text not null,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create table if not exists public.tenant_role_permissions (
  id bigserial primary key,
  tenant_id uuid not null,
  role_id uuid not null references public.tenant_roles(id) on delete cascade,
  permission text not null,
  unique (tenant_id, role_id, permission)
);

create index if not exists tenant_role_permissions_tenant_permission_idx
  on public.tenant_role_permissions (tenant_id, permission);

-- Add role_id to tenant membership tables when present.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'tenant_memberships'
  ) then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'tenant_memberships' and column_name = 'role_id'
    ) then
      alter table public.tenant_memberships add column role_id uuid null;
    end if;

    if not exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'tenant_memberships'
        and constraint_name = 'tenant_memberships_role_id_fkey'
    ) then
      alter table public.tenant_memberships
        add constraint tenant_memberships_role_id_fkey
        foreign key (role_id) references public.tenant_roles(id);
    end if;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'tenant_members'
  ) then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'tenant_members' and column_name = 'role_id'
    ) then
      alter table public.tenant_members add column role_id uuid null;
    end if;

    if not exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'tenant_members'
        and constraint_name = 'tenant_members_role_id_fkey'
    ) then
      alter table public.tenant_members
        add constraint tenant_members_role_id_fkey
        foreign key (role_id) references public.tenant_roles(id);
    end if;
  end if;
end $$;

-- Membership indexes.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'tenant_memberships'
  ) then
    create index if not exists tenant_memberships_tenant_user_idx
      on public.tenant_memberships (tenant_id, user_id);

    create index if not exists tenant_memberships_tenant_role_id_idx
      on public.tenant_memberships (tenant_id, role_id);
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'tenant_members'
  ) then
    create index if not exists tenant_members_tenant_user_idx
      on public.tenant_members (tenant_id, user_id);

    create index if not exists tenant_members_tenant_role_id_idx
      on public.tenant_members (tenant_id, role_id);
  end if;
end $$;

-- Backfill system roles for tenants with existing memberships.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='tenant_memberships'
  ) then
    execute $sql$
      insert into public.tenant_roles (tenant_id, key, name, is_system)
      select t.tenant_id, r.key, r.name, true
      from (select distinct tenant_id from public.tenant_memberships) t
      cross join (values
        ('owner','Owner'),
        ('admin','Admin'),
        ('agent','Agent'),
        ('viewer','Viewer')
      ) as r(key, name)
      on conflict (tenant_id, key) do nothing
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='tenant_members'
  ) then
    execute $sql$
      insert into public.tenant_roles (tenant_id, key, name, is_system)
      select t.tenant_id, r.key, r.name, true
      from (select distinct tenant_id from public.tenant_members) t
      cross join (values
        ('owner','Owner'),
        ('admin','Admin'),
        ('agent','Agent'),
        ('viewer','Viewer')
      ) as r(key, name)
      on conflict (tenant_id, key) do nothing
    $sql$;
  end if;
end $$;

-- Backfill role permissions for system roles.
insert into public.tenant_role_permissions (tenant_id, role_id, permission)
select tr.tenant_id, tr.id, p.permission
from public.tenant_roles tr
join (
  values
    ('owner','*'),

    ('admin','inbox.read'),
    ('admin','inbox.write'),
    ('admin','contacts.read'),
    ('admin','contacts.write'),
    ('admin','contacts.merge'),
    ('admin','routing.read'),
    ('admin','routing.manage'),
    ('admin','channels.read'),
    ('admin','channels.manage'),
    ('admin','outbox.read'),
    ('admin','outbox.run'),
    ('admin','monitoring.read'),
    ('admin','monitoring.manage'),
    ('admin','billing.read'),
    ('admin','billing.manage'),
    ('admin','roles.read'),
    ('admin','roles.write'),
    ('admin','members.read'),
    ('admin','members.write'),
    ('admin','api_keys.manage'),
    ('admin','webhooks.manage'),
    ('admin','audit.read'),
    ('admin','audit.export'),
    ('admin','policy.manage'),
    ('admin','attachments.upload'),
    ('admin','attachments.large'),
    ('admin','messages.send'),

    ('agent','inbox.read'),
    ('agent','inbox.write'),
    ('agent','contacts.read'),
    ('agent','contacts.write'),
    ('agent','contacts.merge'),
    ('agent','channels.read'),
    ('agent','outbox.read'),
    ('agent','outbox.run'),
    ('agent','monitoring.read'),
    ('agent','attachments.upload'),
    ('agent','messages.send'),

    ('viewer','inbox.read'),
    ('viewer','contacts.read'),
    ('viewer','routing.read'),
    ('viewer','channels.read'),
    ('viewer','outbox.read'),
    ('viewer','monitoring.read'),
    ('viewer','billing.read'),
    ('viewer','roles.read'),
    ('viewer','members.read'),
    ('viewer','audit.read')
) as p(role_key, permission)
  on p.role_key = tr.key
on conflict (tenant_id, role_id, permission) do nothing;

-- Backfill role_id from existing role text (tenant_memberships).
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema='public' and table_name='tenant_memberships'
  ) then
    execute $sql$
      update public.tenant_memberships tm
      set role_id = tr.id
      from public.tenant_roles tr
      where tm.tenant_id = tr.tenant_id
        and lower(coalesce(tm.role, 'viewer')) = tr.key
        and (tm.role_id is null or tm.role_id <> tr.id)
    $sql$;
  end if;
end $$;

-- Backfill role_id from existing role text (tenant_members).
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema='public' and table_name='tenant_members'
  ) then
    execute $sql$
      update public.tenant_members tm
      set role_id = tr.id
      from public.tenant_roles tr
      where tm.tenant_id = tr.tenant_id
        and lower(coalesce(tm.role, 'viewer')) = tr.key
        and (tm.role_id is null or tm.role_id <> tr.id)
    $sql$;
  end if;
end $$;
