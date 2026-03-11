-- Patch migration to align with bundle schema v1.0 deliverable fields.

alter table public.training_modules
  add column if not exists risk_profile jsonb not null default '{}'::jsonb,
  add column if not exists cri_defaults jsonb not null default '{}'::jsonb;

alter table public.cri_routing
  add column if not exists schema_version text;

update public.cri_routing
set schema_version = coalesce(nullif(schema_version, ''), '1.0');

-- Ensure default singleton exists with schema version.
insert into public.cri_routing (singleton_key, schema_version, cri_tiers, tier_defaults, global_safeguards)
values (
  'default',
  '1.0',
  '{}'::jsonb,
  '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('code', 'SAFE-01', 'name', 'Backdating must be verifiable', 'enabled', true),
    jsonb_build_object('code', 'SAFE-02', 'name', 'Dispute tasks require evidence upload', 'enabled', true),
    jsonb_build_object('code', 'SAFE-03', 'name', 'Legal-sensitive workflows require human review', 'enabled', true),
    jsonb_build_object('code', 'SAFE-04', 'name', 'No fraud enablement', 'enabled', true),
    jsonb_build_object('code', 'SAFE-05', 'name', 'Platform terms/privacy compliance for lead gen/outreach', 'enabled', true)
  )
)
on conflict (singleton_key) do nothing;
