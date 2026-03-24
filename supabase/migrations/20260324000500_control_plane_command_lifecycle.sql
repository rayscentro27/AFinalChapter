begin;

alter table public.admin_commands
  add column if not exists risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high')),
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'requires_approval', 'approved', 'rejected', 'queued', 'executing', 'completed', 'failed', 'cancelled')),
  add column if not exists requires_approval boolean,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists executed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists result_summary text,
  add column if not exists error_message text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists last_transition_at timestamptz not null default now();

update public.admin_commands
set requires_approval = coalesce(requires_approval, approval_required, true)
where requires_approval is null;

update public.admin_commands
set result_summary = coalesce(result_summary, execution_summary)
where result_summary is null and execution_summary is not null;

update public.admin_commands
set status = case
  when execution_outcome = 'failed' or queue_handoff_state = 'failed' then 'failed'
  when execution_outcome = 'completed' or queue_handoff_state = 'completed' then 'completed'
  when queue_handoff_state = 'running' then 'executing'
  when queue_handoff_state = 'queued' then 'queued'
  when approval_status = 'approved' then 'approved'
  when approval_status = 'rejected' or validation_status = 'rejected' then 'rejected'
  when coalesce(requires_approval, approval_required, true) and approval_status = 'pending' then 'requires_approval'
  else 'pending'
end
where status is distinct from case
  when execution_outcome = 'failed' or queue_handoff_state = 'failed' then 'failed'
  when execution_outcome = 'completed' or queue_handoff_state = 'completed' then 'completed'
  when queue_handoff_state = 'running' then 'executing'
  when queue_handoff_state = 'queued' then 'queued'
  when approval_status = 'approved' then 'approved'
  when approval_status = 'rejected' or validation_status = 'rejected' then 'rejected'
  when coalesce(requires_approval, approval_required, true) and approval_status = 'pending' then 'requires_approval'
  else 'pending'
end;

create table if not exists public.admin_command_events (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null references public.admin_commands(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  event_type text not null default 'transition'
    check (event_type in ('created', 'transition', 'approval', 'execution', 'note')),
  from_status text,
  to_status text,
  actor_user_id uuid,
  actor_role text,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_commands_worker_poll_idx
  on public.admin_commands (status, updated_at desc)
  where status = 'queued';

create index if not exists admin_commands_status_created_idx
  on public.admin_commands (status, created_at desc);

create index if not exists admin_commands_tenant_status_idx
  on public.admin_commands (tenant_id, status, created_at desc);

create index if not exists admin_commands_risk_created_idx
  on public.admin_commands (risk_level, created_at desc);

create index if not exists admin_command_events_command_created_idx
  on public.admin_command_events (command_id, created_at desc);

create index if not exists admin_command_events_tenant_created_idx
  on public.admin_command_events (tenant_id, created_at desc);

alter table public.executive_briefings
  add column if not exists recommendations jsonb not null default '[]'::jsonb,
  add column if not exists urgency text not null default 'normal'
    check (urgency in ('low', 'normal', 'high', 'critical'));

update public.executive_briefings
set recommendations = coalesce(recommendations, recommended_actions, '[]'::jsonb)
where recommendations = '[]'::jsonb and recommended_actions is not null;

create index if not exists executive_briefings_tenant_urgency_created_idx
  on public.executive_briefings (tenant_id, urgency, created_at desc);

create or replace function public.admin_command_transition_is_allowed(
  p_from_status text,
  p_to_status text,
  p_risk_level text,
  p_requires_approval boolean
)
returns boolean
language plpgsql
as $$
begin
  if p_from_status is null or p_from_status = '' then
    return p_to_status = 'pending';
  end if;

  if p_from_status = p_to_status then
    return true;
  end if;

  if p_from_status = 'pending' and p_to_status = 'requires_approval' then
    return coalesce(p_requires_approval, false) or coalesce(p_risk_level, 'medium') <> 'low';
  end if;

  if p_from_status = 'pending' and p_to_status = 'queued' then
    return coalesce(p_risk_level, 'medium') = 'low' and not coalesce(p_requires_approval, false);
  end if;

  if p_from_status = 'requires_approval' and p_to_status in ('approved', 'rejected', 'cancelled') then
    return true;
  end if;

  if p_from_status = 'approved' and p_to_status in ('queued', 'cancelled') then
    return true;
  end if;

  if p_from_status = 'queued' and p_to_status in ('executing', 'cancelled') then
    return true;
  end if;

  if p_from_status = 'executing' and p_to_status in ('completed', 'failed') then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.sync_admin_command_lifecycle()
returns trigger
language plpgsql
as $$
declare
  previous_status text;
begin
  previous_status := case when tg_op = 'INSERT' then null else old.status end;

  new.requires_approval := coalesce(new.requires_approval, new.approval_required, new.risk_level <> 'low');
  new.approval_required := new.requires_approval;
  new.risk_level := coalesce(new.risk_level, 'medium');
  new.status := coalesce(nullif(new.status, ''), 'pending');

  if tg_op = 'UPDATE' and not public.admin_command_transition_is_allowed(previous_status, new.status, new.risk_level, new.requires_approval) then
    raise exception 'invalid_admin_command_transition: % -> %', previous_status, new.status;
  end if;

  if tg_op = 'UPDATE' and previous_status is distinct from new.status then
    new.last_transition_at := now();
  end if;

  if new.status = 'approved' then
    new.approval_status := 'approved';
    new.approved_at := coalesce(new.approved_at, now());
  elsif new.status = 'rejected' then
    new.approval_status := 'rejected';
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status = 'requires_approval' then
    new.approval_status := 'pending';
  elsif not new.requires_approval then
    new.approval_status := 'not_required';
  elsif new.status = 'pending' then
    new.approval_status := 'pending';
  end if;

  if new.status = 'queued' then
    new.queue_handoff_state := 'queued';
  elsif new.status = 'executing' then
    new.queue_handoff_state := 'running';
    new.executed_at := coalesce(new.executed_at, now());
  elsif new.status = 'completed' then
    new.queue_handoff_state := 'completed';
    new.execution_outcome := 'completed';
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status = 'failed' then
    new.queue_handoff_state := 'failed';
    new.execution_outcome := 'failed';
  elsif new.status = 'cancelled' then
    new.queue_handoff_state := 'cancelled';
    new.execution_outcome := 'cancelled';
    new.cancelled_at := coalesce(new.cancelled_at, now());
  elsif new.status = 'rejected' then
    new.queue_handoff_state := coalesce(new.queue_handoff_state, 'not_queued');
    new.execution_outcome := 'rejected';
  elsif new.status in ('pending', 'requires_approval', 'approved') then
    new.queue_handoff_state := 'not_queued';
    new.execution_outcome := 'pending';
  end if;

  if new.status in ('pending', 'requires_approval', 'approved', 'queued', 'executing') then
    new.execution_outcome := case when new.status = 'executing' then 'pending' else coalesce(new.execution_outcome, 'pending') end;
  end if;

  new.validation_status := case
    when new.status = 'rejected' then 'rejected'
    when new.status = 'pending' then coalesce(nullif(new.validation_status, ''), 'pending')
    else 'valid'
  end;

  new.result_summary := coalesce(new.result_summary, new.execution_summary);
  new.execution_summary := coalesce(new.execution_summary, new.result_summary);

  return new;
end;
$$;

create or replace function public.log_admin_command_event()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.admin_command_events (
      command_id,
      tenant_id,
      event_type,
      to_status,
      detail,
      metadata
    )
    values (
      new.id,
      new.tenant_id,
      'created',
      new.status,
      'Command created in control plane.',
      jsonb_build_object('risk_level', new.risk_level, 'requires_approval', new.requires_approval)
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.admin_command_events (
      command_id,
      tenant_id,
      event_type,
      from_status,
      to_status,
      detail,
      metadata
    )
    values (
      new.id,
      new.tenant_id,
      case
        when new.status in ('approved', 'rejected') then 'approval'
        when new.status in ('queued', 'executing', 'completed', 'failed', 'cancelled') then 'execution'
        else 'transition'
      end,
      old.status,
      new.status,
      coalesce(new.result_summary, new.execution_summary, new.error_message, 'Command status changed.'),
      jsonb_build_object('risk_level', new.risk_level, 'requires_approval', new.requires_approval)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_admin_commands_sync_lifecycle on public.admin_commands;
create trigger trg_admin_commands_sync_lifecycle
before insert or update on public.admin_commands
for each row execute function public.sync_admin_command_lifecycle();

drop trigger if exists trg_admin_commands_log_event on public.admin_commands;
create trigger trg_admin_commands_log_event
after insert or update on public.admin_commands
for each row execute function public.log_admin_command_event();

alter table public.admin_command_events enable row level security;

drop policy if exists admin_command_events_admin_select on public.admin_command_events;
create policy admin_command_events_admin_select on public.admin_command_events
for select to authenticated
using (public.nexus_is_master_admin());

drop policy if exists admin_command_events_admin_write on public.admin_command_events;
create policy admin_command_events_admin_write on public.admin_command_events
for all to authenticated
using (public.nexus_is_master_admin())
with check (public.nexus_is_master_admin());

commit;