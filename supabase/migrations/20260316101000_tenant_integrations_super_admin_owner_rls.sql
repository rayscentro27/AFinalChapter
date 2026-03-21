-- Expand tenant_integrations RLS to include super_admin and owner roles.

drop policy if exists tenant_integrations_select on public.tenant_integrations;
create policy tenant_integrations_select on public.tenant_integrations
for select
using (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = tenant_integrations.tenant_id
      and tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) in ('owner', 'super_admin', 'admin', 'supervisor', 'sales', 'salesperson')
  )
);
drop policy if exists tenant_integrations_insert on public.tenant_integrations;
create policy tenant_integrations_insert on public.tenant_integrations
for insert
with check (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = tenant_integrations.tenant_id
        and tm.user_id = auth.uid()
        and lower(coalesce(tm.role, '')) in ('owner', 'super_admin', 'admin', 'supervisor', 'sales', 'salesperson')
    )
  )
);
drop policy if exists tenant_integrations_update on public.tenant_integrations;
create policy tenant_integrations_update on public.tenant_integrations
for update
using (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = tenant_integrations.tenant_id
        and tm.user_id = auth.uid()
        and lower(coalesce(tm.role, '')) in ('owner', 'super_admin', 'admin', 'supervisor', 'sales', 'salesperson')
    )
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = tenant_integrations.tenant_id
        and tm.user_id = auth.uid()
        and lower(coalesce(tm.role, '')) in ('owner', 'super_admin', 'admin', 'supervisor', 'sales', 'salesperson')
    )
  )
);
drop policy if exists tenant_integrations_delete on public.tenant_integrations;
create policy tenant_integrations_delete on public.tenant_integrations
for delete
using (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = tenant_integrations.tenant_id
        and tm.user_id = auth.uid()
        and lower(coalesce(tm.role, '')) in ('owner', 'super_admin', 'admin', 'supervisor', 'sales', 'salesperson')
    )
  )
);
