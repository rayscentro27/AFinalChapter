begin;
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
  has_tenant_id boolean;
  tenant_tables text[] := array[
    'reviewed_signal_proposals',
    'risk_decisions',
    'approval_queue',
    'proposal_outcomes',
    'strategy_performance',
    'options_trade_proposals',
    'options_risk_decisions',
    'options_strategy_performance',
    'agent_scorecards',
    'paper_trade_runs',
    'replay_results',
    'confidence_calibration',
    'strategy_optimizations',
    'strategy_variants',
    'research_clusters',
    'research_hypotheses',
    'coverage_gaps',
    'research_briefs',
    'research_artifacts',
    'research_claims'
  ];
begin
  foreach t in array tenant_tables
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    select exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = t
        and c.column_name = 'tenant_id'
    ) into has_tenant_id;

    if not has_tenant_id then
      raise notice 'Skipping RLS policy setup for %.% (tenant_id column missing)', 'public', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);

    for p in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname like 'p6r_' || t || '_%'
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select using (public.nexus_can_access_tenant(tenant_id))',
      'p6r_' || t || '_select',
      t
    );

    execute format(
      'create policy %I on public.%I for insert with check (auth.role() = ''authenticated'' and public.nexus_can_access_tenant(tenant_id))',
      'p6r_' || t || '_insert',
      t
    );

    execute format(
      'create policy %I on public.%I for update using (public.nexus_can_access_tenant(tenant_id)) with check (public.nexus_can_access_tenant(tenant_id))',
      'p6r_' || t || '_update',
      t
    );

    execute format(
      'create policy %I on public.%I for delete using (public.nexus_can_access_tenant(tenant_id))',
      'p6r_' || t || '_delete',
      t
    );
  end loop;
end $$;
do $$
declare
  p record;
begin
  if to_regclass('public.strategy_library') is not null then
    alter table public.strategy_library enable row level security;
    revoke all on table public.strategy_library from anon, authenticated;
    grant select, insert, update, delete on table public.strategy_library to authenticated;

    for p in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'strategy_library'
        and policyname like 'p6r_strategy_library_%'
    loop
      execute format('drop policy if exists %I on public.strategy_library', p.policyname);
    end loop;

    create policy p6r_strategy_library_select on public.strategy_library
      for select
      using (auth.role() = 'authenticated');

    create policy p6r_strategy_library_insert on public.strategy_library
      for insert
      with check (auth.role() = 'authenticated' and public.nexus_is_master_admin());

    create policy p6r_strategy_library_update on public.strategy_library
      for update
      using (public.nexus_is_master_admin())
      with check (public.nexus_is_master_admin());

    create policy p6r_strategy_library_delete on public.strategy_library
      for delete
      using (public.nexus_is_master_admin());
  end if;
end $$;
do $$
begin
  if to_regclass('public.v_research_strategy_rankings') is not null then
    begin
      execute 'alter view public.v_research_strategy_rankings set (security_invoker = true)';
    exception when others then
      raise notice 'Unable to set security_invoker on v_research_strategy_rankings: %', sqlerrm;
    end;
    grant select on public.v_research_strategy_rankings to authenticated;
  end if;

  if to_regclass('public.v_research_options_rankings') is not null then
    begin
      execute 'alter view public.v_research_options_rankings set (security_invoker = true)';
    exception when others then
      raise notice 'Unable to set security_invoker on v_research_options_rankings: %', sqlerrm;
    end;
    grant select on public.v_research_options_rankings to authenticated;
  end if;

  if to_regclass('public.v_research_agent_scorecards_latest') is not null then
    begin
      execute 'alter view public.v_research_agent_scorecards_latest set (security_invoker = true)';
    exception when others then
      raise notice 'Unable to set security_invoker on v_research_agent_scorecards_latest: %', sqlerrm;
    end;
    grant select on public.v_research_agent_scorecards_latest to authenticated;
  end if;
end $$;
commit;
