-- Compliant approval-intel pipeline (no credential-bypass scraping)
-- Includes: intel ingestion storage, matching engine, overdue alerts, attachment metadata support.

create extension if not exists pgcrypto;

-- -------------------------------------------------
-- Role helper: staff check (admin/supervisor/sales)
-- -------------------------------------------------
create or replace function public.nexus_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.user_id = auth.uid()
      and tm.role in ('admin', 'supervisor', 'sales', 'salesperson')
  );
$$;

grant execute on function public.nexus_is_staff() to authenticated;

-- -------------------------------------------------
-- Profile fields needed for approval-intel matching
-- -------------------------------------------------
alter table public.tenant_profiles
  add column if not exists fico_score int,
  add column if not exists inquiries_6_12 int,
  add column if not exists inquiries_12_24 int,
  add column if not exists oldest_account_age_months int,
  add column if not exists total_income_annual int,
  add column if not exists business_age_days int,
  add column if not exists prequal_stage text not null default 'Pre-Qual Check';

-- -------------------------------------------------
-- Task templates: required attachments metadata
-- -------------------------------------------------
alter table public.task_templates
  add column if not exists required_attachments jsonb not null default '[]'::jsonb;

update public.task_templates
set required_attachments = jsonb_build_array(
  'Personal 1040 tax returns (last 2 years) with schedules',
  'Business tax returns (1120/1120-S/1065, last 2 years)',
  'Recent pay stubs from your company (if applicable)',
  'Last 3 months bank statements for the linked account',
  'Current-year YTD Profit & Loss statement',
  'Formation/ownership proof (articles/incorporation docs)'
)
where key = 'upload_credit_report'
  and coalesce(required_attachments, '[]'::jsonb) = '[]'::jsonb;

update public.task_templates
set required_attachments = jsonb_build_array(
  'All bureau credit report files uploaded',
  'Any prior dispute letters/responses (if available)'
)
where key = 'review_credit_report'
  and coalesce(required_attachments, '[]'::jsonb) = '[]'::jsonb;

update public.task_templates
set required_attachments = jsonb_build_array(
  'Articles of incorporation/organization',
  'EIN confirmation letter',
  'Business bank verification'
)
where key = 'form_entity'
  and coalesce(required_attachments, '[]'::jsonb) = '[]'::jsonb;

create or replace function public.sync_task_required_attachments(p_tenant_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  if auth.role() = 'authenticated'
     and not (public.nexus_can_access_tenant(p_tenant_id) or public.nexus_is_staff()) then
    raise exception 'unauthorized for tenant_id=%', p_tenant_id;
  end if;

  update public.client_tasks ct
  set meta = coalesce(ct.meta, '{}'::jsonb) || jsonb_build_object(
    'required_attachments',
    coalesce(tt.required_attachments, '[]'::jsonb)
  ),
  updated_at = now()
  from public.task_templates tt
  where ct.tenant_id = p_tenant_id
    and ct.template_key = tt.key
    and (
      ct.meta->'required_attachments' is null
      or ct.meta->'required_attachments' is distinct from coalesce(tt.required_attachments, '[]'::jsonb)
    );

  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function public.sync_task_required_attachments(uuid) to authenticated;

-- -------------------------------------------------
-- Notifications metadata (for dedupe/context)
-- -------------------------------------------------
alter table public.tenant_notifications
  add column if not exists meta jsonb not null default '{}'::jsonb;

create index if not exists tenant_notifications_tenant_type_created_idx
on public.tenant_notifications (tenant_id, type, created_at desc);

-- -------------------------------------------------
-- Approval Intel posts (manually/partner-fed)
-- -------------------------------------------------
create table if not exists public.approval_intel_posts (
  id uuid primary key default gen_random_uuid(),

  source text not null default 'manual',
  source_thread text,
  source_url text,
  source_post_id text,

  applied_at timestamptz,
  captured_at timestamptz not null default now(),

  card_name text not null,
  bureau text,
  fico_score int,

  inquiries_6_12 int,
  inquiries_12_24 int,
  inquiries_24_24 int,

  new_accounts_6_12 int,
  new_accounts_12_24 int,

  oldest_account_age_months int,
  annual_income int,
  business_age_days int,
  revenue_annual int,

  instant_approval boolean,
  credit_limit int,

  screenshot_url text,
  screenshot_verified boolean not null default false,

  notes text,
  raw_payload jsonb not null default '{}'::jsonb,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint approval_intel_posts_fico_chk
    check (fico_score is null or (fico_score >= 300 and fico_score <= 900))
);

create unique index if not exists approval_intel_posts_source_post_uidx
on public.approval_intel_posts (source, source_post_id)
where source_post_id is not null;

create index if not exists approval_intel_posts_recent_idx
on public.approval_intel_posts (captured_at desc);

create index if not exists approval_intel_posts_card_recent_idx
on public.approval_intel_posts (card_name, captured_at desc);

alter table public.approval_intel_posts enable row level security;

drop policy if exists approval_intel_posts_select on public.approval_intel_posts;
create policy approval_intel_posts_select on public.approval_intel_posts
for select
using (public.nexus_is_staff());

drop policy if exists approval_intel_posts_insert on public.approval_intel_posts;
create policy approval_intel_posts_insert on public.approval_intel_posts
for insert
with check (auth.role() = 'authenticated' and public.nexus_is_staff());

drop policy if exists approval_intel_posts_update on public.approval_intel_posts;
create policy approval_intel_posts_update on public.approval_intel_posts
for update
using (auth.role() = 'authenticated' and public.nexus_is_staff())
with check (auth.role() = 'authenticated' and public.nexus_is_staff());

drop policy if exists approval_intel_posts_delete on public.approval_intel_posts;
create policy approval_intel_posts_delete on public.approval_intel_posts
for delete
using (public.nexus_is_master_admin());

-- -------------------------------------------------
-- Matches between tenant profile and approval posts
-- -------------------------------------------------
create table if not exists public.approval_intel_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  intel_post_id uuid not null references public.approval_intel_posts(id) on delete cascade,

  match_score int not null,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  recommended_action text,
  snapshot jsonb not null default '{}'::jsonb,

  status text not null default 'new' check (status in ('new', 'notified', 'dismissed', 'acted')),
  matched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id, intel_post_id)
);

create index if not exists approval_intel_matches_tenant_idx
on public.approval_intel_matches (tenant_id, matched_at desc);

create index if not exists approval_intel_matches_post_idx
on public.approval_intel_matches (intel_post_id);

alter table public.approval_intel_matches enable row level security;

drop policy if exists approval_intel_matches_select on public.approval_intel_matches;
create policy approval_intel_matches_select on public.approval_intel_matches
for select
using (public.nexus_is_staff() or public.nexus_can_access_tenant(tenant_id));

drop policy if exists approval_intel_matches_insert on public.approval_intel_matches;
create policy approval_intel_matches_insert on public.approval_intel_matches
for insert
with check (auth.role() = 'authenticated' and public.nexus_is_staff());

drop policy if exists approval_intel_matches_update on public.approval_intel_matches;
create policy approval_intel_matches_update on public.approval_intel_matches
for update
using (auth.role() = 'authenticated' and public.nexus_is_staff())
with check (auth.role() = 'authenticated' and public.nexus_is_staff());

-- -------------------------------------------------
-- Overdue alert event ledger (dedupe)
-- -------------------------------------------------
create table if not exists public.task_alert_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  task_id text not null,
  alert_type text not null,
  alert_date date not null default current_date,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint task_alert_events_task_fk
    foreign key (tenant_id, task_id)
    references public.client_tasks(tenant_id, task_id)
    on delete cascade,

  constraint task_alert_events_uniq
    unique (tenant_id, task_id, alert_type, alert_date)
);

create index if not exists task_alert_events_tenant_created_idx
on public.task_alert_events (tenant_id, created_at desc);

alter table public.task_alert_events enable row level security;

drop policy if exists task_alert_events_select on public.task_alert_events;
create policy task_alert_events_select on public.task_alert_events
for select
using (public.nexus_is_staff() or public.nexus_can_access_tenant(tenant_id));

drop policy if exists task_alert_events_insert on public.task_alert_events;
create policy task_alert_events_insert on public.task_alert_events
for insert
with check (auth.role() = 'authenticated' and public.nexus_is_staff());

-- -------------------------------------------------
-- Helper scoring function
-- -------------------------------------------------
create or replace function public.compute_approval_intel_match_score(
  p_fico_client int,
  p_fico_post int,
  p_inq_6_12_client int,
  p_inq_6_12_post int,
  p_inq_12_24_client int,
  p_inq_12_24_post int,
  p_age_months_client int,
  p_age_months_post int,
  p_income_client int,
  p_income_post int,
  p_business_age_client int,
  p_business_age_post int
)
returns int
language plpgsql
immutable
as $$
declare
  v int := 100;
  v_income_ratio numeric;
begin
  if p_fico_client is not null and p_fico_post is not null then
    v := v - least(20, abs(p_fico_client - p_fico_post));
  end if;

  if p_inq_6_12_client is not null and p_inq_6_12_post is not null then
    v := v - least(15, greatest(0, p_inq_6_12_client - p_inq_6_12_post) * 5);
  end if;

  if p_inq_12_24_client is not null and p_inq_12_24_post is not null then
    v := v - least(15, greatest(0, p_inq_12_24_client - p_inq_12_24_post) * 3);
  end if;

  if p_age_months_client is not null and p_age_months_post is not null then
    if p_age_months_client + 24 < p_age_months_post then
      v := v - 15;
    end if;
  end if;

  if p_income_client is not null and p_income_post is not null and p_income_post > 0 then
    v_income_ratio := p_income_client::numeric / p_income_post::numeric;
    if v_income_ratio < 0.8 then
      v := v - 20;
    elsif v_income_ratio < 1 then
      v := v - 8;
    end if;
  end if;

  if p_business_age_client is not null and p_business_age_post is not null then
    if p_business_age_client + 90 < p_business_age_post then
      v := v - 10;
    end if;
  end if;

  return greatest(0, least(100, v));
end $$;

-- -------------------------------------------------
-- Match for one tenant
-- -------------------------------------------------
create or replace function public.match_approval_intel_for_tenant(
  p_tenant_id uuid,
  p_hours int default 48
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.tenant_profiles%rowtype;
  post_row public.approval_intel_posts%rowtype;
  v_now timestamptz := now();
  v_inserted int := 0;
  v_updated int := 0;
  v_examined int := 0;
  v_score int;
  v_conf text;
  v_action text;
  v_inserted_match boolean;

  v_fico_ok boolean;
  v_inq_6_12_ok boolean;
  v_inq_12_24_ok boolean;
  v_age_ok boolean;
  v_income_ok boolean;
  v_business_age_ok boolean;

  v_task_id text;
  v_url text;
begin
  if auth.role() = 'authenticated'
     and not (public.nexus_can_access_tenant(p_tenant_id) or public.nexus_is_staff()) then
    raise exception 'unauthorized for tenant_id=%', p_tenant_id;
  end if;

  select * into prof
  from public.tenant_profiles
  where tenant_id = p_tenant_id;

  if not found then
    return jsonb_build_object('ok', true, 'tenant_id', p_tenant_id, 'skipped', 'no_profile');
  end if;

  if coalesce(prof.prequal_stage, '') not in ('Ready to Apply', 'Pre-Qual Check') then
    return jsonb_build_object('ok', true, 'tenant_id', p_tenant_id, 'skipped', 'stage_not_ready', 'stage', prof.prequal_stage);
  end if;

  for post_row in
    select *
    from public.approval_intel_posts p
    where p.captured_at >= (v_now - make_interval(hours => greatest(1, p_hours)))
      and p.screenshot_verified = true
    order by p.captured_at desc
  loop
    v_examined := v_examined + 1;

    v_fico_ok := prof.fico_score is null or post_row.fico_score is null or abs(prof.fico_score - post_row.fico_score) <= 15;
    v_inq_6_12_ok := prof.inquiries_6_12 is null or post_row.inquiries_6_12 is null or prof.inquiries_6_12 <= post_row.inquiries_6_12 + 1;
    v_inq_12_24_ok := prof.inquiries_12_24 is null or post_row.inquiries_12_24 is null or prof.inquiries_12_24 <= post_row.inquiries_12_24 + 2;
    v_age_ok := prof.oldest_account_age_months is null or post_row.oldest_account_age_months is null or prof.oldest_account_age_months >= greatest(0, post_row.oldest_account_age_months - 24);
    v_income_ok := prof.total_income_annual is null or post_row.annual_income is null or prof.total_income_annual >= round(post_row.annual_income * 0.8);
    v_business_age_ok := prof.business_age_days is null or post_row.business_age_days is null or prof.business_age_days >= greatest(0, post_row.business_age_days - 60);

    if v_fico_ok and v_inq_6_12_ok and v_inq_12_24_ok and v_age_ok and v_income_ok and v_business_age_ok then
      v_score := public.compute_approval_intel_match_score(
        prof.fico_score,
        post_row.fico_score,
        prof.inquiries_6_12,
        post_row.inquiries_6_12,
        prof.inquiries_12_24,
        post_row.inquiries_12_24,
        prof.oldest_account_age_months,
        post_row.oldest_account_age_months,
        prof.total_income_annual,
        post_row.annual_income,
        prof.business_age_days,
        post_row.business_age_days
      );

      v_conf := case when v_score >= 90 then 'high' when v_score >= 75 then 'medium' else 'low' end;
      v_action := case when v_score >= 90 then 'pull_trigger_now' when v_score >= 75 then 'review_then_apply' else 'monitor' end;

      insert into public.approval_intel_matches (
        tenant_id,
        intel_post_id,
        match_score,
        confidence,
        recommended_action,
        snapshot,
        status,
        matched_at,
        updated_at
      )
      values (
        p_tenant_id,
        post_row.id,
        v_score,
        v_conf,
        v_action,
        jsonb_build_object(
          'fico_client', prof.fico_score,
          'fico_post', post_row.fico_score,
          'inquiries_6_12_client', prof.inquiries_6_12,
          'inquiries_6_12_post', post_row.inquiries_6_12,
          'inquiries_12_24_client', prof.inquiries_12_24,
          'inquiries_12_24_post', post_row.inquiries_12_24,
          'oldest_account_age_months_client', prof.oldest_account_age_months,
          'oldest_account_age_months_post', post_row.oldest_account_age_months,
          'income_client', prof.total_income_annual,
          'income_post', post_row.annual_income,
          'instant_approval', post_row.instant_approval,
          'card_name', post_row.card_name
        ),
        'new',
        v_now,
        v_now
      )
      on conflict (tenant_id, intel_post_id)
      do update set
        match_score = excluded.match_score,
        confidence = excluded.confidence,
        recommended_action = excluded.recommended_action,
        snapshot = excluded.snapshot,
        updated_at = now()
      returning (xmax = 0) into v_inserted_match;

      if v_inserted_match then
        v_inserted := v_inserted + 1;

        v_task_id := 'intel:' || replace(substring(post_row.id::text from 1 for 12), '-', '');
        v_url := coalesce(post_row.source_url, post_row.source_thread, '');

        insert into public.client_tasks (
          tenant_id,
          task_id,
          title,
          description,
          status,
          due_date,
          type,
          signal,
          assigned_employee,
          group_key,
          template_key,
          meta
        )
        values (
          p_tenant_id,
          v_task_id,
          'Approval Wave Match: ' || post_row.card_name,
          'A screenshot-verified profile close to your metrics was approved. Review and decide whether to apply now.',
          'pending',
          current_date + 1,
          'review',
          case when coalesce(post_row.instant_approval, false) then 'green' else 'yellow' end,
          'Nexus Analyst',
          'credit_intel',
          'approval_intel_match',
          jsonb_build_object(
            'intel_post_id', post_row.id,
            'source_url', v_url,
            'match_score', v_score,
            'required_attachments', jsonb_build_array(
              'Most recent tri-merge or bureau report',
              'Last 2 years tax returns with schedules',
              'Last 3 months bank statements'
            )
          )
        )
        on conflict (tenant_id, task_id) do nothing;

        insert into public.tenant_notifications (
          tenant_id,
          type,
          severity,
          title,
          message,
          meta
        )
        values (
          p_tenant_id,
          'approval_intel_match',
          case when v_score >= 90 then 'info' else 'warn' end,
          'Live Approval Match',
          format('%s profile match (%s%%). Card: %s', initcap(v_conf), v_score, post_row.card_name),
          jsonb_build_object(
            'intel_post_id', post_row.id,
            'source_url', v_url,
            'match_score', v_score,
            'confidence', v_conf
          )
        );
      else
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'examined', v_examined,
    'matched', v_inserted,
    'updated', v_updated
  );
end $$;

grant execute on function public.match_approval_intel_for_tenant(uuid, int) to authenticated;

-- -------------------------------------------------
-- Batch match for all ready tenants
-- -------------------------------------------------
create or replace function public.match_approval_intel_recent(
  p_hours int default 48
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_res jsonb;
  v_tenants int := 0;
  v_examined int := 0;
  v_matched int := 0;
  v_updated int := 0;
begin
  if auth.role() = 'authenticated' and not public.nexus_is_staff() then
    raise exception 'staff role required';
  end if;

  for t in
    select tp.tenant_id
    from public.tenant_profiles tp
    where coalesce(tp.prequal_stage, '') in ('Ready to Apply', 'Pre-Qual Check')
  loop
    v_tenants := v_tenants + 1;
    v_res := public.match_approval_intel_for_tenant(t.tenant_id, p_hours);

    v_examined := v_examined + coalesce((v_res->>'examined')::int, 0);
    v_matched := v_matched + coalesce((v_res->>'matched')::int, 0);
    v_updated := v_updated + coalesce((v_res->>'updated')::int, 0);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'tenants', v_tenants,
    'examined', v_examined,
    'matched', v_matched,
    'updated', v_updated
  );
end $$;

grant execute on function public.match_approval_intel_recent(int) to authenticated;

-- -------------------------------------------------
-- Overdue task alerts (deduped daily)
-- -------------------------------------------------
create or replace function public.emit_overdue_task_alerts(
  p_days_overdue int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_alerts int := 0;
  v_signal_updates int := 0;
  v_now date := current_date;
  v_rows int := 0;
begin
  if auth.role() = 'authenticated' and not public.nexus_is_staff() then
    raise exception 'staff role required';
  end if;

  for r in
    select
      ct.tenant_id,
      ct.task_id,
      ct.title,
      ct.due_date
    from public.client_tasks ct
    where ct.status = 'pending'
      and ct.due_date < (v_now - greatest(0, p_days_overdue))
  loop
    insert into public.task_alert_events (
      tenant_id,
      task_id,
      alert_type,
      alert_date,
      payload
    )
    values (
      r.tenant_id,
      r.task_id,
      'overdue',
      v_now,
      jsonb_build_object('due_date', r.due_date)
    )
    on conflict (tenant_id, task_id, alert_type, alert_date) do nothing;

    if found then
      v_alerts := v_alerts + 1;

      update public.client_tasks
      set signal = 'red',
          updated_at = now()
      where tenant_id = r.tenant_id
        and task_id = r.task_id
        and signal <> 'red';

      get diagnostics v_rows = row_count;
      v_signal_updates := v_signal_updates + v_rows;

      insert into public.tenant_notifications (
        tenant_id,
        type,
        severity,
        title,
        message,
        meta
      )
      values (
        r.tenant_id,
        'task_overdue',
        'warn',
        'Task overdue',
        format('%s was due on %s. Update status or complete it.', r.title, r.due_date),
        jsonb_build_object('task_id', r.task_id, 'due_date', r.due_date)
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'alerts_created', v_alerts,
    'signals_set_red', v_signal_updates
  );
end $$;

grant execute on function public.emit_overdue_task_alerts(int) to authenticated;

-- -------------------------------------------------
-- updated_at trigger for approval_intel_posts
-- -------------------------------------------------
do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'set_updated_at'
      and pg_function_is_visible(oid)
  ) then
    drop trigger if exists trg_approval_intel_posts_updated_at on public.approval_intel_posts;
    create trigger trg_approval_intel_posts_updated_at
    before update on public.approval_intel_posts
    for each row execute procedure public.set_updated_at();
  end if;
exception
  when undefined_function then
    null;
end $$;
