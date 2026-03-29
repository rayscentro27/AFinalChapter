-- Prompt 6: Versioned policy documents + consent linkage
-- Enables stable policy IDs/hashes, super-admin publishing, and policy-version consent proof.

create extension if not exists pgcrypto;
create or replace function public.nexus_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
create table if not exists public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  is_active boolean not null default true,
  require_reaccept_on_publish boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.policy_documents(id) on delete cascade,
  version text not null,
  content_md text not null,
  content_hash text not null,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);
create index if not exists policy_versions_document_idx
  on public.policy_versions (document_id, created_at desc);
create index if not exists policy_versions_published_idx
  on public.policy_versions (document_id, published_at desc)
  where is_published = true;
create unique index if not exists policy_versions_single_published_per_doc_uidx
  on public.policy_versions (document_id)
  where is_published = true;
create or replace function public.nexus_set_policy_content_hash()
returns trigger
language plpgsql
as $fn$
begin
  new.content_hash = encode(extensions.digest(coalesce(new.content_md, ''), 'sha256'), 'hex');
  return new;
end;
$fn$;
drop trigger if exists trg_policy_documents_set_updated_at on public.policy_documents;
create trigger trg_policy_documents_set_updated_at
before update on public.policy_documents
for each row execute procedure public.nexus_set_updated_at();
drop trigger if exists trg_policy_versions_set_content_hash on public.policy_versions;
create trigger trg_policy_versions_set_content_hash
before insert or update of content_md on public.policy_versions
for each row execute procedure public.nexus_set_policy_content_hash();
alter table public.policy_documents enable row level security;
alter table public.policy_versions enable row level security;
drop policy if exists policy_documents_select_active on public.policy_documents;
create policy policy_documents_select_active
on public.policy_documents
for select to authenticated
using (is_active = true);
drop policy if exists policy_documents_select_super_admin_all on public.policy_documents;
create policy policy_documents_select_super_admin_all
on public.policy_documents
for select to authenticated
using (public.nexus_is_master_admin_compat());
drop policy if exists policy_documents_super_admin_insert on public.policy_documents;
create policy policy_documents_super_admin_insert
on public.policy_documents
for insert to authenticated
with check (public.nexus_is_master_admin_compat());
drop policy if exists policy_documents_super_admin_update on public.policy_documents;
create policy policy_documents_super_admin_update
on public.policy_documents
for update to authenticated
using (public.nexus_is_master_admin_compat())
with check (public.nexus_is_master_admin_compat());
drop policy if exists policy_documents_super_admin_delete on public.policy_documents;
create policy policy_documents_super_admin_delete
on public.policy_documents
for delete to authenticated
using (public.nexus_is_master_admin_compat());
drop policy if exists policy_versions_select_published on public.policy_versions;
create policy policy_versions_select_published
on public.policy_versions
for select to authenticated
using (
  is_published = true
  and exists (
    select 1
    from public.policy_documents pd
    where pd.id = policy_versions.document_id
      and pd.is_active = true
  )
);
drop policy if exists policy_versions_select_super_admin_all on public.policy_versions;
create policy policy_versions_select_super_admin_all
on public.policy_versions
for select to authenticated
using (public.nexus_is_master_admin_compat());
drop policy if exists policy_versions_super_admin_insert on public.policy_versions;
create policy policy_versions_super_admin_insert
on public.policy_versions
for insert to authenticated
with check (public.nexus_is_master_admin_compat());
drop policy if exists policy_versions_super_admin_update on public.policy_versions;
create policy policy_versions_super_admin_update
on public.policy_versions
for update to authenticated
using (public.nexus_is_master_admin_compat())
with check (public.nexus_is_master_admin_compat());
drop policy if exists policy_versions_super_admin_delete on public.policy_versions;
create policy policy_versions_super_admin_delete
on public.policy_versions
for delete to authenticated
using (public.nexus_is_master_admin_compat());
grant select on table public.policy_documents to authenticated, service_role;
grant insert, update, delete on table public.policy_documents to authenticated, service_role;
grant select on table public.policy_versions to authenticated, service_role;
grant insert, update, delete on table public.policy_versions to authenticated, service_role;
insert into public.policy_documents (key, title, require_reaccept_on_publish)
values
  ('terms', 'Terms of Service', true),
  ('privacy', 'Privacy Policy', true),
  ('ai_disclosure', 'AI Disclosure', true),
  ('disclaimers', 'Required Disclaimers', true),
  ('refund_policy', 'Refund Policy', false),
  ('sms_terms', 'SMS Terms', false),
  ('commission_disclosure', 'Commission Disclosure', false),
  ('docupost_mailing_auth', 'DocuPost Mailing Authorization', false),
  ('membership_agreement', 'Membership Agreement', false)
on conflict (key) do update
set
  title = excluded.title,
  updated_at = now();
with seed_versions as (
  select *
  from (
    values
      (
        'terms',
        'v1',
        $$## Educational Platform Scope
[Company Name] provides educational resources, templates, and workflow tools. The platform does not provide legal, tax, accounting, investment, or lending decisions and does not guarantee specific outcomes.

## No Guarantees
Outcomes vary by user, lender, program criteria, and market conditions. There are no promises of approvals, funding, deletions, awards, or timeline commitments.

## User Responsibilities
You are responsible for the accuracy of submitted information, document integrity, and lawful use of the platform.

## Communications
Transactional email communications are required for account and workflow operations. Marketing communications are optional where offered.

## Limitation of Liability
[Company Name] is not liable for lender or third-party decisions, delays, denials, or external service outages.$$::text
      ),
      (
        'privacy',
        'v1',
        $$## Data We Process
Account profile data, workflow records, communication preferences, and uploaded materials needed to deliver service.

## How Data Is Used
Data is used to operate your workspace, generate educational outputs, improve reliability, maintain security, and comply with legal obligations.

## Data Sharing
Data may be shared with infrastructure providers and integrated services strictly as needed to run requested platform functionality.

## Retention and Deletion
Data is retained based on service and compliance needs. You may request account deletion per policy and legal requirements.

## Contact
Privacy requests and concerns can be directed to [Support Email].$$::text
      ),
      (
        'ai_disclosure',
        'v1',
        $$## AI Assistance Notice
The platform uses AI to generate drafts, summaries, and recommendations. AI output may be incomplete or incorrect and requires human review.

## Human Review Requirement
You are responsible for verifying all generated content before submission or action.

## Regulated Advice Exclusion
AI output is educational and operational support only; it is not legal, tax, accounting, or investment advice.$$::text
      ),
      (
        'disclaimers',
        'v1',
        $$- General: [Company Name] provides educational content and workflow tools only. We are not a law firm, accounting firm, or financial advisory firm. No guarantees of outcomes are made.
- Credit repair: We provide FCRA education and documentation templates. We are not a CROA credit repair organization and do not promise deletion of any item.
- Funding: Lender decisions are made solely by lenders. No approval or funding amount is guaranteed.
- Investment: Educational material only. Nothing is investment advice or a recommendation to buy, sell, or hold securities.
- Legal and tax: Consult licensed legal and tax professionals for advice specific to your situation.
- Grants and SBA: Eligibility and awards are determined by program administrators and lenders. No grant or SBA outcome is guaranteed.$$::text
      ),
      (
        'refund_policy',
        'v1',
        $$## Membership and Service Fees
Subscription fees are for platform access and operational support features provided during the billing period.

## No Performance-Based Refunds
Refunds are not based on credit outcomes, funding outcomes, grant outcomes, or timeline outcomes.

## Cancellation
You may cancel recurring plans to stop future renewals. Access remains active through the current billing period unless otherwise stated.

## Support
For billing support, contact [Support Email].$$::text
      ),
      (
        'sms_terms',
        'v1',
        $$## Message Scope
SMS notifications may include account updates, task reminders, billing alerts, and optional marketing content depending on preferences.

## Frequency and Carrier Charges
Message frequency varies. Message and data rates may apply based on your carrier plan.

## STOP and HELP
Reply STOP to opt out of SMS messages. Reply HELP for support instructions.

## No Purchase Required
SMS consent is optional and not required to purchase any service.

## Privacy Link
See the Privacy Policy for data use details.$$::text
      ),
      (
        'commission_disclosure',
        'v1',
        $$## Commission Disclosure
When enabled in PREMIUM funding workflows, [Company Name] may charge a 10% commission on funding secured through supported workflow pathways.

## Educational Scope
The platform provides educational templates and workflow tools. You submit applications directly to lenders and third-party providers.

## No Funding Guarantee
Funding decisions are made by lenders. Approval, amount, and timing are not guaranteed.$$::text
      ),
      (
        'docupost_mailing_auth',
        'v1',
        $$## Authorization Scope
You authorize Nexus to queue your approved dispute packet for physical mailing through DocuPost as a third-party mailing provider.

## Educational-Only Positioning
Dispute templates and workflows are educational tools only. Mailing support does not guarantee outcomes.

## PII Handling
You acknowledge the mailing package contains personal information needed for delivery. Data is shared only as required to complete print-and-mail processing.$$::text
      ),
      (
        'membership_agreement',
        'v1',
        $$## Auto-Renew and Cancellation
Paid memberships auto-renew each billing cycle until canceled. You may cancel anytime to prevent future renewal.

## Educational Scope and No Guarantees
Services provide educational templates, workflow tools, and process support. Results vary and no funding, credit, grant, or investment outcome is guaranteed.

## Refund Position
Refunds are not performance-based and are evaluated under the published refund policy.

## Limitation of Liability
Liability is limited to fees paid for the relevant period to the extent allowed by law. External third-party decisions and system dependencies are outside guaranteed control.$$::text
      )
  ) as x(policy_key, version, content_md)
)
insert into public.policy_versions (document_id, version, content_md, content_hash, is_published, published_at, created_at)
select
  pd.id,
  sv.version,
  sv.content_md,
  encode(extensions.digest(sv.content_md, 'sha256'), 'hex'),
  true,
  now(),
  now()
from seed_versions sv
join public.policy_documents pd
  on pd.key = sv.policy_key
where not exists (
  select 1
  from public.policy_versions pv
  where pv.document_id = pd.id
    and pv.is_published = true
);
alter table public.consents
  add column if not exists policy_version_id uuid references public.policy_versions(id) on delete set null;
create index if not exists consents_policy_version_idx
  on public.consents (policy_version_id);
with mapped_versions as (
  select
    c.id as consent_id,
    pv.id as policy_version_id,
    pv.version as policy_version,
    pv.content_hash as policy_hash
  from public.consents c
  join public.policy_documents pd
    on pd.key = c.consent_type::text
  join public.policy_versions pv
    on pv.document_id = pd.id
   and pv.version = c.version
  where c.policy_version_id is null
)
update public.consents c
set
  policy_version_id = mv.policy_version_id,
  metadata = coalesce(c.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'policy_version_id', mv.policy_version_id,
      'policy_version', mv.policy_version,
      'policy_hash', mv.policy_hash
    )
from mapped_versions mv
where c.id = mv.consent_id;
update public.consent_requirements cr
set
  current_version = pv.version,
  updated_at = now()
from public.policy_documents pd
join public.policy_versions pv
  on pv.document_id = pd.id
 and pv.is_published = true
where pd.key = cr.consent_type::text
  and cr.consent_type in ('terms', 'privacy', 'ai_disclosure', 'disclaimers');
create or replace function public.admin_publish_policy_version(
  p_policy_key text,
  p_version text
)
returns table (
  policy_version_id uuid,
  policy_key text,
  version text,
  content_hash text,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_doc_id uuid;
  v_require_reaccept boolean := false;
  v_row public.policy_versions%rowtype;
  v_consent_type public.consent_type;
begin
  if not public.nexus_is_master_admin_compat() then
    raise exception 'super admin access required';
  end if;

  select pd.id, pd.require_reaccept_on_publish
    into v_doc_id, v_require_reaccept
  from public.policy_documents pd
  where pd.key = p_policy_key
    and pd.is_active = true
  limit 1;

  if v_doc_id is null then
    raise exception 'policy document not found for key=%', p_policy_key;
  end if;

  update public.policy_versions
  set is_published = false
  where document_id = v_doc_id
    and is_published = true;

  update public.policy_versions
  set
    is_published = true,
    published_at = now(),
    published_by = auth.uid()
  where document_id = v_doc_id
    and version = p_version
  returning * into v_row;

  if v_row.id is null then
    raise exception 'policy version not found for key=% version=%', p_policy_key, p_version;
  end if;

  if v_require_reaccept then
    v_consent_type := null;

    if p_policy_key = 'terms' then
      v_consent_type := 'terms';
    elsif p_policy_key = 'privacy' then
      v_consent_type := 'privacy';
    elsif p_policy_key = 'ai_disclosure' then
      v_consent_type := 'ai_disclosure';
    elsif p_policy_key = 'disclaimers' then
      v_consent_type := 'disclaimers';
    end if;

    if v_consent_type is not null then
      update public.consent_requirements
      set
        current_version = v_row.version,
        updated_by_user_id = auth.uid(),
        updated_at = now()
      where consent_type = v_consent_type;
    end if;
  end if;

  return query
  select v_row.id, p_policy_key, v_row.version, v_row.content_hash, v_row.published_at;
end;
$fn$;
grant execute on function public.admin_publish_policy_version(text, text) to authenticated;
create or replace view public.user_consent_status as
with cfg as (
  select
    coalesce((select current_version from public.consent_requirements where consent_type = 'terms'), 'v1') as terms_version,
    coalesce((select current_version from public.consent_requirements where consent_type = 'privacy'), 'v1') as privacy_version,
    coalesce((select current_version from public.consent_requirements where consent_type = 'ai_disclosure'), 'v1') as ai_disclosure_version,
    coalesce((select current_version from public.consent_requirements where consent_type = 'disclaimers'), 'v1') as disclaimers_version,
    coalesce((select current_version from public.consent_requirements where consent_type = 'comms_email'), 'v1') as comms_email_version
),
policy_cfg as (
  select
    max(case when pd.key = 'terms' then pv.id::text else null end)::uuid as terms_policy_version_id,
    max(case when pd.key = 'privacy' then pv.id::text else null end)::uuid as privacy_policy_version_id,
    max(case when pd.key = 'ai_disclosure' then pv.id::text else null end)::uuid as ai_disclosure_policy_version_id,
    max(case when pd.key = 'disclaimers' then pv.id::text else null end)::uuid as disclaimers_policy_version_id
  from public.policy_documents pd
  left join public.policy_versions pv
    on pv.document_id = pd.id
   and pv.is_published = true
  where pd.key in ('terms', 'privacy', 'ai_disclosure', 'disclaimers')
),
latest as (
  select
    c.user_id,
    c.tenant_id,
    c.consent_type,
    c.version,
    c.policy_version_id,
    c.accepted_at,
    row_number() over (
      partition by c.user_id, c.consent_type
      order by c.accepted_at desc, c.created_at desc
    ) as rn
  from public.consents c
),
users as (
  select distinct u.user_id
  from public.nexus_all_known_user_ids() u
  where u.user_id is not null
),
required as (
  select
    cr.consent_type,
    cr.current_version,
    case cr.consent_type
      when 'terms' then pc.terms_policy_version_id
      when 'privacy' then pc.privacy_policy_version_id
      when 'ai_disclosure' then pc.ai_disclosure_policy_version_id
      when 'disclaimers' then pc.disclaimers_policy_version_id
      else null
    end as required_policy_version_id
  from public.consent_requirements cr
  cross join policy_cfg pc
  where cr.is_required = true
)
select
  u.user_id,
  nullif(max(l.tenant_id::text), '')::uuid as tenant_id,
  coalesce(bool_or(
    l.consent_type = 'terms'
    and l.rn = 1
    and (
      (pc.terms_policy_version_id is not null and l.policy_version_id = pc.terms_policy_version_id)
      or (pc.terms_policy_version_id is null and l.version = cfg.terms_version)
    )
  ), false) as terms_accepted,
  coalesce(bool_or(
    l.consent_type = 'privacy'
    and l.rn = 1
    and (
      (pc.privacy_policy_version_id is not null and l.policy_version_id = pc.privacy_policy_version_id)
      or (pc.privacy_policy_version_id is null and l.version = cfg.privacy_version)
    )
  ), false) as privacy_accepted,
  coalesce(bool_or(
    l.consent_type = 'ai_disclosure'
    and l.rn = 1
    and (
      (pc.ai_disclosure_policy_version_id is not null and l.policy_version_id = pc.ai_disclosure_policy_version_id)
      or (pc.ai_disclosure_policy_version_id is null and l.version = cfg.ai_disclosure_version)
    )
  ), false) as ai_disclosure_accepted,
  coalesce(bool_or(
    l.consent_type = 'disclaimers'
    and l.rn = 1
    and (
      (pc.disclaimers_policy_version_id is not null and l.policy_version_id = pc.disclaimers_policy_version_id)
      or (pc.disclaimers_policy_version_id is null and l.version = cfg.disclaimers_version)
    )
  ), false) as disclaimers_accepted,
  coalesce(bool_or(l.consent_type = 'comms_email' and l.version = cfg.comms_email_version and l.rn = 1), false) as comms_email_accepted,
  case
    when exists (select 1 from required) then
      not exists (
        select 1
        from required r
        where not exists (
          select 1
          from latest rl
          where rl.user_id = u.user_id
            and rl.consent_type = r.consent_type
            and rl.rn = 1
            and (
              (r.required_policy_version_id is not null and rl.policy_version_id = r.required_policy_version_id)
              or (r.required_policy_version_id is null and rl.version = r.current_version)
            )
        )
      )
    else false
  end as has_required_consents,
  max(l.accepted_at) as last_accepted_at
from users u
left join latest l on l.user_id = u.user_id
cross join cfg
cross join policy_cfg pc
group by
  u.user_id,
  cfg.terms_version,
  cfg.privacy_version,
  cfg.ai_disclosure_version,
  cfg.disclaimers_version,
  cfg.comms_email_version,
  pc.terms_policy_version_id,
  pc.privacy_policy_version_id,
  pc.ai_disclosure_policy_version_id,
  pc.disclaimers_policy_version_id;
grant select on public.user_consent_status to authenticated;
