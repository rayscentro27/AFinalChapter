-- Allow tenant-level owners/admins to manage tenant membership rows.

create or replace function public.nexus_can_manage_tenant_members(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = p_tenant
      and tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) in ('owner', 'admin')
  );
$$;

grant execute on function public.nexus_can_manage_tenant_members(uuid) to authenticated;

create or replace function public.nexus_assign_membership_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.tenant_memberships where role = 'admin') then
    new.role := 'admin';
    return new;
  end if;

  if public.nexus_is_master_admin() or public.nexus_can_manage_tenant_members(new.tenant_id) then
    new.role := coalesce(nullif(new.role, ''), 'client');
    return new;
  end if;

  if new.user_id = auth.uid() then
    new.role := 'client';
    return new;
  end if;

  new.role := 'client';
  return new;
end;
$$;

drop policy if exists memberships_select on public.tenant_memberships;
create policy memberships_select on public.tenant_memberships
for select
using (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = tenant_memberships.tenant_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists memberships_insert on public.tenant_memberships;
create policy memberships_insert on public.tenant_memberships
for insert
with check (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or public.nexus_can_manage_tenant_members(tenant_id)
    or user_id = auth.uid()
  )
);

drop policy if exists memberships_update on public.tenant_memberships;
create policy memberships_update on public.tenant_memberships
for update
using (
  public.nexus_is_master_admin()
  or public.nexus_can_manage_tenant_members(tenant_id)
)
with check (
  public.nexus_is_master_admin()
  or public.nexus_can_manage_tenant_members(tenant_id)
);

drop policy if exists memberships_delete on public.tenant_memberships;
create policy memberships_delete on public.tenant_memberships
for delete
using (
  public.nexus_is_master_admin()
  or public.nexus_can_manage_tenant_members(tenant_id)
);
