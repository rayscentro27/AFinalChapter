-- Backfill metadata.meta_object for existing Meta channel account mappings.
-- Keep any explicit value that is already set.

update public.channel_accounts
set metadata = jsonb_set(
  coalesce(metadata, '{}'::jsonb),
  '{meta_object}',
  to_jsonb('instagram'::text),
  true
)
where provider = 'meta'
  and coalesce(metadata->>'meta_object', '') = ''
  and (
    lower(coalesce(metadata->>'asset_type', '')) = 'instagram_business_account'
    or lower(coalesce(metadata->>'channel', '')) = 'instagram'
    or coalesce(display_name, '') ilike '%instagram%'
    or external_account_id like '178%'
  );

update public.channel_accounts
set metadata = jsonb_set(
  coalesce(metadata, '{}'::jsonb),
  '{meta_object}',
  to_jsonb('page'::text),
  true
)
where provider = 'meta'
  and coalesce(metadata->>'meta_object', '') = '';
