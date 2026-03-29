-- P0-3 Stage A: Core tenant isolation hardening
-- Scope: api_keys, tenants, tenant_memberships, tenant_roles, conversations, messages, audit_logs, attachments
-- Note: "attachment_metadata" was interpreted as the existing `public.attachments` table.

create extension if not exists pgcrypto;
-- Ensure tenant helpers exist (idempotent)
create or replace function public.nexus_is_master_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) = 'admin'
  );
$$;
create or replace function public.nexus_can_access_tenant(t uuid)
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
      where tm.user_id = auth.uid()
        and tm.tenant_id = t
    );
$$;
-- Enable RLS + revoke broad grants (core high-risk tables)
alter table if exists public.api_keys enable row level security;
alter table if exists public.tenants enable row level security;
alter table if exists public.tenant_memberships enable row level security;
alter table if exists public.tenant_roles enable row level security;
alter table if exists public.conversations enable row level security;
alter table if exists public.messages enable row level security;
alter table if exists public.audit_logs enable row level security;
alter table if exists public.attachments enable row level security;
revoke all on table public.api_keys from anon, authenticated;
revoke all on table public.tenants from anon, authenticated;
revoke all on table public.tenant_memberships from anon, authenticated;
revoke all on table public.tenant_roles from anon, authenticated;
revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
revoke all on table public.attachments from anon, authenticated;
grant select, insert, update, delete on table public.tenants to authenticated;
grant select, insert, update, delete on table public.tenant_memberships to authenticated;
grant select, insert, update, delete on table public.tenant_roles to authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select, insert, update, delete on table public.audit_logs to authenticated;
grant select, insert, update, delete on table public.attachments to authenticated;
grant select, insert, update, delete on table public.api_keys to authenticated;
-- Reset policies table-by-table to avoid legacy over-broad rules.
do $$
declare
  p record;
  t text;
begin
  foreach t in array array[
    'api_keys',
    'tenants',
    'tenant_memberships',
    'tenant_roles',
    'conversations',
    'messages',
    'audit_logs',
    'attachments'
  ]
  loop
    for p in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;
-- tenants
create policy p0a_tenants_select on public.tenants
for select
using (public.nexus_can_access_tenant(id));
create policy p0a_tenants_insert on public.tenants
for insert
with check (auth.role() = 'authenticated');
create policy p0a_tenants_update on public.tenants
for update
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());
create policy p0a_tenants_delete on public.tenants
for delete
using (public.nexus_is_master_admin());
-- tenant_memberships
create policy p0a_memberships_select on public.tenant_memberships
for select
using (public.nexus_is_master_admin() or user_id = auth.uid());
create policy p0a_memberships_insert on public.tenant_memberships
for insert
with check (
  auth.role() = 'authenticated'
  and (
    public.nexus_is_master_admin()
    or (user_id = auth.uid() and public.nexus_can_access_tenant(tenant_id))
  )
);
create policy p0a_memberships_update on public.tenant_memberships
for update
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());
create policy p0a_memberships_delete on public.tenant_memberships
for delete
using (public.nexus_is_master_admin());
-- tenant_roles
create policy p0a_roles_select on public.tenant_roles
for select
using (public.nexus_can_access_tenant(tenant_id));
create policy p0a_roles_insert on public.tenant_roles
for insert
with check (auth.role() = 'authenticated' and public.nexus_is_master_admin());
create policy p0a_roles_update on public.tenant_roles
for update
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());
create policy p0a_roles_delete on public.tenant_roles
for delete
using (public.nexus_is_master_admin());
-- api_keys
create policy p0a_api_keys_select on public.api_keys
for select
using (public.nexus_can_access_tenant(tenant_id));
create policy p0a_api_keys_insert on public.api_keys
for insert
with check (auth.role() = 'authenticated' and public.nexus_is_master_admin());
create policy p0a_api_keys_update on public.api_keys
for update
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());
create policy p0a_api_keys_delete on public.api_keys
for delete
using (public.nexus_is_master_admin());
-- conversations
create policy p0a_conversations_select on public.conversations
for select
using (public.nexus_can_access_tenant(tenant_id));
create policy p0a_conversations_insert on public.conversations
for insert
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));
create policy p0a_conversations_update on public.conversations
for update
using (public.nexus_can_access_tenant(tenant_id))
with check (public.nexus_can_access_tenant(tenant_id));
create policy p0a_conversations_delete on public.conversations
for delete
using (public.nexus_can_access_tenant(tenant_id));
-- messages
create policy p0a_messages_select on public.messages
for select
using (public.nexus_can_access_tenant(tenant_id));
create policy p0a_messages_insert on public.messages
for insert
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));
create policy p0a_messages_update on public.messages
for update
using (public.nexus_can_access_tenant(tenant_id))
with check (public.nexus_can_access_tenant(tenant_id));
create policy p0a_messages_delete on public.messages
for delete
using (public.nexus_can_access_tenant(tenant_id));
-- audit_logs
create policy p0a_audit_logs_select on public.audit_logs
for select
using (public.nexus_can_access_tenant(tenant_id));
create policy p0a_audit_logs_insert on public.audit_logs
for insert
with check (
  auth.role() = 'authenticated'
  and public.nexus_can_access_tenant(tenant_id)
  and (user_id is null or user_id = auth.uid())
);
create policy p0a_audit_logs_update on public.audit_logs
for update
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());
create policy p0a_audit_logs_delete on public.audit_logs
for delete
using (public.nexus_is_master_admin());
-- attachments
create policy p0a_attachments_select on public.attachments
for select
using (public.nexus_can_access_tenant(tenant_id));
create policy p0a_attachments_insert on public.attachments
for insert
with check (auth.role() = 'authenticated' and public.nexus_can_access_tenant(tenant_id));
create policy p0a_attachments_update on public.attachments
for update
using (public.nexus_can_access_tenant(tenant_id))
with check (public.nexus_can_access_tenant(tenant_id));
create policy p0a_attachments_delete on public.attachments
for delete
using (public.nexus_can_access_tenant(tenant_id));
