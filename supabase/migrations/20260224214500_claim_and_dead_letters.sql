-- Atomic claim helper + webhook dead-letter queue.

create or replace function public.claim_conversation(
  p_tenant_id uuid,
  p_conversation_id uuid
)
returns table(ok boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return query select false, 'not_authenticated'::text;
    return;
  end if;

  if not exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = v_uid
      and lower(coalesce(tm.role, '')) in ('owner', 'admin', 'agent', 'supervisor', 'sales')
  ) then
    return query select false, 'not_authorized'::text;
    return;
  end if;

  update public.conversations c
     set assignee_type = 'agent',
         assignee_user_id = v_uid,
         assignee_ai_key = null,
         status = case
           when lower(coalesce(c.status::text, '')) = 'closed' then 'open'::public.conversation_status
           else c.status
         end,
         updated_at = now()
   where c.tenant_id = p_tenant_id
     and c.id = p_conversation_id
     and (
       c.assignee_user_id is null
       or lower(coalesce(c.assignee_type::text, '')) = 'ai'
     );

  if found then
    insert into public.routing_runs (tenant_id, conversation_id, rule_id, applied, notes)
    values (p_tenant_id, p_conversation_id, null, true, 'Claimed by agent via RPC');

    return query select true, 'claimed'::text;
  else
    return query select false, 'already_claimed'::text;
  end if;
end;
$$;
revoke all on function public.claim_conversation(uuid, uuid) from public;
grant execute on function public.claim_conversation(uuid, uuid) to authenticated;
create table if not exists public.webhook_dead_letters (
  id bigserial primary key,
  tenant_id uuid null references public.tenants(id) on delete cascade,
  provider text not null,
  endpoint text not null,
  headers jsonb,
  payload jsonb,
  error text,
  attempts int not null default 0,
  next_retry_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists webhook_dead_letters_unresolved_idx
  on public.webhook_dead_letters (resolved_at, next_retry_at);
create index if not exists webhook_dead_letters_tenant_idx
  on public.webhook_dead_letters (tenant_id, created_at desc);
drop trigger if exists trg_webhook_dead_letters_updated_at on public.webhook_dead_letters;
create trigger trg_webhook_dead_letters_updated_at
before update on public.webhook_dead_letters
for each row execute function public.set_updated_at();
alter table public.webhook_dead_letters enable row level security;
drop policy if exists webhook_dead_letters_select on public.webhook_dead_letters;
create policy webhook_dead_letters_select on public.webhook_dead_letters
for select
using (
  public.nexus_is_master_admin()
  or (
    tenant_id is not null
    and public.is_tenant_member(tenant_id)
  )
);
drop policy if exists webhook_dead_letters_insert on public.webhook_dead_letters;
create policy webhook_dead_letters_insert on public.webhook_dead_letters
for insert
with check (
  public.nexus_is_master_admin()
  or (
    tenant_id is not null
    and public.nexus_can_manage_tenant_members(tenant_id)
  )
);
drop policy if exists webhook_dead_letters_update on public.webhook_dead_letters;
create policy webhook_dead_letters_update on public.webhook_dead_letters
for update
using (
  public.nexus_is_master_admin()
  or (
    tenant_id is not null
    and public.nexus_can_manage_tenant_members(tenant_id)
  )
)
with check (
  public.nexus_is_master_admin()
  or (
    tenant_id is not null
    and public.nexus_can_manage_tenant_members(tenant_id)
  )
);
drop policy if exists webhook_dead_letters_delete on public.webhook_dead_letters;
create policy webhook_dead_letters_delete on public.webhook_dead_letters
for delete
using (
  public.nexus_is_master_admin()
  or (
    tenant_id is not null
    and public.nexus_can_manage_tenant_members(tenant_id)
  )
);
