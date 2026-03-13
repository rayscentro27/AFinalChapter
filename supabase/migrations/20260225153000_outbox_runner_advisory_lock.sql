-- Outbox runner lock helpers (safe re-run).

create or replace function public.try_acquire_tenant_outbox_lock(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_catalog
as $$
  select pg_try_advisory_lock(hashtextextended('outbox_runner:' || p_tenant_id::text, 0));
$$;

create or replace function public.release_tenant_outbox_lock(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_catalog
as $$
  select pg_advisory_unlock(hashtextextended('outbox_runner:' || p_tenant_id::text, 0));
$$;

grant execute on function public.try_acquire_tenant_outbox_lock(uuid) to service_role;
grant execute on function public.release_tenant_outbox_lock(uuid) to service_role;
