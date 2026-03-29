-- Membership override + promotion layer (additive)
-- Purpose: allow auditable admin-managed waive/promo/restore behavior
-- without changing base subscription billing history.

create extension if not exists pgcrypto;
create table if not exists public.membership_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid null references auth.users(id) on delete set null,
  subscription_id uuid null references public.subscriptions(id) on delete set null,
  override_type text not null check (override_type in ('waived', 'promo', 'manual_override', 'vip_access')),
  override_reason text,
  promo_code text,
  promo_duration_days integer,
  override_start timestamptz not null default now(),
  override_end timestamptz,
  promo_applied_at timestamptz,
  promo_expires_at timestamptz,
  active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  restored_at timestamptz,
  restored_by uuid null references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (promo_duration_days is null or promo_duration_days > 0),
  check (override_end is null or override_end >= override_start),
  check (promo_expires_at is null or promo_applied_at is null or promo_expires_at >= promo_applied_at),
  check ((override_type = 'promo' and promo_expires_at is not null) or override_type <> 'promo')
);
create index if not exists membership_overrides_tenant_active_idx
  on public.membership_overrides (tenant_id, active, override_end, created_at desc);
create index if not exists membership_overrides_tenant_user_active_idx
  on public.membership_overrides (tenant_id, user_id, active, created_at desc);
create index if not exists membership_overrides_tenant_type_idx
  on public.membership_overrides (tenant_id, override_type, active, created_at desc);
create index if not exists membership_overrides_tenant_promo_code_idx
  on public.membership_overrides (tenant_id, promo_code)
  where promo_code is not null;
create table if not exists public.membership_override_audit (
  id uuid primary key default gen_random_uuid(),
  membership_override_id uuid null references public.membership_overrides(id) on delete set null,
  tenant_id uuid not null,
  user_id uuid null references auth.users(id) on delete set null,
  action text not null check (action in ('waived', 'promo_created', 'restored', 'manual_override', 'status_read')),
  previous_status text,
  new_status text,
  reason text,
  admin_user_id uuid null references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists membership_override_audit_tenant_created_idx
  on public.membership_override_audit (tenant_id, created_at desc);
create index if not exists membership_override_audit_tenant_action_created_idx
  on public.membership_override_audit (tenant_id, action, created_at desc);
create index if not exists membership_override_audit_override_idx
  on public.membership_override_audit (membership_override_id, created_at desc);
create or replace function public.nexus_membership_overrides_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
drop trigger if exists trg_membership_overrides_set_updated_at on public.membership_overrides;
create trigger trg_membership_overrides_set_updated_at
before update on public.membership_overrides
for each row execute procedure public.nexus_membership_overrides_set_updated_at();
