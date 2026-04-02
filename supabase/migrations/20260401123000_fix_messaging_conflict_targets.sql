-- Fix PL/pgSQL ambiguity on read-tracking conflict targets.
-- These functions run in production on the live Supabase project.

create or replace function public.messaging_message_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_role text;
  v_last_ts timestamptz;
begin
  if new.sender_user_id is not null then
    v_participant_role :=
      case
        when new.sender_role = 'client' then 'client'
        when new.sender_role = 'admin' then 'admin'
        else 'staff'
      end;

    insert into public.conversation_user_participants (tenant_id, conversation_id, user_id, role)
    values (new.tenant_id, new.conversation_id, new.sender_user_id, v_participant_role)
    on conflict on constraint conversation_user_participants_conversation_id_user_id_key do update
      set role = excluded.role;

    v_last_ts := coalesce(new.received_at, new.sent_at, new.created_at, now());

    insert into public.message_reads (tenant_id, conversation_id, user_id, last_read_message_id, last_read_at, updated_at)
    values (new.tenant_id, new.conversation_id, new.sender_user_id, new.id, v_last_ts, now())
    on conflict on constraint message_reads_conversation_id_user_id_key do update
      set last_read_message_id = excluded.last_read_message_id,
          last_read_at = greatest(public.message_reads.last_read_at, excluded.last_read_at),
          updated_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.mark_conversation_read(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_last_read_message_id uuid default null
)
returns table(
  ok boolean,
  reason text,
  conversation_id uuid,
  last_read_message_id uuid,
  last_read_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_last_message_id uuid := null;
  v_last_ts timestamptz := now();
begin
  if v_uid is null then
    return query select false, 'not_authenticated'::text, p_conversation_id, null::uuid, null::timestamptz;
    return;
  end if;

  if not public.nexus_can_access_conversation(p_tenant_id, p_conversation_id) then
    return query select false, 'not_authorized'::text, p_conversation_id, null::uuid, null::timestamptz;
    return;
  end if;

  if p_last_read_message_id is not null then
    select m.id, coalesce(m.received_at, m.sent_at, m.created_at, now())
      into v_last_message_id, v_last_ts
    from public.messages m
    where m.id = p_last_read_message_id
      and m.conversation_id = p_conversation_id
      and m.tenant_id = p_tenant_id
    limit 1;
  end if;

  if v_last_message_id is null then
    select m.id, coalesce(m.received_at, m.sent_at, m.created_at, now())
      into v_last_message_id, v_last_ts
    from public.messages m
    where m.conversation_id = p_conversation_id
      and m.tenant_id = p_tenant_id
    order by coalesce(m.received_at, m.sent_at, m.created_at) desc, m.id desc
    limit 1;
  end if;

  insert into public.message_reads (tenant_id, conversation_id, user_id, last_read_message_id, last_read_at, updated_at)
  values (p_tenant_id, p_conversation_id, v_uid, v_last_message_id, coalesce(v_last_ts, now()), now())
  on conflict on constraint message_reads_conversation_id_user_id_key do update
    set last_read_message_id = excluded.last_read_message_id,
        last_read_at = greatest(public.message_reads.last_read_at, excluded.last_read_at),
        updated_at = now();

  return query select true, 'ok'::text, p_conversation_id, v_last_message_id, coalesce(v_last_ts, now());
end;
$$;

