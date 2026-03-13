-- Prompt 5: dispute letter pipeline (redact -> generate -> merge -> store)

create extension if not exists pgcrypto;

create or replace function public.nexus_can_access_tenant_compat(t uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  has_access boolean := false;
begin
  if t is null then
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
      )
    $sql$ into has_access using t;

    if coalesce(has_access, false) then
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
      )
    $sql$ into has_access using t;

    if coalesce(has_access, false) then
      return true;
    end if;
  end if;

  return false;
end;
$fn$;

grant execute on function public.nexus_can_access_tenant_compat(uuid) to authenticated;

create table if not exists public.dispute_letter_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contact_id text,
  requested_by_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  raw_context_sha256 text,
  redaction_stats jsonb not null default '{}'::jsonb,
  redacted_context jsonb not null default '{}'::jsonb,
  generation_prompt text not null,
  generated_draft text not null,
  merged_letter text not null,
  model text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dispute_letter_runs_tenant_created_idx
  on public.dispute_letter_runs (tenant_id, created_at desc);

create index if not exists dispute_letter_runs_requester_created_idx
  on public.dispute_letter_runs (requested_by_user_id, created_at desc);

create table if not exists public.dispute_letters (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.dispute_letter_runs(id) on delete cascade,
  tenant_id uuid not null,
  contact_id text,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  letter_text text not null,
  output_format text not null default 'text/plain',
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dispute_letters_tenant_created_idx
  on public.dispute_letters (tenant_id, created_at desc);

create index if not exists dispute_letters_run_idx
  on public.dispute_letters (run_id);

create or replace function public.dispute_letters_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_dispute_letter_runs_set_updated_at on public.dispute_letter_runs;
create trigger trg_dispute_letter_runs_set_updated_at
before update on public.dispute_letter_runs
for each row execute procedure public.dispute_letters_set_updated_at();

drop trigger if exists trg_dispute_letters_set_updated_at on public.dispute_letters;
create trigger trg_dispute_letters_set_updated_at
before update on public.dispute_letters
for each row execute procedure public.dispute_letters_set_updated_at();

alter table public.dispute_letter_runs enable row level security;
alter table public.dispute_letters enable row level security;

-- dispute_letter_runs policies
DROP POLICY IF EXISTS dispute_letter_runs_select_access ON public.dispute_letter_runs;
create policy dispute_letter_runs_select_access
on public.dispute_letter_runs
for select to authenticated
using (
  public.nexus_is_master_admin_compat()
  or requested_by_user_id = auth.uid()
  or public.nexus_can_access_tenant_compat(tenant_id)
);

DROP POLICY IF EXISTS dispute_letter_runs_insert_access ON public.dispute_letter_runs;
create policy dispute_letter_runs_insert_access
on public.dispute_letter_runs
for insert to authenticated
with check (
  requested_by_user_id = auth.uid()
  and public.nexus_can_access_tenant_compat(tenant_id)
);

DROP POLICY IF EXISTS dispute_letter_runs_update_access ON public.dispute_letter_runs;
create policy dispute_letter_runs_update_access
on public.dispute_letter_runs
for update to authenticated
using (
  public.nexus_is_master_admin_compat()
  or requested_by_user_id = auth.uid()
)
with check (
  public.nexus_is_master_admin_compat()
  or requested_by_user_id = auth.uid()
);

-- dispute_letters policies
DROP POLICY IF EXISTS dispute_letters_select_access ON public.dispute_letters;
create policy dispute_letters_select_access
on public.dispute_letters
for select to authenticated
using (
  public.nexus_is_master_admin_compat()
  or created_by_user_id = auth.uid()
  or public.nexus_can_access_tenant_compat(tenant_id)
);

DROP POLICY IF EXISTS dispute_letters_insert_access ON public.dispute_letters;
create policy dispute_letters_insert_access
on public.dispute_letters
for insert to authenticated
with check (
  created_by_user_id = auth.uid()
  and public.nexus_can_access_tenant_compat(tenant_id)
);

DROP POLICY IF EXISTS dispute_letters_update_access ON public.dispute_letters;
create policy dispute_letters_update_access
on public.dispute_letters
for update to authenticated
using (
  public.nexus_is_master_admin_compat()
  or created_by_user_id = auth.uid()
)
with check (
  public.nexus_is_master_admin_compat()
  or created_by_user_id = auth.uid()
);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.dispute_letter_runs to anon, authenticated, service_role;
grant select, insert, update, delete on table public.dispute_letters to anon, authenticated, service_role;
