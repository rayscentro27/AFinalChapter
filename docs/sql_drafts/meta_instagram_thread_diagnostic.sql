-- Meta / Instagram thread diagnostic
-- Fill in the tenant and conversation UUIDs, then run each query block in Supabase SQL editor.
--
-- Expected for a healthy Instagram reply path:
-- - conversation_participants.external_user_id = Instagram sender ID
-- - conversation_participants.external_page_id = Page ID or IG object ID used by the channel
-- - contact_identities has a provider = 'meta' row with identity_type = 'igsid'
-- - outbox_messages.to_address matches the Instagram sender ID
-- - outbox_messages.from_address matches the Meta channel external_account_id

with params as (
  select
    '<tenant_uuid>'::uuid as tenant_id,
    '<conversation_uuid>'::uuid as conversation_id
)
select
  t.name as tenant_name,
  c.id as conversation_id,
  c.provider as conversation_provider,
  c.channel_account_id,
  ca.provider as channel_provider,
  ca.external_account_id as channel_external_account_id,
  ca.label as channel_label,
  cp.external_user_id as meta_external_user_id,
  cp.external_page_id as meta_external_page_id,
  ct.id as contact_id,
  ct.display_name as contact_name,
  ct.fb_psid as contact_fb_psid,
  (
    select jsonb_agg(
      jsonb_build_object(
        'identity_type', ci.identity_type,
        'identity_value', ci.identity_value,
        'channel_account_id', ci.channel_account_id,
        'verified', ci.verified,
        'is_primary', ci.is_primary,
        'confidence', ci.confidence
      )
      order by ci.created_at desc
    )
    from public.contact_identities ci
    where ci.tenant_id = p.tenant_id
      and ci.contact_id = ct.id
      and ci.provider = 'meta'
  ) as meta_identities
from params p
join public.tenants t
  on t.id = p.tenant_id
join public.conversations c
  on c.id = p.conversation_id
 and c.tenant_id = p.tenant_id
left join public.channel_accounts ca
  on ca.id = c.channel_account_id
left join public.conversation_participants cp
  on cp.tenant_id = p.tenant_id
 and cp.conversation_id = c.id
 and cp.provider = 'meta'
left join public.contacts ct
  on ct.id = c.contact_id;

-- Latest messages for the thread
with params as (
  select
    '<tenant_uuid>'::uuid as tenant_id,
    '<conversation_uuid>'::uuid as conversation_id
)
select
  m.id,
  m.direction,
  m.provider,
  m.provider_message_id,
  m.provider_message_id_real,
  m.from_id,
  m.to_id,
  m.status,
  m.body,
  m.created_at,
  m.received_at
from public.messages m
join params p
  on m.tenant_id = p.tenant_id
 and m.conversation_id = p.conversation_id
order by coalesce(m.received_at, m.created_at) desc
limit 20;

-- Outbox attempts for the same conversation
with params as (
  select
    '<tenant_uuid>'::uuid as tenant_id,
    '<conversation_uuid>'::uuid as conversation_id
)
select
  o.id,
  o.provider,
  o.status,
  o.attempts,
  o.to_address,
  o.from_address,
  o.provider_message_id,
  o.next_attempt_at,
  o.last_error,
  o.body_text,
  o.created_at,
  o.updated_at
from public.outbox_messages o
join params p
  on o.tenant_id = p.tenant_id
 and o.conversation_id = p.conversation_id
order by o.created_at desc;
