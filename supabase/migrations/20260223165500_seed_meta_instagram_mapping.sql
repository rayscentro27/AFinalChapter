-- Seed/repair Instagram Meta channel mapping for Unified Inbox tenant resolution.

insert into public.channel_accounts (
  tenant_id,
  provider,
  external_account_id,
  display_name,
  metadata,
  is_active
)
values (
  'ff88f4f5-1e15-4773-8093-ff0e95cfa9d6'::uuid,
  'meta',
  '17841480265043148',
  'Clear Credentials (Instagram)',
  jsonb_build_object('source', 'migration', 'asset_type', 'instagram_business_account'),
  true
)
on conflict (provider, external_account_id)
do update set
  tenant_id = excluded.tenant_id,
  display_name = excluded.display_name,
  metadata = coalesce(public.channel_accounts.metadata, '{}'::jsonb) || excluded.metadata,
  is_active = true,
  updated_at = now();
