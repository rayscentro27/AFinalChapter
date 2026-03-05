# RLS Stage A Smoke Test Checklist

Use this checklist immediately after applying:
- `supabase/migrations/20260305120000_rls_stage_a_core_tenant_tables.sql`

## 1) Verify RLS Enabled
```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'api_keys',
    'tenants',
    'tenant_memberships',
    'tenant_roles',
    'conversations',
    'messages',
    'audit_logs',
    'attachments'
  )
order by tablename;
```

Expected: all rows show `rowsecurity = true`.

## 2) Verify Policies Present
```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'api_keys',
    'tenants',
    'tenant_memberships',
    'tenant_roles',
    'conversations',
    'messages',
    'audit_logs',
    'attachments'
  )
order by tablename, policyname;
```

Expected: each table has explicit `select/insert/update/delete` policy rows.

## 3) Verify Grant Tightening
```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'api_keys',
    'tenants',
    'tenant_memberships',
    'tenant_roles',
    'conversations',
    'messages',
    'audit_logs',
    'attachments'
  )
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

Expected:
- `anon` has no broad write access.
- `authenticated` privileges are constrained by RLS policies.

## 4) Isolation Sanity Check
Run as a tenant-A authenticated user:
```sql
select count(*) from public.messages where tenant_id = '<TENANT_B_UUID>';
```

Expected: `0` rows visible.

## 5) Service Role Sanity Check
Run maintenance/job flows that rely on service role (e.g., outbox/admin jobs).

Expected: service-role paths still function; end-user cross-tenant access remains blocked.
