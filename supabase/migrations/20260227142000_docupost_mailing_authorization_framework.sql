-- DocuPost mailing authorization + client approval gate + audit trail (Prompt 4)

create extension if not exists pgcrypto;
-- Compatibility helper (safe redefine)
create or replace function public.nexus_is_master_admin_compat()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  is_admin boolean := false;
begin
  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and tm.role = 'admin'
      )
    $sql$ into is_admin;
    return coalesce(is_admin, false);
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.role = 'admin'
      )
    $sql$ into is_admin;
    return coalesce(is_admin, false);
  end if;

  return coalesce((auth.jwt() ->> 'role') = 'admin', false);
end;
$fn$;
grant execute on function public.nexus_is_master_admin_compat() to authenticated;
create table if not exists public.dispute_mail_packets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  approver_email text not null,
  approver_user_id uuid null references auth.users(id) on delete set null,
  contact_id text,
  contact_name text,
  contact_email text,
  packet_title text not null,
  document_name text not null,
  document_body text not null,
  status text not null default 'draft' check (status in ('draft', 'pending_client_approval', 'approved', 'rejected', 'queued', 'sent', 'canceled')),
  client_decision_notes text,
  approved_at timestamptz,
  queued_at timestamptz,
  sent_at timestamptz,
  provider text not null default 'docupost',
  provider_payload jsonb not null default '{}'::jsonb,
  provider_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dispute_mail_packets_tenant_status_idx
  on public.dispute_mail_packets (tenant_id, status, created_at desc);
create index if not exists dispute_mail_packets_approver_email_idx
  on public.dispute_mail_packets (lower(approver_email), created_at desc);
create table if not exists public.dispute_mail_events (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.dispute_mail_packets(id) on delete cascade,
  tenant_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists dispute_mail_events_packet_created_idx
  on public.dispute_mail_events (packet_id, created_at desc);
create or replace function public.dispute_mail_packets_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
drop trigger if exists trg_dispute_mail_packets_set_updated_at on public.dispute_mail_packets;
create trigger trg_dispute_mail_packets_set_updated_at
before update on public.dispute_mail_packets
for each row execute procedure public.dispute_mail_packets_set_updated_at();
alter table public.dispute_mail_packets enable row level security;
alter table public.dispute_mail_events enable row level security;
DROP POLICY IF EXISTS dispute_mail_packets_select_access ON public.dispute_mail_packets;
create policy dispute_mail_packets_select_access
on public.dispute_mail_packets
for select to authenticated
using (
  public.nexus_is_master_admin_compat()
  or requester_user_id = auth.uid()
  or lower(approver_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
DROP POLICY IF EXISTS dispute_mail_packets_insert_access ON public.dispute_mail_packets;
create policy dispute_mail_packets_insert_access
on public.dispute_mail_packets
for insert to authenticated
with check (
  public.nexus_is_master_admin_compat()
  or requester_user_id = auth.uid()
);
DROP POLICY IF EXISTS dispute_mail_packets_update_access ON public.dispute_mail_packets;
create policy dispute_mail_packets_update_access
on public.dispute_mail_packets
for update to authenticated
using (
  public.nexus_is_master_admin_compat()
  or requester_user_id = auth.uid()
  or lower(approver_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  public.nexus_is_master_admin_compat()
  or requester_user_id = auth.uid()
  or lower(approver_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
DROP POLICY IF EXISTS dispute_mail_events_select_access ON public.dispute_mail_events;
create policy dispute_mail_events_select_access
on public.dispute_mail_events
for select to authenticated
using (
  exists (
    select 1
    from public.dispute_mail_packets p
    where p.id = packet_id
      and (
        public.nexus_is_master_admin_compat()
        or p.requester_user_id = auth.uid()
        or lower(p.approver_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);
DROP POLICY IF EXISTS dispute_mail_events_insert_access ON public.dispute_mail_events;
create policy dispute_mail_events_insert_access
on public.dispute_mail_events
for insert to authenticated
with check (
  exists (
    select 1
    from public.dispute_mail_packets p
    where p.id = packet_id
      and (
        public.nexus_is_master_admin_compat()
        or p.requester_user_id = auth.uid()
        or lower(p.approver_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);
create or replace view public.client_pending_mail_approvals as
select
  p.id,
  p.tenant_id,
  p.packet_title,
  p.document_name,
  p.document_body,
  p.contact_name,
  p.contact_email,
  p.status,
  p.created_at,
  p.updated_at
from public.dispute_mail_packets p
where p.status = 'pending_client_approval';
grant select on public.client_pending_mail_approvals to authenticated;
