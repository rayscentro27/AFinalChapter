-- Provider real-id migration for stable outbound keys + inbound idempotency.

alter table public.messages
  add column if not exists provider_message_id_real text;
create index if not exists messages_provider_real_idx
  on public.messages (tenant_id, provider, provider_message_id_real);
-- Remove old uniqueness on internal provider_message_id if it exists.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.messages'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute where attrelid='public.messages'::regclass and attname='tenant_id'),
        (select attnum from pg_attribute where attrelid='public.messages'::regclass and attname='provider'),
        (select attnum from pg_attribute where attrelid='public.messages'::regclass and attname='provider_message_id')
      ]
  loop
    execute format('alter table public.messages drop constraint %I', c.conname);
  end loop;
end $$;
create unique index if not exists messages_unique_provider_real
  on public.messages (tenant_id, provider, provider_message_id_real)
  where provider_message_id_real is not null;
