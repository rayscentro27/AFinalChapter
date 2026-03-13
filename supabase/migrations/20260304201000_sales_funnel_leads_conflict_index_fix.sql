-- Fix upsert conflict target for lead capture function.
-- ON CONFLICT (tenant_id,email) requires a matching unique index/constraint.

drop index if exists public.leads_tenant_email_uidx;

create unique index if not exists leads_tenant_email_uidx
  on public.leads (tenant_id, email);
