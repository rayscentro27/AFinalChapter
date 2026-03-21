-- Cross-channel canonical identity layer for unified inbox.

create extension if not exists pgcrypto;
alter table if exists public.contacts
  add column if not exists primary_email text,
  add column if not exists primary_phone text,
  add column if not exists merged_into_contact_id uuid;
update public.contacts
set primary_email = lower(coalesce(primary_email, email))
where coalesce(primary_email, '') = ''
  and coalesce(email, '') <> '';
update public.contacts
set primary_phone = coalesce(primary_phone, phone_e164, wa_number, phone)
where coalesce(primary_phone, '') = ''
  and coalesce(phone_e164, wa_number, phone, '') <> '';
create index if not exists contacts_merged_idx
on public.contacts (tenant_id, merged_into_contact_id);
alter table if exists public.conversations
  add column if not exists contact_id uuid;
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'conversations'
      and constraint_name = 'conversations_contact_fk'
  ) then
    alter table public.conversations
      add constraint conversations_contact_fk
      foreign key (contact_id) references public.contacts(id) on delete set null;
  end if;
end $$;
create table if not exists public.contact_identities (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  provider text not null,
  identity_type text not null,
  identity_value text not null,
  channel_account_id uuid null references public.channel_accounts(id) on delete set null,
  is_primary boolean not null default false,
  verified boolean not null default false,
  confidence int not null default 50,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_contact_identity
on public.contact_identities (
  tenant_id,
  provider,
  identity_type,
  identity_value,
  coalesce(channel_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index if not exists ci_contact_idx
on public.contact_identities (tenant_id, contact_id);
create index if not exists ci_lookup_idx
on public.contact_identities (tenant_id, provider, identity_type, identity_value);
create table if not exists public.contact_merge_audit (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_contact_id uuid not null references public.contacts(id) on delete cascade,
  into_contact_id uuid not null references public.contacts(id) on delete cascade,
  merged_by uuid,
  reason text,
  snapshot jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cma_tenant_idx
on public.contact_merge_audit (tenant_id, created_at);
-- Backfill identity rows from existing contact columns.
insert into public.contact_identities (
  tenant_id,
  contact_id,
  provider,
  identity_type,
  identity_value,
  verified,
  confidence,
  metadata
)
select
  c.tenant_id,
  c.id,
  'custom',
  'phone',
  c.phone_e164,
  true,
  90,
  jsonb_build_object('source', 'contacts.phone_e164_backfill')
from public.contacts c
where c.phone_e164 is not null
  and btrim(c.phone_e164) <> ''
on conflict do nothing;
insert into public.contact_identities (
  tenant_id,
  contact_id,
  provider,
  identity_type,
  identity_value,
  verified,
  confidence,
  metadata
)
select
  c.tenant_id,
  c.id,
  'custom',
  'phone',
  c.wa_number,
  true,
  90,
  jsonb_build_object('source', 'contacts.wa_number_backfill')
from public.contacts c
where c.wa_number is not null
  and btrim(c.wa_number) <> ''
on conflict do nothing;
insert into public.contact_identities (
  tenant_id,
  contact_id,
  provider,
  identity_type,
  identity_value,
  verified,
  confidence,
  metadata
)
select
  c.tenant_id,
  c.id,
  'custom',
  'email',
  lower(c.email),
  true,
  95,
  jsonb_build_object('source', 'contacts.email_backfill')
from public.contacts c
where c.email is not null
  and btrim(c.email) <> ''
on conflict do nothing;
insert into public.contact_identities (
  tenant_id,
  contact_id,
  provider,
  identity_type,
  identity_value,
  verified,
  confidence,
  metadata
)
select
  c.tenant_id,
  c.id,
  'meta',
  case when c.fb_psid like 'ig:%' then 'igsid' else 'psid' end,
  case when c.fb_psid like 'ig:%' then substr(c.fb_psid, 4) else c.fb_psid end,
  false,
  70,
  jsonb_build_object('source', 'contacts.fb_psid_backfill')
from public.contacts c
where c.fb_psid is not null
  and btrim(c.fb_psid) <> ''
on conflict do nothing;
insert into public.contact_identities (
  tenant_id,
  contact_id,
  provider,
  identity_type,
  identity_value,
  verified,
  confidence,
  metadata
)
select
  c.tenant_id,
  c.id,
  'matrix',
  'matrix_user',
  lower(c.matrix_user_id),
  false,
  60,
  jsonb_build_object('source', 'contacts.matrix_user_backfill')
from public.contacts c
where c.matrix_user_id is not null
  and btrim(c.matrix_user_id) <> ''
on conflict do nothing;
-- Ensure each contact has at least one primary identity.
with ranked as (
  select
    id,
    row_number() over (partition by tenant_id, contact_id order by verified desc, confidence desc, created_at asc, id asc) as rn
  from public.contact_identities
)
update public.contact_identities ci
set is_primary = true
from ranked r
where ci.id = r.id
  and r.rn = 1
  and ci.is_primary = false;
alter table public.contact_identities enable row level security;
alter table public.contact_merge_audit enable row level security;
drop policy if exists contact_identities_select on public.contact_identities;
create policy contact_identities_select on public.contact_identities
for select using (
  exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = contact_identities.tenant_id
      and tm.user_id = auth.uid()
  )
);
drop policy if exists contact_identities_write on public.contact_identities;
create policy contact_identities_write on public.contact_identities
for all using (
  exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = contact_identities.tenant_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin', 'agent')
  )
) with check (
  exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = contact_identities.tenant_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin', 'agent')
  )
);
drop policy if exists contact_merge_audit_select on public.contact_merge_audit;
create policy contact_merge_audit_select on public.contact_merge_audit
for select using (
  exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = contact_merge_audit.tenant_id
      and tm.user_id = auth.uid()
  )
);
drop policy if exists contact_merge_audit_write on public.contact_merge_audit;
create policy contact_merge_audit_write on public.contact_merge_audit
for insert with check (
  exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = contact_merge_audit.tenant_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
  )
);
