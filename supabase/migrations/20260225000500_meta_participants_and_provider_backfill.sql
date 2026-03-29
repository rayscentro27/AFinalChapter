-- Canonical participant mapping for cross-provider read/status resolution.

create table if not exists public.conversation_participants (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  provider text not null check (provider in ('meta', 'twilio', 'whatsapp', 'matrix', 'google_voice')),
  external_user_id text not null,
  external_page_id text null,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_conv_participant
on public.conversation_participants (tenant_id, provider, external_user_id, external_page_id);
create index if not exists cp_convo_idx
on public.conversation_participants (tenant_id, conversation_id);
alter table public.conversation_participants enable row level security;
drop policy if exists cp_select on public.conversation_participants;
create policy cp_select on public.conversation_participants
for select using (public.is_tenant_member(tenant_id));
drop policy if exists cp_insert on public.conversation_participants;
create policy cp_insert on public.conversation_participants
for insert with check (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = conversation_participants.tenant_id
      and tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'supervisor')
  )
);
drop policy if exists cp_update on public.conversation_participants;
create policy cp_update on public.conversation_participants
for update using (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = conversation_participants.tenant_id
      and tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'supervisor')
  )
) with check (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = conversation_participants.tenant_id
      and tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'supervisor')
  )
);
drop policy if exists cp_delete on public.conversation_participants;
create policy cp_delete on public.conversation_participants
for delete using (
  public.nexus_is_master_admin()
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = conversation_participants.tenant_id
      and tm.user_id = auth.uid()
      and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'supervisor')
  )
);
-- Optional but useful denormalization for conversation list filters.
alter table public.conversations
  add column if not exists provider text;
update public.conversations c
set provider = ca.provider
from public.channel_accounts ca
where ca.id = c.channel_account_id
  and (c.provider is null or c.provider = '');
create index if not exists conversations_tenant_provider_idx
on public.conversations (tenant_id, provider);
-- Ensure meta channel auth columns are present on channel_accounts.
alter table public.channel_accounts
  add column if not exists external_account_id text,
  add column if not exists access_token text,
  add column if not exists api_version text;
update public.channel_accounts
set api_version = coalesce(nullif(api_version, ''), 'v22.0')
where provider = 'meta';
