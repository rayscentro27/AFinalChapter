-- Prompt 6: finalized legal docs with versioning + admin publishing

create extension if not exists pgcrypto;
create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  doc_key text not null,
  version text not null,
  title text not null,
  subtitle text,
  markdown_body text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_active boolean not null default false,
  created_by_user_id uuid references auth.users(id) on delete set null,
  published_by_user_id uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doc_key, version)
);
create unique index if not exists legal_documents_active_doc_key_uidx
  on public.legal_documents (doc_key)
  where is_active = true;
create table if not exists public.consent_requirements (
  consent_type public.consent_type primary key,
  current_version text not null,
  is_required boolean not null default false,
  description text,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create or replace function public.nexus_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
drop trigger if exists trg_legal_documents_set_updated_at on public.legal_documents;
create trigger trg_legal_documents_set_updated_at
before update on public.legal_documents
for each row execute procedure public.nexus_set_updated_at();
drop trigger if exists trg_consent_requirements_set_updated_at on public.consent_requirements;
create trigger trg_consent_requirements_set_updated_at
before update on public.consent_requirements
for each row execute procedure public.nexus_set_updated_at();
alter table public.legal_documents enable row level security;
alter table public.consent_requirements enable row level security;
DROP POLICY IF EXISTS legal_documents_select_published ON public.legal_documents;
create policy legal_documents_select_published
on public.legal_documents
for select to anon, authenticated
using (status = 'published' and is_active = true);
DROP POLICY IF EXISTS legal_documents_select_admin_all ON public.legal_documents;
create policy legal_documents_select_admin_all
on public.legal_documents
for select to authenticated
using (public.nexus_is_master_admin_compat());
DROP POLICY IF EXISTS legal_documents_admin_insert ON public.legal_documents;
create policy legal_documents_admin_insert
on public.legal_documents
for insert to authenticated
with check (public.nexus_is_master_admin_compat());
DROP POLICY IF EXISTS legal_documents_admin_update ON public.legal_documents;
create policy legal_documents_admin_update
on public.legal_documents
for update to authenticated
using (public.nexus_is_master_admin_compat())
with check (public.nexus_is_master_admin_compat());
DROP POLICY IF EXISTS legal_documents_admin_delete ON public.legal_documents;
create policy legal_documents_admin_delete
on public.legal_documents
for delete to authenticated
using (public.nexus_is_master_admin_compat());
DROP POLICY IF EXISTS consent_requirements_select_all ON public.consent_requirements;
create policy consent_requirements_select_all
on public.consent_requirements
for select to anon, authenticated
using (true);
DROP POLICY IF EXISTS consent_requirements_admin_write ON public.consent_requirements;
create policy consent_requirements_admin_write
on public.consent_requirements
for all to authenticated
using (public.nexus_is_master_admin_compat())
with check (public.nexus_is_master_admin_compat());
grant usage on schema public to anon, authenticated, service_role;
grant select on table public.legal_documents to anon, authenticated, service_role;
grant insert, update, delete on table public.legal_documents to authenticated, service_role;
grant select on table public.consent_requirements to anon, authenticated, service_role;
grant insert, update, delete on table public.consent_requirements to authenticated, service_role;
insert into public.consent_requirements (consent_type, current_version, is_required, description)
values
  ('terms', 'v1', true, 'Terms of Service acceptance required for workspace access.'),
  ('privacy', 'v1', true, 'Privacy Policy acceptance required for workspace access.'),
  ('ai_disclosure', 'v1', true, 'AI Disclosure acceptance required for workspace access.'),
  ('disclaimers', 'v1', true, 'Educational disclaimers acceptance required for workspace access.'),
  ('comms_email', 'v1', true, 'Transactional email communications consent required for workspace access.'),
  ('docupost_mailing_auth', 'v1', false, 'Client mailing authorization for dispute package mailing.'),
  ('commission_disclosure', 'v1', false, 'Funding commission disclosure acceptance.'),
  ('sms_opt_in', 'v1', false, 'SMS opt-in consent.'),
  ('sms_opt_out', 'v1', false, 'SMS opt-out record.')
on conflict (consent_type) do nothing;
insert into public.legal_documents (doc_key, version, title, subtitle, markdown_body, status, is_active)
values
  (
    'terms',
    'v1',
    'Terms of Service',
    'These terms govern platform access and educational workflow usage.',
    $$## Educational Platform Scope
[Company Name] provides educational resources, templates, and workflow tools. The platform does not provide legal, tax, accounting, investment, or lending decisions and does not guarantee specific outcomes.

## No Guarantees
Outcomes vary by user, lender, program criteria, and market conditions. There are no promises of approvals, funding, deletions, awards, or timeline commitments.

## User Responsibilities
You are responsible for the accuracy of submitted information, document integrity, and lawful use of the platform.

## Communications
Transactional email communications are required for account and workflow operations. Marketing communications are optional where offered.

## Limitation of Liability
[Company Name] is not liable for lender or third-party decisions, delays, denials, or external service outages.$$,
    'published',
    false
  ),
  (
    'privacy',
    'v1',
    'Privacy Policy',
    'How platform data is processed, protected, and used for service delivery.',
    $$## Data We Process
Account profile data, workflow records, communication preferences, and uploaded materials needed to deliver service.

## How Data Is Used
Data is used to operate your workspace, generate educational outputs, improve reliability, maintain security, and comply with legal obligations.

## Data Sharing
Data may be shared with infrastructure providers and integrated services strictly as needed to run requested platform functionality.

## Retention and Deletion
Data is retained based on service and compliance needs. You may request account deletion per policy and legal requirements.

## Contact
Privacy requests and concerns can be directed to [Support Email].$$,
    'published',
    false
  ),
  (
    'ai_disclosure',
    'v1',
    'AI Disclosure',
    'Important information on how AI-generated output should be interpreted and reviewed.',
    $$## AI Assistance Notice
The platform uses AI to generate drafts, summaries, and recommendations. AI output may be incomplete or incorrect and requires human review.

## Human Review Requirement
You are responsible for verifying all generated content before submission or action.

## Regulated Advice Exclusion
AI output is educational and operational support only; it is not legal, tax, accounting, or investment advice.$$,
    'published',
    false
  ),
  (
    'disclaimers',
    'v1',
    'Required Disclaimers',
    'Educational-use and compliance disclaimers applicable across platform workflows.',
    $$- General: [Company Name] provides educational content and workflow tools only. We are not a law firm, accounting firm, or financial advisory firm. No guarantees of outcomes are made.
- Credit repair: We provide FCRA education and documentation templates. We are not a CROA credit repair organization and do not promise deletion of any item.
- Funding: Lender decisions are made solely by lenders. No approval or funding amount is guaranteed.
- Investment: Educational material only. Nothing is investment advice or a recommendation to buy, sell, or hold securities.
- Legal and tax: Consult licensed legal and tax professionals for advice specific to your situation.
- Grants and SBA: Eligibility and awards are determined by program administrators and lenders. No grant or SBA outcome is guaranteed.$$,
    'published',
    false
  ),
  (
    'refund_policy',
    'v1',
    'Refund Policy',
    'Billing and cancellation policy for platform access and membership services.',
    $$## Membership and Service Fees
Subscription fees are for platform access and operational support features provided during the billing period.

## No Performance-Based Refunds
Refunds are not based on credit outcomes, funding outcomes, grant outcomes, or timeline outcomes.

## Cancellation
You may cancel recurring plans to stop future renewals. Access remains active through the current billing period unless otherwise stated.

## Support
For billing support, contact [Support Email].$$,
    'published',
    false
  ),
  (
    'membership_agreement',
    'v1',
    'Membership Agreement',
    'Paid membership terms for FREE, GROWTH, and PREMIUM tiers.',
    $$## Auto-Renew and Cancellation
Paid memberships auto-renew each billing cycle until canceled. You may cancel anytime to prevent future renewal.

## Educational Scope and No Guarantees
Services provide educational templates, workflow tools, and process support. Results vary and no funding, credit, grant, or investment outcome is guaranteed.

## Refund Position
Refunds are not performance-based and are evaluated under the published refund policy.

## Limitation of Liability
Liability is limited to fees paid for the relevant period to the extent allowed by law. External third-party decisions and system dependencies are outside guaranteed control.$$,
    'published',
    false
  ),
  (
    'sms_terms',
    'v1',
    'SMS Terms',
    'Message consent, frequency, and opt-out/help handling for Nexus SMS notifications.',
    $$## Message Scope
SMS notifications may include account updates, task reminders, billing alerts, and optional marketing content depending on preferences.

## Frequency and Carrier Charges
Message frequency varies. Message and data rates may apply based on your carrier plan.

## STOP and HELP
Reply STOP to opt out of SMS messages. Reply HELP for support instructions.

## No Purchase Required
SMS consent is optional and not required to purchase any service.

## Privacy Link
See the Privacy Policy for data use details.$$,
    'published',
    false
  ),
  (
    'mailing_authorization',
    'v1',
    'Mailing Authorization',
    'Client authorization required before any dispute package is queued for physical mailing.',
    $$## Authorization Scope
You authorize Nexus to prepare and queue your approved dispute package for mailing through supported mailing workflows. No package is mailed until you explicitly approve the specific package details.

## No Guarantees
Mailing a dispute package does not guarantee removal, correction, lender action, or timeline outcomes.$$,
    'published',
    false
  )
on conflict (doc_key, version) do update
set
  title = excluded.title,
  subtitle = excluded.subtitle,
  markdown_body = excluded.markdown_body,
  status = excluded.status,
  updated_at = now();
-- Set initial active versions only when none exist for a given doc_key.
update public.legal_documents ld
set
  is_active = true,
  status = 'published',
  published_at = coalesce(ld.published_at, now())
where ld.doc_key in (
  'terms',
  'privacy',
  'ai_disclosure',
  'disclaimers',
  'refund_policy',
  'membership_agreement',
  'sms_terms',
  'mailing_authorization'
)
and ld.version = 'v1'
and not exists (
  select 1
  from public.legal_documents x
  where x.doc_key = ld.doc_key
    and x.is_active = true
);
create or replace function public.admin_publish_legal_document(
  p_doc_key text,
  p_version text
)
returns table (
  id uuid,
  doc_key text,
  version text,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  doc_row public.legal_documents%rowtype;
begin
  if not public.nexus_is_master_admin_compat() then
    raise exception 'super admin access required';
  end if;

  update public.legal_documents
  set is_active = false
  where doc_key = p_doc_key;

  update public.legal_documents
  set
    status = 'published',
    is_active = true,
    published_at = now(),
    published_by_user_id = auth.uid()
  where doc_key = p_doc_key
    and version = p_version
  returning * into doc_row;

  if doc_row.id is null then
    raise exception 'legal document not found for key=% version=%', p_doc_key, p_version;
  end if;

  if p_doc_key in ('terms', 'privacy', 'ai_disclosure', 'disclaimers') then
    update public.consent_requirements
    set
      current_version = p_version,
      updated_by_user_id = auth.uid(),
      updated_at = now()
    where consent_type = p_doc_key::public.consent_type;
  end if;

  return query
  select doc_row.id, doc_row.doc_key, doc_row.version, doc_row.published_at;
end;
$fn$;
grant execute on function public.admin_publish_legal_document(text, text) to authenticated;
create or replace view public.user_consent_status as
with cfg as (
  select
    coalesce((select current_version from public.consent_requirements where consent_type = 'terms'), 'v1') as terms_version,
    coalesce((select current_version from public.consent_requirements where consent_type = 'privacy'), 'v1') as privacy_version,
    coalesce((select current_version from public.consent_requirements where consent_type = 'ai_disclosure'), 'v1') as ai_disclosure_version,
    coalesce((select current_version from public.consent_requirements where consent_type = 'disclaimers'), 'v1') as disclaimers_version,
    coalesce((select current_version from public.consent_requirements where consent_type = 'comms_email'), 'v1') as comms_email_version
),
latest as (
  select
    c.user_id,
    c.tenant_id,
    c.consent_type,
    c.version,
    c.accepted_at,
    row_number() over (
      partition by c.user_id, c.consent_type
      order by c.accepted_at desc, c.created_at desc
    ) as rn
  from public.consents c
),
users as (
  select distinct c.user_id
  from public.consents c
),
required as (
  select cr.consent_type, cr.current_version
  from public.consent_requirements cr
  where cr.is_required = true
)
select
  u.user_id,
  nullif(max(l.tenant_id::text), '')::uuid as tenant_id,
  bool_or(l.consent_type = 'terms' and l.version = cfg.terms_version and l.rn = 1) as terms_accepted,
  bool_or(l.consent_type = 'privacy' and l.version = cfg.privacy_version and l.rn = 1) as privacy_accepted,
  bool_or(l.consent_type = 'ai_disclosure' and l.version = cfg.ai_disclosure_version and l.rn = 1) as ai_disclosure_accepted,
  bool_or(l.consent_type = 'disclaimers' and l.version = cfg.disclaimers_version and l.rn = 1) as disclaimers_accepted,
  bool_or(l.consent_type = 'comms_email' and l.version = cfg.comms_email_version and l.rn = 1) as comms_email_accepted,
  not exists (
    select 1
    from required r
    where not exists (
      select 1
      from latest rl
      where rl.user_id = u.user_id
        and rl.consent_type = r.consent_type
        and rl.version = r.current_version
        and rl.rn = 1
    )
  ) as has_required_consents,
  coalesce(max(l.accepted_at), now()) as last_accepted_at
from users u
left join latest l on l.user_id = u.user_id
cross join cfg
group by
  u.user_id,
  cfg.terms_version,
  cfg.privacy_version,
  cfg.ai_disclosure_version,
  cfg.disclaimers_version,
  cfg.comms_email_version;
grant select on public.user_consent_status to authenticated;
