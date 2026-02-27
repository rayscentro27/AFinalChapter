-- One-time cleanup of smoke test data created during live verification

begin;
-- Remove smoke tenants (cascades to tenant-scoped tables via FK on tenant_id).
delete from public.tenants
where slug like 'smoke-%'
   or name like 'Smoke %';
-- Remove smoke auth users.
delete from auth.users
where email like 'smoke%@example.com'
   or email like 'smokeupd%@example.com';
commit;
