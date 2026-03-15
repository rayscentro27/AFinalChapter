-- Seed billing.manage permission for owner/admin/super_admin roles
-- Additive and idempotent.

do $do$
begin
  if to_regclass('public.tenant_roles') is null then
    return;
  end if;

  if to_regclass('public.tenant_role_permissions') is null then
    return;
  end if;

  insert into public.tenant_role_permissions (tenant_id, role_id, permission)
  select tr.tenant_id, tr.id, 'billing.manage'
  from public.tenant_roles tr
  where lower(coalesce(tr.key, '')) in ('owner', 'admin', 'super_admin')
  on conflict (tenant_id, role_id, permission) do nothing;
end;
$do$;
