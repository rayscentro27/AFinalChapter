-- Prompt 5: secure dispute-letter generation pipeline
-- Enforces PII separation, sanitized AI payload storage, and finalized letter records.

create extension if not exists pgcrypto;
create or replace function public.nexus_can_manage_tenant_compat(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  has_admin boolean := false;
begin
  if p_tenant_id is null then
    return false;
  end if;

  if public.nexus_is_master_admin_compat() then
    return true;
  end if;

  if to_regclass('public.tenant_memberships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_memberships tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
          and lower(coalesce(tm.role, '')) in ('admin', 'owner', 'super_admin')
      )
    $sql$ into has_admin using p_tenant_id;

    if coalesce(has_admin, false) then
      return true;
    end if;
  end if;

  if to_regclass('public.tenant_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = $1
          and lower(coalesce(tm.role, '')) in ('admin', 'owner', 'super_admin')
      )
    $sql$ into has_admin using p_tenant_id;

    if coalesce(has_admin, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;
grant execute on function public.nexus_can_manage_tenant_compat(uuid) to authenticated;
create table if not exists public.client_pii (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_pii jsonb not null default '{}'::jsonb,
  pii_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_pii_tenant_user_created_idx
  on public.client_pii (tenant_id, user_id, created_at desc);
create table if not exists public.sanitized_dispute_facts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  bureau text not null check (bureau in ('experian', 'equifax', 'transunion')),
  disputes jsonb not null default '[]'::jsonb,
  redaction_report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sanitized_dispute_facts_tenant_user_created_idx
  on public.sanitized_dispute_facts (tenant_id, user_id, created_at desc);
create table if not exists public.ai_letter_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  bureau text not null check (bureau in ('experian', 'equifax', 'transunion')),
  sanitized_facts_id uuid not null references public.sanitized_dispute_facts(id) on delete cascade,
  model_info jsonb not null default '{}'::jsonb,
  draft_md text not null,
  draft_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_letter_drafts_tenant_user_created_idx
  on public.ai_letter_drafts (tenant_id, user_id, created_at desc);
create index if not exists ai_letter_drafts_sanitized_facts_idx
  on public.ai_letter_drafts (sanitized_facts_id);
create table if not exists public.finalized_letters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  bureau text not null check (bureau in ('experian', 'equifax', 'transunion')),
  ai_draft_id uuid not null references public.ai_letter_drafts(id) on delete cascade,
  dispute_packet_id uuid not null references public.dispute_packets(id) on delete cascade,
  final_html text not null,
  final_pdf_path text not null,
  final_doc_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists finalized_letters_tenant_user_created_idx
  on public.finalized_letters (tenant_id, user_id, created_at desc);
create index if not exists finalized_letters_packet_idx
  on public.finalized_letters (dispute_packet_id);
create or replace function public.nexus_secure_dispute_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
drop trigger if exists trg_client_pii_set_updated_at on public.client_pii;
create trigger trg_client_pii_set_updated_at
before update on public.client_pii
for each row execute procedure public.nexus_secure_dispute_set_updated_at();
drop trigger if exists trg_sanitized_dispute_facts_set_updated_at on public.sanitized_dispute_facts;
create trigger trg_sanitized_dispute_facts_set_updated_at
before update on public.sanitized_dispute_facts
for each row execute procedure public.nexus_secure_dispute_set_updated_at();
drop trigger if exists trg_ai_letter_drafts_set_updated_at on public.ai_letter_drafts;
create trigger trg_ai_letter_drafts_set_updated_at
before update on public.ai_letter_drafts
for each row execute procedure public.nexus_secure_dispute_set_updated_at();
drop trigger if exists trg_finalized_letters_set_updated_at on public.finalized_letters;
create trigger trg_finalized_letters_set_updated_at
before update on public.finalized_letters
for each row execute procedure public.nexus_secure_dispute_set_updated_at();
alter table public.client_pii enable row level security;
alter table public.sanitized_dispute_facts enable row level security;
alter table public.ai_letter_drafts enable row level security;
alter table public.finalized_letters enable row level security;
drop policy if exists client_pii_select_access on public.client_pii;
create policy client_pii_select_access
on public.client_pii
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
);
drop policy if exists client_pii_insert_owner on public.client_pii;
create policy client_pii_insert_owner
on public.client_pii
for insert to authenticated
with check (auth.uid() = user_id);
drop policy if exists client_pii_update_access on public.client_pii;
create policy client_pii_update_access
on public.client_pii
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
)
with check (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
);
drop policy if exists client_pii_delete_access on public.client_pii;
create policy client_pii_delete_access
on public.client_pii
for delete to authenticated
using (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
);
drop policy if exists sanitized_dispute_facts_select_access on public.sanitized_dispute_facts;
create policy sanitized_dispute_facts_select_access
on public.sanitized_dispute_facts
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
);
drop policy if exists sanitized_dispute_facts_insert_owner on public.sanitized_dispute_facts;
create policy sanitized_dispute_facts_insert_owner
on public.sanitized_dispute_facts
for insert to authenticated
with check (auth.uid() = user_id);
drop policy if exists sanitized_dispute_facts_update_access on public.sanitized_dispute_facts;
create policy sanitized_dispute_facts_update_access
on public.sanitized_dispute_facts
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
)
with check (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
);
drop policy if exists sanitized_dispute_facts_delete_access on public.sanitized_dispute_facts;
create policy sanitized_dispute_facts_delete_access
on public.sanitized_dispute_facts
for delete to authenticated
using (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
);
drop policy if exists ai_letter_drafts_select_access on public.ai_letter_drafts;
create policy ai_letter_drafts_select_access
on public.ai_letter_drafts
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
);
drop policy if exists ai_letter_drafts_insert_owner on public.ai_letter_drafts;
create policy ai_letter_drafts_insert_owner
on public.ai_letter_drafts
for insert to authenticated
with check (auth.uid() = user_id);
drop policy if exists ai_letter_drafts_update_access on public.ai_letter_drafts;
create policy ai_letter_drafts_update_access
on public.ai_letter_drafts
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
)
with check (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
);
drop policy if exists ai_letter_drafts_delete_access on public.ai_letter_drafts;
create policy ai_letter_drafts_delete_access
on public.ai_letter_drafts
for delete to authenticated
using (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
);
drop policy if exists finalized_letters_select_access on public.finalized_letters;
create policy finalized_letters_select_access
on public.finalized_letters
for select to authenticated
using (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
);
drop policy if exists finalized_letters_insert_owner on public.finalized_letters;
create policy finalized_letters_insert_owner
on public.finalized_letters
for insert to authenticated
with check (auth.uid() = user_id);
drop policy if exists finalized_letters_update_access on public.finalized_letters;
create policy finalized_letters_update_access
on public.finalized_letters
for update to authenticated
using (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
)
with check (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
);
drop policy if exists finalized_letters_delete_access on public.finalized_letters;
create policy finalized_letters_delete_access
on public.finalized_letters
for delete to authenticated
using (
  auth.uid() = user_id
  or public.nexus_can_manage_tenant_compat(tenant_id)
  or public.nexus_is_master_admin_compat()
);
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table public.client_pii to authenticated, service_role;
grant select, insert, update, delete on table public.sanitized_dispute_facts to authenticated, service_role;
grant select, insert, update, delete on table public.ai_letter_drafts to authenticated, service_role;
grant select, insert, update, delete on table public.finalized_letters to authenticated, service_role;
