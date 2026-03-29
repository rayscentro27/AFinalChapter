-- P0-3 Stage B: Remaining tenant-sensitive RLS + explicit policies

create extension if not exists pgcrypto;
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
do $$
declare
  t text;
  p record;
  admin_only_write_tables text[] := array[
    'tenant_auth_settings',
    'tenant_invites',
    'tenant_plans',
    'tenant_policies',
    'tenant_role_permissions',
    'tenant_roles',
    'api_keys',
    'webhook_subscriptions',
    'webhook_dispatch_queue',
    'alert_suppressions',
    'notification_channels',
    'monitoring_alerts',
    'monitoring_alert_notifications'
  ];
  target_tables text[] := array[
    'agent_workload',
    'ai_playbooks',
    'ai_roles',
    'alert_events',
    'alert_suppressions',
    'assignment_rules',
    'audit_events',
    'client_documents',
    'client_goals',
    'consent_logs',
    'funding_application_events',
    'identity_suggestions',
    'monitoring_alert_notifications',
    'monitoring_alerts',
    'notification_channels',
    'retention_settings',
    'service_metrics',
    'sre_rollup_1h',
    'sre_rollup_5m',
    'tenant_auth_settings',
    'tenant_invites',
    'tenant_plans',
    'tenant_policies',
    'tenant_role_permissions',
    'webhook_dispatch_queue',
    'webhook_subscriptions',
    'workflow_cases',
    'workflow_tasks'
  ];
begin
  foreach t in array target_tables
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);

    for p in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select using (public.nexus_can_access_tenant(tenant_id))',
      'p0b_' || t || '_select',
      t
    );

    if t = any(admin_only_write_tables) then
      execute format(
        'create policy %I on public.%I for insert with check (auth.role() = ''authenticated'' and public.nexus_is_master_admin())',
        'p0b_' || t || '_insert',
        t
      );

      execute format(
        'create policy %I on public.%I for update using (public.nexus_is_master_admin()) with check (public.nexus_is_master_admin())',
        'p0b_' || t || '_update',
        t
      );

      execute format(
        'create policy %I on public.%I for delete using (public.nexus_is_master_admin())',
        'p0b_' || t || '_delete',
        t
      );
    else
      execute format(
        'create policy %I on public.%I for insert with check (auth.role() = ''authenticated'' and public.nexus_can_access_tenant(tenant_id))',
        'p0b_' || t || '_insert',
        t
      );

      execute format(
        'create policy %I on public.%I for update using (public.nexus_can_access_tenant(tenant_id)) with check (public.nexus_can_access_tenant(tenant_id))',
        'p0b_' || t || '_update',
        t
      );

      execute format(
        'create policy %I on public.%I for delete using (public.nexus_can_access_tenant(tenant_id))',
        'p0b_' || t || '_delete',
        t
      );
    end if;
  end loop;
end $$;
