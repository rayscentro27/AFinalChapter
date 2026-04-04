create extension if not exists pgcrypto;

create or replace function public.nexus_email_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create table if not exists public.email_alias_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  alias_email text not null,
  destination_email text not null,
  category text not null,
  is_active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_alias_rules_category_check
    check (category in (
      'lead_inquiry',
      'client_support',
      'system_alert',
      'report_digest',
      'content_review',
      'founder_decision',
      'formal_notice',
      'internal_ops'
    ))
);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  template_key text not null,
  template_name text not null,
  category text not null,
  subject_template text not null,
  body_template text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_templates_category_check
    check (category in (
      'lead_inquiry',
      'client_support',
      'system_alert',
      'report_digest',
      'content_review',
      'founder_decision',
      'formal_notice',
      'internal_ops'
    ))
);

create table if not exists public.email_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  policy_key text not null,
  policy_value_json jsonb not null default '{}'::jsonb,
  description text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  to_email text not null,
  from_alias text null,
  category text not null,
  subject text not null,
  body text not null,
  status text not null default 'draft',
  requires_review boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz null,
  constraint email_outbox_category_check
    check (category in (
      'lead_inquiry',
      'client_support',
      'system_alert',
      'report_digest',
      'content_review',
      'founder_decision',
      'formal_notice',
      'internal_ops'
    )),
  constraint email_outbox_status_check
    check (status in ('draft', 'queued', 'approved', 'sent', 'failed', 'cancelled'))
);

create unique index if not exists email_alias_rules_alias_email_uidx
  on public.email_alias_rules (alias_email);
create index if not exists email_alias_rules_category_idx
  on public.email_alias_rules (category);
create index if not exists email_alias_rules_active_idx
  on public.email_alias_rules (is_active, category);
create index if not exists email_alias_rules_tenant_idx
  on public.email_alias_rules (tenant_id);

create unique index if not exists email_templates_template_key_uidx
  on public.email_templates (template_key);
create index if not exists email_templates_category_idx
  on public.email_templates (category);
create index if not exists email_templates_active_idx
  on public.email_templates (is_active, category);
create index if not exists email_templates_tenant_idx
  on public.email_templates (tenant_id);

create unique index if not exists email_policies_policy_key_uidx
  on public.email_policies (policy_key);
create index if not exists email_policies_key_idx
  on public.email_policies (policy_key);
create index if not exists email_policies_tenant_idx
  on public.email_policies (tenant_id);

create index if not exists email_outbox_status_idx
  on public.email_outbox (status, created_at desc);
create index if not exists email_outbox_category_idx
  on public.email_outbox (category, created_at desc);
create index if not exists email_outbox_tenant_idx
  on public.email_outbox (tenant_id, created_at desc);
create index if not exists email_outbox_to_email_idx
  on public.email_outbox (lower(to_email));

drop trigger if exists trg_email_alias_rules_set_updated_at on public.email_alias_rules;
create trigger trg_email_alias_rules_set_updated_at
before update on public.email_alias_rules
for each row execute procedure public.nexus_email_set_updated_at();

drop trigger if exists trg_email_templates_set_updated_at on public.email_templates;
create trigger trg_email_templates_set_updated_at
before update on public.email_templates
for each row execute procedure public.nexus_email_set_updated_at();

drop trigger if exists trg_email_policies_set_updated_at on public.email_policies;
create trigger trg_email_policies_set_updated_at
before update on public.email_policies
for each row execute procedure public.nexus_email_set_updated_at();

drop trigger if exists trg_email_outbox_set_updated_at on public.email_outbox;
create trigger trg_email_outbox_set_updated_at
before update on public.email_outbox
for each row execute procedure public.nexus_email_set_updated_at();

alter table public.email_alias_rules enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_policies enable row level security;
alter table public.email_outbox enable row level security;

drop policy if exists email_alias_rules_select on public.email_alias_rules;
create policy email_alias_rules_select
on public.email_alias_rules
for select
using (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_read_tenant(tenant_id))
);

drop policy if exists email_alias_rules_insert on public.email_alias_rules;
create policy email_alias_rules_insert
on public.email_alias_rules
for insert
with check (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
);

drop policy if exists email_alias_rules_update on public.email_alias_rules;
create policy email_alias_rules_update
on public.email_alias_rules
for update
using (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
)
with check (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
);

drop policy if exists email_alias_rules_delete on public.email_alias_rules;
create policy email_alias_rules_delete
on public.email_alias_rules
for delete
using (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
);

drop policy if exists email_templates_select on public.email_templates;
create policy email_templates_select
on public.email_templates
for select
using (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_read_tenant(tenant_id))
);

drop policy if exists email_templates_insert on public.email_templates;
create policy email_templates_insert
on public.email_templates
for insert
with check (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
);

drop policy if exists email_templates_update on public.email_templates;
create policy email_templates_update
on public.email_templates
for update
using (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
)
with check (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
);

drop policy if exists email_templates_delete on public.email_templates;
create policy email_templates_delete
on public.email_templates
for delete
using (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
);

drop policy if exists email_policies_select on public.email_policies;
create policy email_policies_select
on public.email_policies
for select
using (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_read_tenant(tenant_id))
);

drop policy if exists email_policies_insert on public.email_policies;
create policy email_policies_insert
on public.email_policies
for insert
with check (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
);

drop policy if exists email_policies_update on public.email_policies;
create policy email_policies_update
on public.email_policies
for update
using (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
)
with check (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
);

drop policy if exists email_policies_delete on public.email_policies;
create policy email_policies_delete
on public.email_policies
for delete
using (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
);

drop policy if exists email_outbox_select on public.email_outbox;
create policy email_outbox_select
on public.email_outbox
for select
using (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_read_tenant(tenant_id))
);

drop policy if exists email_outbox_insert on public.email_outbox;
create policy email_outbox_insert
on public.email_outbox
for insert
with check (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
);

drop policy if exists email_outbox_update on public.email_outbox;
create policy email_outbox_update
on public.email_outbox
for update
using (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
)
with check (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
);

drop policy if exists email_outbox_delete on public.email_outbox;
create policy email_outbox_delete
on public.email_outbox
for delete
using (
  (tenant_id is null and public.nexus_is_master_admin_compat())
  or (tenant_id is not null and public.nexus_email_can_manage_tenant(tenant_id))
);

grant select, insert, update, delete on public.email_alias_rules to authenticated, service_role;
grant select, insert, update, delete on public.email_templates to authenticated, service_role;
grant select, insert, update, delete on public.email_policies to authenticated, service_role;
grant select, insert, update, delete on public.email_outbox to authenticated, service_role;

insert into public.email_alias_rules (tenant_id, alias_email, destination_email, category, notes)
values
  (null, 'hello@goclearonline.cc', 'goclearonline@gmail.com', 'lead_inquiry', 'Phase 1 alias only. Cloudflare Email Routing forwards to the primary Gmail mailbox.'),
  (null, 'support@goclearonline.cc', 'goclearonline@gmail.com', 'client_support', 'Phase 1 alias only. Cloudflare Email Routing forwards to the primary Gmail mailbox.'),
  (null, 'alerts@goclearonline.cc', 'goclearonline@gmail.com', 'system_alert', 'Phase 1 alias only. Cloudflare Email Routing forwards to the primary Gmail mailbox.'),
  (null, 'reports@goclearonline.cc', 'goclearonline@gmail.com', 'report_digest', 'Phase 1 alias only. Cloudflare Email Routing forwards to the primary Gmail mailbox.'),
  (null, 'media@goclearonline.cc', 'goclearonline@gmail.com', 'content_review', 'Phase 1 alias only. Cloudflare Email Routing forwards to the primary Gmail mailbox.')
on conflict (alias_email) do update set
  tenant_id = excluded.tenant_id,
  destination_email = excluded.destination_email,
  category = excluded.category,
  is_active = true,
  notes = excluded.notes,
  updated_at = now();

insert into public.email_policies (tenant_id, policy_key, policy_value_json, description)
values
  (null, 'email_phase', jsonb_build_object('value', 'phase_1'), 'Marks the first live Nexus email policy phase.'),
  (null, 'allow_auto_send_external', to_jsonb(false), 'External client email sends remain human-reviewed only.'),
  (null, 'require_review_external', to_jsonb(true), 'External outbound email requires human review before sending.'),
  (null, 'email_separate_from_unified_inbox', to_jsonb(true), 'Email remains separate from the live UnifiedInbox in Phase 1.'),
  (null, 'founder_direct_email', jsonb_build_object('value', 'goclearonline@gmail.com'), 'Primary direct founder mailbox.'),
  (null, 'default_destination_email', jsonb_build_object('value', 'goclearonline@gmail.com'), 'Fallback destination mailbox for all aliases.')
on conflict (policy_key) do update set
  tenant_id = excluded.tenant_id,
  policy_value_json = excluded.policy_value_json,
  description = excluded.description,
  updated_at = now();

insert into public.email_templates (tenant_id, template_key, template_name, category, subject_template, body_template)
values
  (null, 'daily_founder_summary', 'Daily Founder Summary', 'report_digest', 'Nexus Daily Founder Summary - {{date}}', 'Summary:\n{{summary}}\n\nTop Alerts:\n{{alerts}}\n\nNext Actions:\n{{actions}}'),
  (null, 'system_alert', 'System Alert', 'system_alert', 'Nexus System Alert: {{title}}', 'Alert:\n{{message}}'),
  (null, 'content_review_request', 'Content Review Request', 'content_review', 'Content Review Needed: {{title}}', 'Please review the following item:\n{{details}}'),
  (null, 'report_digest', 'Report Digest', 'report_digest', 'Nexus Report Digest - {{date}}', 'Digest:\n{{digest}}'),
  (null, 'approval_needed', 'Approval Needed', 'founder_decision', 'Approval Needed: {{subject}}', 'Please review and approve:\n{{details}}')
on conflict (template_key) do update set
  tenant_id = excluded.tenant_id,
  template_name = excluded.template_name,
  category = excluded.category,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  is_active = true,
  updated_at = now();
